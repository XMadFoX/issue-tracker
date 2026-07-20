import { createId } from "@paralleldrive/cuid2";
import { db } from "db";
import { cycle } from "db/features/tracker/cycles.schema";
import {
	issueStatus,
	issueStatusGroup,
} from "db/features/tracker/issue-statuses.schema";
import { issueType } from "db/features/tracker/issue-types.schema";
import { issue } from "db/features/tracker/issues.schema";
import { team } from "db/features/tracker/tracker.schema";
import { and, count, desc, eq, sql } from "drizzle-orm";
import z from "zod";
import { authedRouter } from "../../context";
import { isAllowed } from "../../lib/abac";
import { isValidIanaTimezone } from "../../lib/timezone";
import { writeIssueActivity } from "../issues/activity";
import { issuePublisher } from "../issues/publisher";
import { getIssueWithRelations } from "../issues/queries";
import { completeCycle } from "./completion";
import {
	buildIssueTypeScopeChange,
	cycleBaselineActionTypes,
	cycleBaselineAssignmentActionTypes,
	normalizeIssueTypeMetrics,
} from "./metrics";
import {
	getNextCycleSequence,
	getOverlappingCycle,
	lockCycleTeam,
} from "./mutation";
import { deriveSchedulePreview } from "./schedule";
import {
	cycleAssignIssueSchema,
	cycleCompleteSchema,
	cycleCreateSchema,
	cycleDeleteSchema,
	cycleGetSchedulePreviewSchema,
	cycleGetSchema,
	cycleGetSettingsSchema,
	cycleListSchema,
	cycleMetricsSchema,
	cycleUnassignIssueSchema,
	cycleUpdateSchema,
	cycleUpdateSettingsSchema,
} from "./schema";
import {
	getScopedTeamCycleSettings,
	updateScopedTeamCycleSettings,
} from "./settings";

const issueTypeMetricRowsSchema = z.array(
	z.object({
		issueTypeId: z.string().nullable(),
		issueTypeName: z.string().nullable(),
		issueTypeKey: z.string().nullable(),
		issueTypeIcon: z.string().nullable(),
		issueTypeColor: z.string().nullable(),
		issueTypeArchivedAt: z.coerce.date().nullable(),
		issueCount: z.number(),
		completedIssueCount: z.number(),
		totalPoints: z.number(),
		completedPoints: z.number(),
	}),
);

const commonErrors = {
	UNAUTHORIZED: {
		status: 401,
		message: "You are not authorized to access this cycle.",
	},
	NOT_FOUND: {
		status: 404,
		message: "Cycle not found.",
	},
};

const writeErrors = {
	...commonErrors,
	INVALID_DATE_RANGE: {
		status: 400,
		message: "Cycle end date must be after the start date.",
	},
	CYCLE_OVERLAP: {
		status: 400,
		message: "Cycle dates overlap an existing cycle.",
	},
	INVALID_STATE_TRANSITION: {
		status: 400,
		message: "Cycle state cannot be changed to the requested state.",
	},
};

const completionErrors = {
	...commonErrors,
	CYCLE_ALREADY_COMPLETED: {
		status: 409,
		message: "Cycle has already been completed.",
	},
	CYCLE_CLOSED: {
		status: 400,
		message: "Cycle must be active to complete.",
	},
	INVALID_ROLLOVER_TARGET: {
		status: 400,
		message:
			"Rollover target must be a different planned or active team cycle.",
	},
	NO_ELIGIBLE_TARGET_CYCLE: {
		status: 400,
		message: "No eligible rollover target cycle is available.",
	},
	TEAM_MISMATCH: {
		status: 400,
		message: "Cycle and rollover target must belong to the same team.",
	},
};

const settingsErrors = {
	...commonErrors,
	SETTINGS_NOT_INITIALIZED: {
		status: 409,
		message: "Cycle settings are not initialized for this team.",
	},
	INVALID_WORKSPACE_TIMEZONE: {
		status: 400,
		message: "Workspace timezone is invalid.",
	},
	AUTOMATION_UNAVAILABLE: {
		status: 409,
		message: "Cycle automation is not available yet.",
	},
};

const assignErrors = {
	...commonErrors,
	TEAM_MISMATCH: {
		status: 400,
		message: "Issue and cycle must belong to the same team.",
	},
	CYCLE_CLOSED: {
		status: 400,
		message: "Cannot assign issues to a closed cycle.",
	},
};

type CycleState = "planned" | "active" | "completed" | "canceled";

function parseDate(value: string) {
	return new Date(value);
}

function addDays(date: Date, days: number) {
	const nextDate = new Date(date);
	nextDate.setUTCDate(nextDate.getUTCDate() + days);
	return nextDate;
}

function validateDateRange(startDate: Date, endDate: Date) {
	return endDate.getTime() > startDate.getTime();
}

function canTransitionCycleState(from: CycleState, to: CycleState) {
	if (from === to) return true;

	switch (from) {
		case "planned":
			return to === "active" || to === "canceled";
		case "active":
			return to === "canceled";
		case "completed":
		case "canceled":
			return false;
	}
}

async function publishIssueUpdate(issueId: string, workspaceId: string) {
	const freshIssue = await getIssueWithRelations(issueId, workspaceId);
	if (!freshIssue) return;

	await issuePublisher.publish("issue:changed", {
		type: "update",
		workspaceId,
		teamId: freshIssue.teamId,
		issue: freshIssue,
	});
}

type PlannedCycleMetricsSqlInput = {
	workspaceId: string;
	teamId: string;
	cycleId: string;
	startDate: Date;
};

function buildPlannedCycleMetricsSql({
	workspaceId,
	teamId,
	cycleId,
	startDate,
}: PlannedCycleMetricsSqlInput) {
	// Planned metrics reconstruct a start-date baseline from activity events.
	// The latest assign/unassign event before the cycle start determines whether an
	// issue is planned; later status metrics only consider events after that same
	// baseline event to avoid counting a previous stint in the cycle. Timestamp ties
	// use activity id only as a deterministic best-effort fallback; true insertion
	// ordering would require a monotonic activity sequence.
	const plannedBaselineSql = sql`
		select distinct on (baseline.issue_id)
			baseline.issue_id,
			baseline.action_type,
			baseline.created_at as baseline_created_at,
			case
				when estimate_at_start.has_estimate_change
					and estimate_at_start.estimate_value ~ '^-?[0-9]+$'
					then estimate_at_start.estimate_value::integer
				when estimate_at_start.has_estimate_change
					then 0
				when baseline.metadata->>'estimate' ~ '^-?[0-9]+$'
					then (baseline.metadata->>'estimate')::integer
				else 0
			end as estimate,
			case
				when jsonb_typeof(type_at_start.to_value) = 'string'
					then type_at_start.to_value #>> '{}'
				when jsonb_typeof(baseline.metadata->'issueTypeId') = 'string'
					then baseline.metadata->>'issueTypeId'
				else null
			end as issue_type_id_at_start
		from issue_activity baseline
		left join lateral (
			select
				estimate_change.to_value #>> '{}' as estimate_value,
				true as has_estimate_change
			from issue_activity estimate_change
			where estimate_change.workspace_id = baseline.workspace_id
				and estimate_change.team_id = baseline.team_id
				and estimate_change.issue_id = baseline.issue_id
				and estimate_change.cycle_id = baseline.cycle_id
				and estimate_change.action_type = 'issue.estimate_changed'
				and estimate_change.created_at >= baseline.created_at
				and estimate_change.created_at <= ${startDate}
			order by estimate_change.created_at desc, estimate_change.id desc
			limit 1
		) estimate_at_start on true
		left join lateral (
			select type_change.to_value
			from issue_activity type_change
			where type_change.workspace_id = baseline.workspace_id
				and type_change.team_id = baseline.team_id
				and type_change.issue_id = baseline.issue_id
				and type_change.action_type = 'issue.updated'
				and type_change.field = 'issueTypeId'
				and type_change.created_at <= ${startDate}
			order by type_change.created_at desc, type_change.id desc
			limit 1
		) type_at_start on true
		where baseline.workspace_id = ${workspaceId}
			and baseline.team_id = ${teamId}
			and baseline.cycle_id = ${cycleId}
			and baseline.action_type in (${sql.join(
				cycleBaselineActionTypes.map((actionType) => sql`${actionType}`),
				sql`, `,
			)})
			and baseline.created_at <= ${startDate}
		order by baseline.issue_id, baseline.created_at desc, baseline.id desc
	`;
	const plannedLatestStatusSql = sql`
		select distinct on (status_change.issue_id)
			status_change.issue_id,
			status_change.metadata->>'toStatusCategory' as status_category,
			planned_baseline.estimate,
			planned_baseline.issue_type_id_at_start
		from issue_activity status_change
		inner join (${plannedBaselineSql}) planned_baseline
			on planned_baseline.issue_id = status_change.issue_id
			and planned_baseline.action_type in (${sql.join(
				cycleBaselineAssignmentActionTypes.map(
					(actionType) => sql`${actionType}`,
				),
				sql`, `,
			)})
		where status_change.workspace_id = ${workspaceId}
			and status_change.team_id = ${teamId}
			and status_change.cycle_id = ${cycleId}
			and status_change.action_type = 'issue.status_changed'
			and status_change.created_at >= planned_baseline.baseline_created_at
		order by status_change.issue_id, status_change.created_at desc, status_change.id desc
	`;

	return { plannedBaselineSql, plannedLatestStatusSql };
}

async function canUseCycle({
	userId,
	workspaceId,
	teamId,
}: {
	userId: string;
	workspaceId: string;
	teamId: string;
}) {
	const [canRead, canUpdate] = await Promise.all([
		isAllowed({
			userId,
			workspaceId,
			teamId,
			permissionKey: "cycle:read",
		}),
		isAllowed({
			userId,
			workspaceId,
			teamId,
			permissionKey: "cycle:update",
		}),
	]);

	return canRead || canUpdate;
}

const listCycles = authedRouter
	.input(cycleListSchema)
	.errors(commonErrors)
	.handler(async ({ context, input, errors }) => {
		const allowed = await isAllowed({
			userId: context.auth.session.userId,
			workspaceId: input.workspaceId,
			teamId: input.teamId,
			permissionKey: "cycle:read",
		});
		if (!allowed) throw errors.UNAUTHORIZED();

		const conditions = [
			eq(cycle.workspaceId, input.workspaceId),
			eq(cycle.teamId, input.teamId),
		];
		if (input.state) conditions.push(eq(cycle.state, input.state));

		return await db
			.select()
			.from(cycle)
			.where(and(...conditions))
			.orderBy(desc(cycle.sequence), desc(cycle.startDate))
			.limit(input.limit)
			.offset(input.offset);
	});

const getCycle = authedRouter
	.input(cycleGetSchema)
	.errors(commonErrors)
	.handler(async ({ context, input, errors }) => {
		const [row] = await db
			.select()
			.from(cycle)
			.where(
				and(eq(cycle.id, input.id), eq(cycle.workspaceId, input.workspaceId)),
			)
			.limit(1);
		if (!row) throw errors.NOT_FOUND();

		const allowed = await isAllowed({
			userId: context.auth.session.userId,
			workspaceId: input.workspaceId,
			teamId: row.teamId,
			permissionKey: "cycle:read",
		});
		if (!allowed) throw errors.UNAUTHORIZED();

		return row;
	});

const createCycle = authedRouter
	.input(cycleCreateSchema)
	.errors(writeErrors)
	.handler(async ({ context, input, errors }) => {
		const allowed = await isAllowed({
			userId: context.auth.session.userId,
			workspaceId: input.workspaceId,
			teamId: input.teamId,
			permissionKey: "cycle:create",
		});
		if (!allowed) throw errors.UNAUTHORIZED();

		const [teamRow] = await db
			.select({ id: team.id, cycleDuration: team.cycleDuration })
			.from(team)
			.where(
				and(eq(team.id, input.teamId), eq(team.workspaceId, input.workspaceId)),
			)
			.limit(1);
		if (!teamRow) throw errors.NOT_FOUND();

		const startDate = parseDate(input.startDate);
		const endDate = input.endDate
			? parseDate(input.endDate)
			: addDays(startDate, teamRow.cycleDuration ?? 14);
		if (!validateDateRange(startDate, endDate))
			throw errors.INVALID_DATE_RANGE();

		return await db.transaction(async (tx) => {
			await lockCycleTeam({
				tx,
				workspaceId: input.workspaceId,
				teamId: input.teamId,
			});

			const overlap = await getOverlappingCycle({
				tx,
				workspaceId: input.workspaceId,
				teamId: input.teamId,
				startDate,
				endDate,
			});
			if (overlap) throw errors.CYCLE_OVERLAP();

			const sequence = await getNextCycleSequence({
				tx,
				workspaceId: input.workspaceId,
				teamId: input.teamId,
			});

			const [created] = await tx
				.insert(cycle)
				.values({
					id: createId(),
					workspaceId: input.workspaceId,
					teamId: input.teamId,
					name: input.name ?? `Cycle ${sequence}`,
					sequence,
					startDate,
					endDate,
					capacity: input.capacity ?? null,
				})
				.returning();
			if (!created) throw errors.NOT_FOUND();

			return created;
		});
	});

const updateCycle = authedRouter
	.input(cycleUpdateSchema)
	.errors(writeErrors)
	.handler(async ({ context, input, errors }) => {
		const [existing] = await db
			.select()
			.from(cycle)
			.where(
				and(eq(cycle.id, input.id), eq(cycle.workspaceId, input.workspaceId)),
			)
			.limit(1);
		if (!existing) throw errors.NOT_FOUND();

		const permissionKey =
			input.state === "canceled" ? "cycle:complete" : "cycle:update";
		const allowed = await isAllowed({
			userId: context.auth.session.userId,
			workspaceId: input.workspaceId,
			teamId: existing.teamId,
			permissionKey,
		});
		if (!allowed) throw errors.UNAUTHORIZED();

		const startDate = input.startDate
			? parseDate(input.startDate)
			: existing.startDate;
		const endDate = input.endDate ? parseDate(input.endDate) : existing.endDate;
		if (!validateDateRange(startDate, endDate))
			throw errors.INVALID_DATE_RANGE();
		if (input.state && !canTransitionCycleState(existing.state, input.state)) {
			throw errors.INVALID_STATE_TRANSITION();
		}

		return await db.transaction(async (tx) => {
			await lockCycleTeam({
				tx,
				workspaceId: input.workspaceId,
				teamId: existing.teamId,
			});
			const [lockedExisting] = await tx
				.select({ state: cycle.state })
				.from(cycle)
				.where(
					and(eq(cycle.id, input.id), eq(cycle.workspaceId, input.workspaceId)),
				)
				.limit(1)
				.for("update");
			if (!lockedExisting) throw errors.NOT_FOUND();
			if (
				input.state &&
				!canTransitionCycleState(lockedExisting.state, input.state)
			) {
				throw errors.INVALID_STATE_TRANSITION();
			}

			const overlap = await getOverlappingCycle({
				tx,
				workspaceId: input.workspaceId,
				teamId: existing.teamId,
				startDate,
				endDate,
				excludeCycleId: input.id,
			});
			if (overlap) throw errors.CYCLE_OVERLAP();

			const [updated] = await tx
				.update(cycle)
				.set({
					...(input.name !== undefined ? { name: input.name } : {}),
					startDate,
					endDate,
					...(input.state !== undefined ? { state: input.state } : {}),
					...(input.capacity !== undefined ? { capacity: input.capacity } : {}),
					...(input.velocity !== undefined ? { velocity: input.velocity } : {}),
				})
				.where(
					and(eq(cycle.id, input.id), eq(cycle.workspaceId, input.workspaceId)),
				)
				.returning();
			if (!updated) throw errors.NOT_FOUND();

			return updated;
		});
	});

const completeCycleRoute = authedRouter
	.input(cycleCompleteSchema)
	.errors(completionErrors)
	.handler(async ({ context, input, errors }) => {
		const [source] = await db
			.select({ teamId: cycle.teamId })
			.from(cycle)
			.where(
				and(
					eq(cycle.id, input.cycleId),
					eq(cycle.workspaceId, input.workspaceId),
				),
			)
			.limit(1);
		if (!source) throw errors.NOT_FOUND();

		const [canComplete, canUpdateIssue] = await Promise.all([
			isAllowed({
				userId: context.auth.session.userId,
				workspaceId: input.workspaceId,
				teamId: source.teamId,
				permissionKey: "cycle:complete",
			}),
			isAllowed({
				userId: context.auth.session.userId,
				workspaceId: input.workspaceId,
				teamId: source.teamId,
				permissionKey: "issue:update",
			}),
		]);
		if (!canComplete || !canUpdateIssue) throw errors.UNAUTHORIZED();

		const result = await completeCycle({
			actorId: context.auth.session.userId,
			cycleId: input.cycleId,
			disposition: input.disposition,
			reason: "manual",
			teamId: source.teamId,
			workspaceId: input.workspaceId,
		});
		if (!result.ok) {
			switch (result.code) {
				case "CYCLE_ALREADY_COMPLETED":
					throw errors.CYCLE_ALREADY_COMPLETED();
				case "CYCLE_CLOSED":
					throw errors.CYCLE_CLOSED();
				case "INVALID_ROLLOVER_TARGET":
					throw errors.INVALID_ROLLOVER_TARGET();
				case "TEAM_MISMATCH":
					throw errors.TEAM_MISMATCH();
				case "NOT_FOUND":
					throw errors.NOT_FOUND();
			}
		}

		for (const issueId of result.affectedIssueIds) {
			await publishIssueUpdate(issueId, input.workspaceId);
		}
		return {
			...result,
			affectedCycleIds: [
				result.source.id,
				...(result.destinationCycleId ? [result.destinationCycleId] : []),
			],
		};
	});

const deleteCycle = authedRouter
	.input(cycleDeleteSchema)
	.errors(commonErrors)
	.handler(async ({ context, input, errors }) => {
		const [existing] = await db
			.select({ teamId: cycle.teamId })
			.from(cycle)
			.where(
				and(eq(cycle.id, input.id), eq(cycle.workspaceId, input.workspaceId)),
			)
			.limit(1);
		if (!existing) throw errors.NOT_FOUND();

		const allowed = await isAllowed({
			userId: context.auth.session.userId,
			workspaceId: input.workspaceId,
			teamId: existing.teamId,
			permissionKey: "cycle:delete",
		});
		if (!allowed) throw errors.UNAUTHORIZED();

		const [deleted] = await db
			.delete(cycle)
			.where(
				and(eq(cycle.id, input.id), eq(cycle.workspaceId, input.workspaceId)),
			)
			.returning();
		if (!deleted) throw errors.NOT_FOUND();

		return deleted;
	});

const assignIssue = authedRouter
	.input(cycleAssignIssueSchema)
	.errors(assignErrors)
	.handler(async ({ context, input, errors }) => {
		const updated = await db.transaction(async (tx) => {
			const [cycleRow] = await tx
				.select()
				.from(cycle)
				.where(
					and(
						eq(cycle.id, input.cycleId),
						eq(cycle.workspaceId, input.workspaceId),
					),
				)
				.limit(1)
				.for("update");
			if (!cycleRow) throw errors.NOT_FOUND();
			if (cycleRow.state === "completed" || cycleRow.state === "canceled") {
				throw errors.CYCLE_CLOSED();
			}

			const [issueRow] = await tx
				.select({
					id: issue.id,
					teamId: issue.teamId,
					cycleId: issue.cycleId,
					estimate: issue.estimate,
					issueTypeId: issue.issueTypeId,
				})
				.from(issue)
				.where(
					and(
						eq(issue.id, input.issueId),
						eq(issue.workspaceId, input.workspaceId),
					),
				)
				.limit(1)
				.for("update");
			if (!issueRow) throw errors.NOT_FOUND();
			if (issueRow.teamId !== cycleRow.teamId) throw errors.TEAM_MISMATCH();

			const canUpdateIssue = await isAllowed({
				userId: context.auth.session.userId,
				workspaceId: input.workspaceId,
				teamId: issueRow.teamId,
				permissionKey: "issue:update",
			});
			const canAssignCycle = await canUseCycle({
				userId: context.auth.session.userId,
				workspaceId: input.workspaceId,
				teamId: cycleRow.teamId,
			});
			if (!canUpdateIssue || !canAssignCycle) throw errors.UNAUTHORIZED();

			const [row] = await tx
				.update(issue)
				.set({ cycleId: input.cycleId })
				.where(
					and(
						eq(issue.id, input.issueId),
						eq(issue.workspaceId, input.workspaceId),
					),
				)
				.returning();
			if (!row) throw errors.NOT_FOUND();

			if (issueRow.cycleId !== input.cycleId) {
				if (issueRow.cycleId !== null) {
					await writeIssueActivity(tx, {
						workspaceId: input.workspaceId,
						teamId: issueRow.teamId,
						issueId: input.issueId,
						actorId: context.auth.session.userId,
						cycleId: issueRow.cycleId,
						actionType: "issue.cycle_unassigned",
						field: "cycleId",
						fromValue: issueRow.cycleId,
						toValue: null,
						metadata: {
							estimate: issueRow.estimate,
							issueTypeId: issueRow.issueTypeId,
							cycleId: issueRow.cycleId,
						},
					});
				}

				await writeIssueActivity(tx, {
					workspaceId: input.workspaceId,
					teamId: issueRow.teamId,
					issueId: input.issueId,
					actorId: context.auth.session.userId,
					cycleId: input.cycleId,
					actionType: "issue.cycle_assigned",
					field: "cycleId",
					fromValue: issueRow.cycleId,
					toValue: input.cycleId,
					metadata: {
						estimate: row.estimate,
						issueTypeId: row.issueTypeId,
						cycleId: input.cycleId,
					},
				});
			}

			return row;
		});

		await publishIssueUpdate(input.issueId, input.workspaceId);
		return updated;
	});

const unassignIssue = authedRouter
	.input(cycleUnassignIssueSchema)
	.errors(assignErrors)
	.handler(async ({ context, input, errors }) => {
		const updated = await db.transaction(async (tx) => {
			const [issueRow] = await tx
				.select({
					id: issue.id,
					teamId: issue.teamId,
					cycleId: issue.cycleId,
					estimate: issue.estimate,
					issueTypeId: issue.issueTypeId,
				})
				.from(issue)
				.where(
					and(
						eq(issue.id, input.issueId),
						eq(issue.workspaceId, input.workspaceId),
					),
				)
				.limit(1)
				.for("update");
			if (!issueRow) throw errors.NOT_FOUND();

			if (input.cycleId && issueRow.cycleId !== input.cycleId) {
				throw errors.NOT_FOUND();
			}

			const canUpdateIssue = await isAllowed({
				userId: context.auth.session.userId,
				workspaceId: input.workspaceId,
				teamId: issueRow.teamId,
				permissionKey: "issue:update",
			});
			const canUnassignCycle = issueRow.cycleId
				? await canUseCycle({
						userId: context.auth.session.userId,
						workspaceId: input.workspaceId,
						teamId: issueRow.teamId,
					})
				: true;
			if (!canUpdateIssue || !canUnassignCycle) throw errors.UNAUTHORIZED();

			const [row] = await tx
				.update(issue)
				.set({ cycleId: null })
				.where(
					and(
						eq(issue.id, input.issueId),
						eq(issue.workspaceId, input.workspaceId),
					),
				)
				.returning();
			if (!row) throw errors.NOT_FOUND();

			if (issueRow.cycleId !== null) {
				await writeIssueActivity(tx, {
					workspaceId: input.workspaceId,
					teamId: issueRow.teamId,
					issueId: input.issueId,
					actorId: context.auth.session.userId,
					cycleId: issueRow.cycleId,
					actionType: "issue.cycle_unassigned",
					field: "cycleId",
					fromValue: issueRow.cycleId,
					toValue: null,
					metadata: {
						estimate: issueRow.estimate,
						issueTypeId: issueRow.issueTypeId,
						cycleId: issueRow.cycleId,
					},
				});
			}

			return row;
		});

		await publishIssueUpdate(input.issueId, input.workspaceId);
		return updated;
	});

const getSettings = authedRouter
	.input(cycleGetSettingsSchema)
	.errors(settingsErrors)
	.handler(async ({ context, input, errors }) => {
		const scoped = await getScopedTeamCycleSettings({
			executor: db,
			workspaceId: input.workspaceId,
			teamId: input.teamId,
		});
		if (!scoped) throw errors.NOT_FOUND();

		const [canRead, canManageSettings] = await Promise.all([
			isAllowed({
				userId: context.auth.session.userId,
				workspaceId: input.workspaceId,
				teamId: scoped.team.id,
				permissionKey: "cycle:read",
			}),
			isAllowed({
				userId: context.auth.session.userId,
				workspaceId: input.workspaceId,
				teamId: scoped.team.id,
				permissionKey: "cycle:manage_settings",
			}),
		]);
		if (!canRead) throw errors.UNAUTHORIZED();
		if (!scoped.settings) throw errors.SETTINGS_NOT_INITIALIZED();

		return {
			settings: scoped.settings,
			workspaceTimezone: scoped.workspaceTimezone,
			canManageSettings,
		};
	});

const getSchedulePreview = authedRouter
	.input(cycleGetSchedulePreviewSchema)
	.errors(settingsErrors)
	.handler(async ({ context, input, errors }) => {
		const scoped = await getScopedTeamCycleSettings({
			executor: db,
			workspaceId: input.workspaceId,
			teamId: input.teamId,
		});
		if (!scoped) throw errors.NOT_FOUND();

		const allowed = await isAllowed({
			userId: context.auth.session.userId,
			workspaceId: input.workspaceId,
			teamId: scoped.team.id,
			permissionKey: "cycle:read",
		});
		if (!allowed) throw errors.UNAUTHORIZED();
		if (!scoped.settings) throw errors.SETTINGS_NOT_INITIALIZED();
		if (!isValidIanaTimezone(scoped.workspaceTimezone)) {
			throw errors.INVALID_WORKSPACE_TIMEZONE();
		}

		return deriveSchedulePreview({
			workspaceTimezone: scoped.workspaceTimezone,
			settings: scoped.settings,
			now: new Date(),
		});
	});

const updateSettings = authedRouter
	.input(cycleUpdateSettingsSchema)
	.errors(settingsErrors)
	.handler(async ({ context, input, errors }) => {
		const scoped = await getScopedTeamCycleSettings({
			executor: db,
			workspaceId: input.workspaceId,
			teamId: input.teamId,
		});
		if (!scoped) throw errors.NOT_FOUND();

		const allowed = await isAllowed({
			userId: context.auth.session.userId,
			workspaceId: input.workspaceId,
			teamId: scoped.team.id,
			permissionKey: "cycle:manage_settings",
		});
		if (!allowed) throw errors.UNAUTHORIZED();
		if (!scoped.settings) throw errors.SETTINGS_NOT_INITIALIZED();
		if (!isValidIanaTimezone(scoped.workspaceTimezone)) {
			throw errors.INVALID_WORKSPACE_TIMEZONE();
		}
		if (input.cadenceEnabled) throw errors.AUTOMATION_UNAVAILABLE();

		const { teamId, workspaceId, ...settings } = input;
		const updated = await updateScopedTeamCycleSettings({
			executor: db,
			workspaceId,
			teamId,
			updatedBy: context.auth.session.userId,
			settings,
		});
		if (!updated) throw errors.SETTINGS_NOT_INITIALIZED();

		return {
			settings: updated,
			workspaceTimezone: scoped.workspaceTimezone,
			canManageSettings: true,
		};
	});

const cycleMetrics = authedRouter
	.input(cycleMetricsSchema)
	.errors(commonErrors)
	.handler(async ({ context, input, errors }) => {
		const [cycleRow] = await db
			.select()
			.from(cycle)
			.where(
				and(
					eq(cycle.id, input.cycleId),
					eq(cycle.workspaceId, input.workspaceId),
				),
			)
			.limit(1);
		if (!cycleRow) throw errors.NOT_FOUND();

		const allowed = await isAllowed({
			userId: context.auth.session.userId,
			workspaceId: input.workspaceId,
			teamId: cycleRow.teamId,
			permissionKey: "cycle:read",
		});
		if (!allowed) throw errors.UNAUTHORIZED();

		const [currentRow] = await db
			.select({
				issueCount: count(issue.id),
				completedIssueCount: sql<number>`count(${issue.id}) filter (where ${issueStatusGroup.canonicalCategory} = 'completed')::integer`,
				totalPoints: sql<number>`coalesce(sum(${issue.estimate}), 0)::integer`,
				completedPoints: sql<number>`coalesce(sum(${issue.estimate}) filter (where ${issueStatusGroup.canonicalCategory} = 'completed'), 0)::integer`,
			})
			.from(issue)
			.leftJoin(issueStatus, eq(issue.statusId, issueStatus.id))
			.leftJoin(
				issueStatusGroup,
				eq(issueStatus.statusGroupId, issueStatusGroup.id),
			)
			.where(
				and(
					eq(issue.workspaceId, input.workspaceId),
					eq(issue.teamId, cycleRow.teamId),
					eq(issue.cycleId, input.cycleId),
				),
			);

		const { plannedBaselineSql, plannedLatestStatusSql } =
			buildPlannedCycleMetricsSql({
				workspaceId: input.workspaceId,
				teamId: cycleRow.teamId,
				cycleId: input.cycleId,
				startDate: cycleRow.startDate,
			});

		const [currentIssueTypeRows, plannedIssueTypeRows] = await Promise.all([
			db
				.select({
					issueTypeId: issueType.id,
					issueTypeName: issueType.name,
					issueTypeKey: issueType.key,
					issueTypeIcon: issueType.icon,
					issueTypeColor: issueType.color,
					issueTypeArchivedAt: issueType.archivedAt,
					issueCount: count(issue.id),
					completedIssueCount: sql<number>`count(${issue.id}) filter (where ${issueStatusGroup.canonicalCategory} = 'completed')::integer`,
					totalPoints: sql<number>`coalesce(sum(${issue.estimate}), 0)::integer`,
					completedPoints: sql<number>`coalesce(sum(${issue.estimate}) filter (where ${issueStatusGroup.canonicalCategory} = 'completed'), 0)::integer`,
				})
				.from(issue)
				.leftJoin(issueType, eq(issue.issueTypeId, issueType.id))
				.leftJoin(issueStatus, eq(issue.statusId, issueStatus.id))
				.leftJoin(
					issueStatusGroup,
					eq(issueStatus.statusGroupId, issueStatusGroup.id),
				)
				.where(
					and(
						eq(issue.workspaceId, input.workspaceId),
						eq(issue.teamId, cycleRow.teamId),
						eq(issue.cycleId, input.cycleId),
					),
				)
				.groupBy(
					issueType.id,
					issueType.name,
					issueType.key,
					issueType.icon,
					issueType.color,
					issueType.archivedAt,
				),
			(async () => {
				const result = await db.execute(sql`
					select
						issue_type.id as "issueTypeId",
						issue_type.name as "issueTypeName",
						issue_type.key as "issueTypeKey",
						issue_type.icon as "issueTypeIcon",
						issue_type.color as "issueTypeColor",
						issue_type.archived_at as "issueTypeArchivedAt",
						count(*)::integer as "issueCount",
						count(*) filter (where planned_latest_status.status_category = 'completed')::integer as "completedIssueCount",
						coalesce(sum(planned_baseline.estimate), 0)::integer as "totalPoints",
						coalesce(sum(planned_baseline.estimate) filter (where planned_latest_status.status_category = 'completed'), 0)::integer as "completedPoints"
					from (${plannedBaselineSql}) planned_baseline
					left join issue_type
						on issue_type.id = planned_baseline.issue_type_id_at_start
					left join (${plannedLatestStatusSql}) planned_latest_status
						on planned_latest_status.issue_id = planned_baseline.issue_id
					where planned_baseline.action_type in (${sql.join(
						cycleBaselineAssignmentActionTypes.map(
							(actionType) => sql`${actionType}`,
						),
						sql`, `,
					)})
					group by
						issue_type.id,
						issue_type.name,
						issue_type.key,
						issue_type.icon,
						issue_type.color,
						issue_type.archived_at
				`);
				return issueTypeMetricRowsSchema.parse(result.rows);
			})(),
		]);

		const [activityRow] = await db
			.select({
				issueCount: sql<number>`coalesce((select count(*)::integer from (${plannedBaselineSql}) planned_baseline where planned_baseline.action_type in (${sql.join(
					cycleBaselineAssignmentActionTypes.map(
						(actionType) => sql`${actionType}`,
					),
					sql`, `,
				)})), 0)`,
				totalPoints: sql<number>`coalesce((select sum(planned_baseline.estimate)::integer from (${plannedBaselineSql}) planned_baseline where planned_baseline.action_type in (${sql.join(
					cycleBaselineAssignmentActionTypes.map(
						(actionType) => sql`${actionType}`,
					),
					sql`, `,
				)})), 0)`,
				completedPoints: sql<number>`coalesce((select sum(planned_latest_status.estimate)::integer from (${plannedLatestStatusSql}) planned_latest_status where planned_latest_status.status_category = 'completed'), 0)`,
				completedIssueCount: sql<number>`coalesce((select count(*)::integer from (${plannedLatestStatusSql}) planned_latest_status where planned_latest_status.status_category = 'completed'), 0)`,
			})
			.from(cycle)
			.where(
				and(
					eq(cycle.id, input.cycleId),
					eq(cycle.workspaceId, input.workspaceId),
				),
			);

		const currentIssueCount = currentRow?.issueCount ?? 0;
		const currentCompletedIssueCount = currentRow?.completedIssueCount ?? 0;
		const currentTotalPoints = currentRow?.totalPoints ?? 0;
		const currentCompletedPoints = currentRow?.completedPoints ?? 0;
		const currentCompletionRate =
			currentIssueCount === 0
				? 0
				: currentCompletedIssueCount / currentIssueCount;

		const plannedIssueCount = activityRow?.issueCount ?? 0;
		const plannedCompletedIssueCount = activityRow?.completedIssueCount ?? 0;
		const plannedTotalPoints = activityRow?.totalPoints ?? 0;
		const plannedCompletedPoints = activityRow?.completedPoints ?? 0;
		const plannedCompletionRate =
			plannedIssueCount === 0
				? 0
				: plannedCompletedIssueCount / plannedIssueCount;
		const currentByIssueType = normalizeIssueTypeMetrics(currentIssueTypeRows);
		const plannedByIssueType = normalizeIssueTypeMetrics(plannedIssueTypeRows);

		return {
			cycleId: input.cycleId,
			capacity: cycleRow.capacity,
			current: {
				issueCount: currentIssueCount,
				completedIssueCount: currentCompletedIssueCount,
				totalPoints: currentTotalPoints,
				completedPoints: currentCompletedPoints,
				completionRate: currentCompletionRate,
			},
			planned: {
				issueCount: plannedIssueCount,
				completedIssueCount: plannedCompletedIssueCount,
				totalPoints: plannedTotalPoints,
				completedPoints: plannedCompletedPoints,
				completionRate: plannedCompletionRate,
			},
			scopeChange: {
				issueCountDelta: currentIssueCount - plannedIssueCount,
				pointsDelta: currentTotalPoints - plannedTotalPoints,
			},
			byIssueType: {
				current: currentByIssueType,
				planned: plannedByIssueType,
				scopeChange: buildIssueTypeScopeChange(
					currentByIssueType,
					plannedByIssueType,
				),
			},
		};
	});

export const cycleRouter = {
	list: listCycles,
	get: getCycle,
	create: createCycle,
	update: updateCycle,
	complete: completeCycleRoute,
	delete: deleteCycle,
	assignIssue,
	unassignIssue,
	getSettings,
	getSchedulePreview,
	updateSettings,
	metrics: cycleMetrics,
};
