import { db } from "db";
import { cycleScheduleJob } from "db/features/tracker/cycle-schedule-jobs.schema";
import { cycle } from "db/features/tracker/cycles.schema";
import { teamCycleSettings } from "db/features/tracker/team-cycle-settings.schema";
import { team, workspace } from "db/features/tracker/tracker.schema";
import { and, asc, eq, gte, ne } from "drizzle-orm";
import {
	type CompletionResult,
	completeCycleInTransaction,
} from "./completion";
import {
	maintainPlannedCycleHorizonInTransaction,
	type PlannedCycleHorizonResult,
} from "./generation";
import { type CycleTransaction, lockCycleTeam } from "./mutation";
import { deriveScheduleActionTiming, type ScheduleSettings } from "./schedule";

export type ScheduledLifecycleJobInput = {
	workspaceId: string;
	teamId: string;
	cycleId: string;
	scheduledBoundary: Date;
	eventRevisionAt: Date;
	now: Date;
};

export type StartScheduledCycleResult =
	| { status: "started" }
	| { status: "already_started" }
	| { status: "blocked"; activeCycleId: string }
	| { status: "not_found" }
	| { status: "not_due" }
	| { status: "obsolete_settings" }
	| { status: "obsolete_cycle_state" }
	| { status: "invalid_provenance" };

export type CompleteScheduledCycleInput = ScheduledLifecycleJobInput & {
	jobId: string;
};

type GenerationFailureStatus = Exclude<
	PlannedCycleHorizonResult["status"],
	"created" | "already_satisfied"
>;

export type CompleteScheduledCycleResult =
	| {
			status: "completed";
			completion: Extract<CompletionResult, { ok: true }>;
	  }
	| { status: "already_completed" }
	| { status: "not_found" }
	| { status: "not_due" }
	| { status: "obsolete_settings" }
	| { status: "obsolete_cycle_state" }
	| { status: "invalid_provenance" }
	| { status: "invalid_job_identity" }
	| { status: "generation_failed"; generationStatus: GenerationFailureStatus }
	| { status: "no_rollover_target" }
	| {
			status: "completion_failed";
			completionCode: Extract<CompletionResult, { ok: false }>["code"];
	  };

type LockedLifecycleState = {
	cycleRow: typeof cycle.$inferSelect;
	settings: typeof teamCycleSettings.$inferSelect | null;
	workspaceTimezone: string;
};

function sameInstant(left: Date | null, right: Date): boolean {
	return left?.getTime() === right.getTime();
}

function scheduleSettings(
	settings: typeof teamCycleSettings.$inferSelect,
): ScheduleSettings {
	return {
		cadenceEnabled: settings.cadenceEnabled,
		cadenceDays: settings.cadenceDays,
		anchorDate: settings.anchorDate,
		endBehavior: settings.endBehavior,
		gracePeriodMinutes: settings.gracePeriodMinutes,
		reminderLeadMinutes: settings.reminderLeadMinutes,
	};
}

async function lockLifecycleState(
	tx: CycleTransaction,
	input: ScheduledLifecycleJobInput,
): Promise<LockedLifecycleState | null> {
	await lockCycleTeam({
		tx,
		workspaceId: input.workspaceId,
		teamId: input.teamId,
	});
	const [scope] = await tx
		.select({ workspaceTimezone: workspace.timezone })
		.from(team)
		.innerJoin(workspace, eq(team.workspaceId, workspace.id))
		.where(
			and(eq(team.id, input.teamId), eq(team.workspaceId, input.workspaceId)),
		)
		.limit(1)
		.for("update");
	if (!scope) return null;
	const [settings] = await tx
		.select()
		.from(teamCycleSettings)
		.where(eq(teamCycleSettings.teamId, input.teamId))
		.limit(1)
		.for("update");
	const [cycleRow] = await tx
		.select()
		.from(cycle)
		.where(
			and(
				eq(cycle.id, input.cycleId),
				eq(cycle.workspaceId, input.workspaceId),
				eq(cycle.teamId, input.teamId),
			),
		)
		.limit(1)
		.for("update");
	if (!cycleRow) return null;
	return {
		cycleRow,
		settings: settings ?? null,
		workspaceTimezone: scope.workspaceTimezone,
	};
}

async function startScheduledCycleInTransaction(
	tx: CycleTransaction,
	input: ScheduledLifecycleJobInput,
): Promise<StartScheduledCycleResult> {
	const state = await lockLifecycleState(tx, input);
	if (!state) return { status: "not_found" };
	const { cycleRow, settings } = state;
	if (
		cycleRow.origin !== "scheduled" ||
		!sameInstant(cycleRow.scheduledBoundary, cycleRow.startDate) ||
		!sameInstant(cycleRow.startDate, input.scheduledBoundary)
	) {
		return { status: "invalid_provenance" };
	}
	if (cycleRow.state === "active") return { status: "already_started" };
	if (cycleRow.state !== "planned") return { status: "obsolete_cycle_state" };
	if (
		!settings?.cadenceEnabled ||
		!sameInstant(settings.updatedAt, input.eventRevisionAt)
	) {
		return { status: "obsolete_settings" };
	}
	if (input.now < cycleRow.startDate) return { status: "not_due" };

	const [activeCycle] = await tx
		.select({ id: cycle.id })
		.from(cycle)
		.where(
			and(
				eq(cycle.workspaceId, input.workspaceId),
				eq(cycle.teamId, input.teamId),
				eq(cycle.state, "active"),
				ne(cycle.id, input.cycleId),
			),
		)
		.limit(1)
		.for("update");
	if (activeCycle) {
		return { status: "blocked", activeCycleId: activeCycle.id };
	}
	await tx
		.update(cycle)
		.set({ state: "active" })
		.where(and(eq(cycle.id, input.cycleId), eq(cycle.state, "planned")));
	return { status: "started" };
}

export async function startScheduledCycle(
	input: ScheduledLifecycleJobInput,
): Promise<StartScheduledCycleResult> {
	return await db.transaction((tx) =>
		startScheduledCycleInTransaction(tx, input),
	);
}

class ScheduledCompletionRollback extends Error {
	readonly result: CompleteScheduledCycleResult;

	constructor(result: CompleteScheduledCycleResult) {
		super(result.status);
		this.result = result;
	}
}

async function completeScheduledCycleInTransaction(
	tx: CycleTransaction,
	input: CompleteScheduledCycleInput,
): Promise<CompleteScheduledCycleResult> {
	const state = await lockLifecycleState(tx, input);
	if (!state) return { status: "not_found" };
	const { cycleRow, settings, workspaceTimezone } = state;
	const [job] = await tx
		.select({ id: cycleScheduleJob.id })
		.from(cycleScheduleJob)
		.where(
			and(
				eq(cycleScheduleJob.id, input.jobId),
				eq(cycleScheduleJob.workspaceId, input.workspaceId),
				eq(cycleScheduleJob.teamId, input.teamId),
				eq(cycleScheduleJob.cycleId, input.cycleId),
				eq(cycleScheduleJob.jobType, "complete_scheduled_cycle"),
				eq(cycleScheduleJob.scheduledBoundary, input.scheduledBoundary),
				eq(cycleScheduleJob.eventRevisionAt, input.eventRevisionAt),
			),
		)
		.limit(1)
		.for("update");
	if (!job) return { status: "invalid_job_identity" };
	if (
		cycleRow.origin !== "scheduled" ||
		!sameInstant(cycleRow.scheduledBoundary, cycleRow.startDate) ||
		!sameInstant(cycleRow.endDate, input.scheduledBoundary)
	) {
		return { status: "invalid_provenance" };
	}
	if (cycleRow.state === "completed") return { status: "already_completed" };
	if (cycleRow.state !== "active") return { status: "obsolete_cycle_state" };
	if (
		!settings?.cadenceEnabled ||
		settings.endBehavior !== "automatic" ||
		!sameInstant(settings.updatedAt, input.eventRevisionAt)
	) {
		return { status: "obsolete_settings" };
	}
	const timing = deriveScheduleActionTiming({
		workspaceTimezone,
		endDate: cycleRow.endDate,
		settings: scheduleSettings(settings),
	});
	const dueAt = timing.automaticCompletionDue;
	if (!dueAt || input.now < new Date(dueAt.utcIso)) {
		return { status: "not_due" };
	}

	const generation = await maintainPlannedCycleHorizonInTransaction({
		tx,
		workspaceId: input.workspaceId,
		teamId: input.teamId,
		now: input.now,
	});
	if (
		generation.status !== "created" &&
		generation.status !== "already_satisfied"
	) {
		return {
			status: "generation_failed",
			generationStatus: generation.status,
		};
	}

	let disposition:
		| { type: "carryOver"; targetCycleId: string }
		| { type: "moveToBacklog" } = { type: "moveToBacklog" };
	if (settings.defaultRolloverPolicy === "carry_over") {
		const [target] = await tx
			.select({ id: cycle.id })
			.from(cycle)
			.where(
				and(
					eq(cycle.workspaceId, input.workspaceId),
					eq(cycle.teamId, input.teamId),
					eq(cycle.state, "planned"),
					ne(cycle.id, input.cycleId),
					gte(cycle.startDate, cycleRow.endDate),
				),
			)
			.orderBy(asc(cycle.startDate), asc(cycle.id))
			.limit(1)
			.for("update");
		if (!target) {
			throw new ScheduledCompletionRollback({
				status: "no_rollover_target",
			});
		}
		disposition = { type: "carryOver", targetCycleId: target.id };
	}

	const completion = await completeCycleInTransaction(tx, {
		actorId: null,
		workspaceId: input.workspaceId,
		teamId: input.teamId,
		cycleId: input.cycleId,
		disposition,
		reason: "scheduled",
		scheduleJobId: input.jobId,
	});
	if (!completion.ok) {
		throw new ScheduledCompletionRollback({
			status: "completion_failed",
			completionCode: completion.code,
		});
	}
	return { status: "completed", completion };
}

export async function completeScheduledCycle(
	input: CompleteScheduledCycleInput,
): Promise<CompleteScheduledCycleResult> {
	try {
		return await db.transaction((tx) =>
			completeScheduledCycleInTransaction(tx, input),
		);
	} catch (error: unknown) {
		if (error instanceof ScheduledCompletionRollback) return error.result;
		throw error;
	}
}
