import { createId } from "@paralleldrive/cuid2";
import { db } from "db";
import { cycle } from "db/features/tracker/cycles.schema";
import { issueActivity } from "db/features/tracker/issue-activities.schema";
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
				completedIssueCount: sql<number>`count(${issue.id}) filter (where ${issueStatusGroup.canonicalCategory} = 'completed')`,
				plannedPoints: sql<number>`coalesce(sum(${issue.estimate}), 0)`,
				completedPoints: sql<number>`coalesce(sum(${issue.estimate}) filter (where ${issueStatusGroup.canonicalCategory} = 'completed'), 0)`,
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

		const [activityRow] = await db
			.select({
				plannedEventCount: sql<number>`count(*) filter (where ${issueActivity.actionType} = 'issue.cycle_assigned')`,
				issueCount: sql<number>`count(distinct ${issueActivity.issueId}) filter (where ${issueActivity.actionType} = 'issue.cycle_assigned')`,
				plannedPoints: sql<number>`coalesce(sum(coalesce((${issueActivity.metadata}->>'estimate')::integer, 0)) filter (where ${issueActivity.actionType} = 'issue.cycle_assigned'), 0)`,
				completedPoints: sql<number>`coalesce(sum(coalesce((${issueActivity.metadata}->>'estimate')::integer, 0)) filter (where ${issueActivity.actionType} = 'issue.status_changed' and ${issueActivity.metadata}->>'toStatusCategory' = 'completed'), 0)`,
				completedIssueCount: sql<number>`count(distinct ${issueActivity.issueId}) filter (where ${issueActivity.actionType} = 'issue.status_changed' and ${issueActivity.metadata}->>'toStatusCategory' = 'completed')`,
			})
			.from(issueActivity)
			.where(
				and(
					eq(issueActivity.workspaceId, input.workspaceId),
					eq(issueActivity.teamId, cycleRow.teamId),
					eq(issueActivity.cycleId, input.cycleId),
				),
			);

		const hasActivityScope = (activityRow?.plannedEventCount ?? 0) > 0;
		const issueCount = hasActivityScope
			? (activityRow?.issueCount ?? 0)
			: (currentRow?.issueCount ?? 0);
		const currentCompletedIssueCount = currentRow?.completedIssueCount ?? 0;
		const activityCompletedIssueCount = activityRow?.completedIssueCount ?? 0;
		const completedIssueCount = hasActivityScope
			? Math.max(activityCompletedIssueCount, currentCompletedIssueCount)
			: currentCompletedIssueCount;
		const plannedPoints = hasActivityScope
			? (activityRow?.plannedPoints ?? 0)
			: (currentRow?.plannedPoints ?? 0);
		const currentCompletedPoints = currentRow?.completedPoints ?? 0;
		const activityCompletedPoints = activityRow?.completedPoints ?? 0;
		const completedPoints = hasActivityScope
			? Math.max(activityCompletedPoints, currentCompletedPoints)
			: currentCompletedPoints;
		const completionRate =
			issueCount === 0 ? 0 : completedIssueCount / issueCount;

		return {
			cycleId: input.cycleId,
			capacity: cycleRow.capacity,
			plannedPoints,
			completedPoints,
			completionRate,
			issueCount,
			completedIssueCount,
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
