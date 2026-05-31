import { createId } from "@paralleldrive/cuid2";
import { db } from "db";
import { cycle } from "db/features/tracker/cycles.schema";
import {
	issueStatus,
	issueStatusGroup,
} from "db/features/tracker/issue-statuses.schema";
import { issue } from "db/features/tracker/issues.schema";
import { team } from "db/features/tracker/tracker.schema";
import { and, count, desc, eq, gt, lt, max, ne, sql } from "drizzle-orm";
import { authedRouter } from "../../context";
import { isAllowed } from "../../lib/abac";
import { writeIssueActivity } from "../issues/activity";
import { issuePublisher } from "../issues/publisher";
import { getIssueWithRelations } from "../issues/queries";
import {
	cycleAssignIssueSchema,
	cycleCreateSchema,
	cycleDeleteSchema,
	cycleGetSchema,
	cycleListSchema,
	cycleMetricsSchema,
	cycleUnassignIssueSchema,
	cycleUpdateSchema,
} from "./schema";

const commonErrors = {
	UNAUTHORIZED: {},
	NOT_FOUND: {},
};

const writeErrors = {
	...commonErrors,
	INVALID_DATE_RANGE: {},
	CYCLE_OVERLAP: {},
	INVALID_STATE_TRANSITION: {},
};

const assignErrors = {
	...commonErrors,
	TEAM_MISMATCH: {},
	CYCLE_CLOSED: {},
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
			return to === "completed" || to === "canceled";
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
			end as estimate
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
		where baseline.workspace_id = ${workspaceId}
			and baseline.team_id = ${teamId}
			and baseline.cycle_id = ${cycleId}
			and baseline.action_type in ('issue.cycle_assigned', 'issue.cycle_unassigned')
			and baseline.created_at <= ${startDate}
		order by baseline.issue_id, baseline.created_at desc, baseline.id desc
	`;
	const plannedLatestStatusSql = sql`
		select distinct on (status_change.issue_id)
			status_change.issue_id,
			status_change.metadata->>'toStatusCategory' as status_category,
			planned_baseline.estimate
		from issue_activity status_change
		inner join (${plannedBaselineSql}) planned_baseline
			on planned_baseline.issue_id = status_change.issue_id
			and planned_baseline.action_type = 'issue.cycle_assigned'
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
			await tx.execute(
				sql`select pg_advisory_xact_lock(hashtext(${`cycle:${input.workspaceId}:${input.teamId}`}))`,
			);

			const [overlap] = await tx
				.select({ id: cycle.id })
				.from(cycle)
				.where(
					and(
						eq(cycle.workspaceId, input.workspaceId),
						eq(cycle.teamId, input.teamId),
						ne(cycle.state, "canceled"),
						lt(cycle.startDate, endDate),
						gt(cycle.endDate, startDate),
					),
				)
				.limit(1)
				.for("update");
			if (overlap) throw errors.CYCLE_OVERLAP();

			const [maxRow] = await tx
				.select({ sequence: max(cycle.sequence) })
				.from(cycle)
				.where(
					and(
						eq(cycle.workspaceId, input.workspaceId),
						eq(cycle.teamId, input.teamId),
					),
				);
			const sequence = (maxRow?.sequence ?? 0) + 1;

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

		const allowed = await isAllowed({
			userId: context.auth.session.userId,
			workspaceId: input.workspaceId,
			teamId: existing.teamId,
			permissionKey: "cycle:update",
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
			await tx.execute(
				sql`select pg_advisory_xact_lock(hashtext(${`cycle:${input.workspaceId}:${existing.teamId}`}))`,
			);

			const [overlap] = await tx
				.select({ id: cycle.id })
				.from(cycle)
				.where(
					and(
						eq(cycle.workspaceId, input.workspaceId),
						eq(cycle.teamId, existing.teamId),
						ne(cycle.id, input.id),
						ne(cycle.state, "canceled"),
						lt(cycle.startDate, endDate),
						gt(cycle.endDate, startDate),
					),
				)
				.limit(1)
				.for("update");
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
						cycleId: issueRow.cycleId,
					},
				});
			}

			return row;
		});

		await publishIssueUpdate(input.issueId, input.workspaceId);
		return updated;
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

		const [activityRow] = await db
			.select({
				issueCount: sql<number>`coalesce((select count(*)::integer from (${plannedBaselineSql}) planned_baseline where planned_baseline.action_type = 'issue.cycle_assigned'), 0)`,
				totalPoints: sql<number>`coalesce((select sum(planned_baseline.estimate)::integer from (${plannedBaselineSql}) planned_baseline where planned_baseline.action_type = 'issue.cycle_assigned'), 0)`,
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
		};
	});

export const cycleRouter = {
	list: listCycles,
	get: getCycle,
	create: createCycle,
	update: updateCycle,
	delete: deleteCycle,
	assignIssue,
	unassignIssue,
	metrics: cycleMetrics,
};
