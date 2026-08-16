import { createId } from "@paralleldrive/cuid2";
import { db } from "db";
import { cycleScheduleJob } from "db/features/tracker/cycle-schedule-jobs.schema";
import { cycle } from "db/features/tracker/cycles.schema";
import { teamCycleSettings } from "db/features/tracker/team-cycle-settings.schema";
import { workspace } from "db/features/tracker/tracker.schema";
import { and, eq, inArray, ne, or, sql } from "drizzle-orm";
import { type CycleTransaction, lockCycleTeam } from "./mutation";
import { deriveScheduleActionTiming } from "./schedule";

export const START_LIFECYCLE_JOB_TYPE = "start_scheduled_cycle" as const;
export const COMPLETE_LIFECYCLE_JOB_TYPE = "complete_scheduled_cycle" as const;
export const LIFECYCLE_JOB_TYPES = [
	START_LIFECYCLE_JOB_TYPE,
	COMPLETE_LIFECYCLE_JOB_TYPE,
] as const;
export type LifecycleJobType = (typeof LIFECYCLE_JOB_TYPES)[number];

export type LifecycleEnqueueResult = { enqueued: number; skipped: number };

type ExpectedLifecycleJob = {
	jobType: LifecycleJobType;
	scheduledBoundary: Date;
	availableAt: Date;
};

export function isLifecycleJobType(value: string): value is LifecycleJobType {
	return (LIFECYCLE_JOB_TYPES as readonly string[]).includes(value);
}

function sameInstant(left: Date | null, right: Date): boolean {
	return left?.getTime() === right.getTime();
}

function completionAvailableAt(
	cycleRow: typeof cycle.$inferSelect,
	settings: typeof teamCycleSettings.$inferSelect,
	workspaceTimezone: string,
): Date | null {
	if (settings.endBehavior !== "automatic") return null;
	const timing = deriveScheduleActionTiming({
		workspaceTimezone,
		endDate: cycleRow.endDate,
		settings: {
			cadenceEnabled: settings.cadenceEnabled,
			cadenceDays: settings.cadenceDays,
			anchorDate: settings.anchorDate,
			endBehavior: settings.endBehavior,
			gracePeriodMinutes: settings.gracePeriodMinutes,
			reminderLeadMinutes: settings.reminderLeadMinutes,
		},
	});
	return timing.automaticCompletionDue
		? new Date(timing.automaticCompletionDue.utcIso)
		: null;
}

function expectedLifecycleJobs(
	cycleRow: typeof cycle.$inferSelect,
	settings: typeof teamCycleSettings.$inferSelect | null,
	workspaceTimezone: string,
): ExpectedLifecycleJob[] {
	if (
		!settings?.cadenceEnabled ||
		cycleRow.origin !== "scheduled" ||
		!sameInstant(cycleRow.scheduledBoundary, cycleRow.startDate)
	) {
		return [];
	}
	if (cycleRow.state === "planned") {
		return [
			{
				jobType: START_LIFECYCLE_JOB_TYPE,
				scheduledBoundary: cycleRow.startDate,
				availableAt: cycleRow.startDate,
			},
		];
	}
	if (cycleRow.state !== "active") return [];
	const availableAt = completionAvailableAt(
		cycleRow,
		settings,
		workspaceTimezone,
	);
	return availableAt
		? [
				{
					jobType: COMPLETE_LIFECYCLE_JOB_TYPE,
					scheduledBoundary: cycleRow.endDate,
					availableAt,
				},
			]
		: [];
}

async function hasActiveBlocker(
	tx: CycleTransaction,
	cycleRow: typeof cycle.$inferSelect,
): Promise<boolean> {
	const [active] = await tx
		.select({ id: cycle.id })
		.from(cycle)
		.where(
			and(
				eq(cycle.workspaceId, cycleRow.workspaceId),
				eq(cycle.teamId, cycleRow.teamId),
				eq(cycle.state, "active"),
				ne(cycle.id, cycleRow.id),
			),
		)
		.limit(1)
		.for("update");
	return Boolean(active);
}

/** Reconciles durable lifecycle jobs from state reloaded under the team lock. */
export async function enqueueLifecycleJobs({
	now,
}: {
	now: Date;
}): Promise<LifecycleEnqueueResult> {
	const candidates = await db
		.select({
			id: cycle.id,
			workspaceId: cycle.workspaceId,
			teamId: cycle.teamId,
		})
		.from(cycle)
		.where(eq(cycle.origin, "scheduled"));
	let enqueued = 0;
	let skipped = 0;
	for (const candidate of candidates) {
		const result = await db.transaction(async (tx) => {
			await lockCycleTeam({
				tx,
				workspaceId: candidate.workspaceId,
				teamId: candidate.teamId,
			});
			const [cycleRow] = await tx
				.select()
				.from(cycle)
				.where(
					and(
						eq(cycle.id, candidate.id),
						eq(cycle.workspaceId, candidate.workspaceId),
						eq(cycle.teamId, candidate.teamId),
					),
				)
				.limit(1)
				.for("update");
			if (!cycleRow) return { enqueued: 0, skipped: 1 };
			const [settings] = await tx
				.select()
				.from(teamCycleSettings)
				.where(eq(teamCycleSettings.teamId, cycleRow.teamId))
				.limit(1)
				.for("update");
			const [scope] = await tx
				.select({ timezone: workspace.timezone })
				.from(workspace)
				.where(eq(workspace.id, cycleRow.workspaceId))
				.limit(1);
			if (!scope) return { enqueued: 0, skipped: 1 };
			const expected = expectedLifecycleJobs(
				cycleRow,
				settings ?? null,
				scope.timezone,
			);
			const [current] = expected;
			const staleIdentity =
				current && settings
					? or(
							ne(cycleScheduleJob.jobType, current.jobType),
							ne(cycleScheduleJob.scheduledBoundary, current.scheduledBoundary),
							ne(cycleScheduleJob.eventRevisionAt, settings.updatedAt),
						)
					: sql`true`;
			await tx
				.update(cycleScheduleJob)
				.set({
					status: "succeeded",
					outcome: current ? "obsolete_settings" : "obsolete_cycle_state",
					finishedAt: now,
					leaseExpiresAt: null,
					workerId: null,
					claimToken: null,
					lastErrorCode: null,
					lastErrorSummary: null,
				})
				.where(
					and(
						eq(cycleScheduleJob.cycleId, cycleRow.id),
						inArray(cycleScheduleJob.jobType, [...LIFECYCLE_JOB_TYPES]),
						inArray(cycleScheduleJob.status, ["queued", "blocked", "failed"]),
						staleIdentity,
					),
				);
			if (!current || !settings) return { enqueued: 0, skipped: 1 };

			if (
				current.jobType === START_LIFECYCLE_JOB_TYPE &&
				!(await hasActiveBlocker(tx, cycleRow))
			) {
				await tx
					.update(cycleScheduleJob)
					.set({
						status: "queued",
						outcome: null,
						availableAt: current.availableAt > now ? current.availableAt : now,
						lastErrorCode: null,
						lastErrorSummary: null,
					})
					.where(
						and(
							eq(cycleScheduleJob.cycleId, cycleRow.id),
							eq(cycleScheduleJob.jobType, current.jobType),
							eq(cycleScheduleJob.scheduledBoundary, current.scheduledBoundary),
							eq(cycleScheduleJob.eventRevisionAt, settings.updatedAt),
							eq(cycleScheduleJob.status, "blocked"),
						),
					);
			}
			const inserted = await tx
				.insert(cycleScheduleJob)
				.values({
					id: createId(),
					workspaceId: cycleRow.workspaceId,
					teamId: cycleRow.teamId,
					cycleId: cycleRow.id,
					jobType: current.jobType,
					scheduledBoundary: current.scheduledBoundary,
					eventRevisionAt: settings.updatedAt,
					availableAt: current.availableAt,
				})
				.onConflictDoNothing({
					target: [
						cycleScheduleJob.cycleId,
						cycleScheduleJob.jobType,
						cycleScheduleJob.scheduledBoundary,
						cycleScheduleJob.eventRevisionAt,
					],
					where: sql`${cycleScheduleJob.jobType} <> 'generate_planned_cycles'`,
				})
				.returning({ id: cycleScheduleJob.id });
			return inserted.length > 0
				? { enqueued: 1, skipped: 0 }
				: { enqueued: 0, skipped: 1 };
		});
		enqueued += result.enqueued;
		skipped += result.skipped;
	}
	return { enqueued, skipped };
}

export type RetryLifecycleJobResult =
	| {
			status: "retried";
			jobId: string;
			teamId: string;
			jobType: LifecycleJobType;
	  }
	| { status: "not_found" }
	| { status: "not_failed" }
	| { status: "obsolete" };

export async function retryLifecycleJob({
	workspaceId,
	jobId,
	now,
}: {
	workspaceId: string;
	jobId: string;
	now: Date;
}): Promise<RetryLifecycleJobResult> {
	const [scope] = await db
		.select({ teamId: cycleScheduleJob.teamId })
		.from(cycleScheduleJob)
		.where(
			and(
				eq(cycleScheduleJob.id, jobId),
				eq(cycleScheduleJob.workspaceId, workspaceId),
				inArray(cycleScheduleJob.jobType, [...LIFECYCLE_JOB_TYPES]),
			),
		)
		.limit(1);
	if (!scope) return { status: "not_found" };
	return await db.transaction(async (tx) => {
		await lockCycleTeam({ tx, workspaceId, teamId: scope.teamId });
		const [job] = await tx
			.select()
			.from(cycleScheduleJob)
			.where(
				and(
					eq(cycleScheduleJob.id, jobId),
					eq(cycleScheduleJob.workspaceId, workspaceId),
					inArray(cycleScheduleJob.jobType, [...LIFECYCLE_JOB_TYPES]),
				),
			)
			.limit(1)
			.for("update");
		if (
			!job ||
			!isLifecycleJobType(job.jobType) ||
			!job.cycleId ||
			!job.eventRevisionAt
		) {
			return { status: "not_found" };
		}
		if (job.status !== "failed") return { status: "not_failed" };
		const [cycleRow] = await tx
			.select()
			.from(cycle)
			.where(
				and(
					eq(cycle.id, job.cycleId),
					eq(cycle.workspaceId, workspaceId),
					eq(cycle.teamId, job.teamId),
				),
			)
			.limit(1)
			.for("update");
		const [settings] = await tx
			.select()
			.from(teamCycleSettings)
			.where(eq(teamCycleSettings.teamId, job.teamId))
			.limit(1)
			.for("update");
		const [workspaceRow] = await tx
			.select({ timezone: workspace.timezone })
			.from(workspace)
			.where(eq(workspace.id, workspaceId))
			.limit(1);
		if (!cycleRow || !settings || !workspaceRow) {
			return { status: "obsolete" };
		}
		const [expected] = expectedLifecycleJobs(
			cycleRow,
			settings,
			workspaceRow.timezone,
		);
		if (
			!expected ||
			expected.jobType !== job.jobType ||
			!sameInstant(expected.scheduledBoundary, job.scheduledBoundary) ||
			!sameInstant(settings.updatedAt, job.eventRevisionAt)
		) {
			return { status: "obsolete" };
		}
		await tx
			.update(cycleScheduleJob)
			.set({
				status: "queued",
				attempts: 0,
				availableAt: expected.availableAt > now ? expected.availableAt : now,
				leaseExpiresAt: null,
				workerId: null,
				claimToken: null,
				startedAt: null,
				finishedAt: null,
				outcome: null,
				lastErrorCode: null,
				lastErrorSummary: null,
			})
			.where(eq(cycleScheduleJob.id, job.id));
		return {
			status: "retried",
			jobId: job.id,
			teamId: job.teamId,
			jobType: job.jobType,
		};
	});
}
