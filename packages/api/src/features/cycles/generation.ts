import { createId } from "@paralleldrive/cuid2";
import { db } from "db";
import { cycle } from "db/features/tracker/cycles.schema";
import { teamCycleSettings } from "db/features/tracker/team-cycle-settings.schema";
import { team, workspace } from "db/features/tracker/tracker.schema";
import { and, eq } from "drizzle-orm";
import { isValidIanaTimezone } from "../../lib/timezone";
import {
	type CycleTransaction,
	getNextCycleSequence,
	lockCycleTeam,
} from "./mutation";
import {
	cadenceOccurrenceAtBoundary,
	enumerateScheduledCycleOccurrences,
	type ScheduleSettings,
} from "./schedule";

type ScheduledCycle = typeof cycle.$inferSelect;
type ScheduledOccurrence = {
	boundary: Date;
	endDate: Date;
};

export type ScheduleCompatibilityReason =
	| "scheduled_cycles_require_resolution"
	| "active_cycle_conflict"
	| "manual_cycle_conflict";

export type ScheduleCompatibilityResult =
	| { status: "compatible" }
	| { status: "incompatible"; reason: ScheduleCompatibilityReason };

export type PlannedCycleHorizonResult =
	| { status: "team_not_found" }
	| { status: "settings_missing" }
	| { status: "disabled" }
	| { status: "anchor_required" }
	| { status: "invalid_timezone"; workspaceTimezone: string }
	| {
			status: "manual_cycle_conflict";
			cycleId: string;
			scheduledBoundary: Date;
	  }
	| {
			status: "scheduled_cycle_conflict";
			cycleId: string;
			scheduledBoundary: Date;
	  }
	| { status: "horizon_unreachable" }
	| {
			status: "already_satisfied";
			scheduledBoundaries: Date[];
	  }
	| {
			status: "created";
			created: ScheduledCycle[];
			scheduledBoundaries: Date[];
	  };

function toScheduleSettings(
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

function sameInstant(left: Date | null | undefined, right: Date): boolean {
	return left?.getTime() === right.getTime();
}

function hasSameBoundary(cycleRow: ScheduledCycle, boundary: Date): boolean {
	return sameInstant(cycleRow.scheduledBoundary, boundary);
}

function isExactScheduledOccurrence(
	cycleRow: ScheduledCycle,
	occurrence: ScheduledOccurrence,
): boolean {
	return (
		cycleRow.origin === "scheduled" &&
		hasSameBoundary(cycleRow, occurrence.boundary) &&
		sameInstant(cycleRow.startDate, occurrence.boundary) &&
		sameInstant(cycleRow.endDate, occurrence.endDate)
	);
}

function isExactPlannedOccurrence(
	cycleRow: ScheduledCycle,
	occurrence: ScheduledOccurrence,
): boolean {
	return (
		cycleRow.state === "planned" &&
		isExactScheduledOccurrence(cycleRow, occurrence)
	);
}

function overlaps({
	cycleRow,
	occurrence,
}: {
	cycleRow: ScheduledCycle;
	occurrence: ScheduledOccurrence;
}): boolean {
	return (
		cycleRow.state !== "canceled" &&
		cycleRow.startDate < occurrence.endDate &&
		cycleRow.endDate > occurrence.boundary
	);
}

function conflictFromCycle(
	cycleRow: ScheduledCycle,
	scheduledBoundary: Date,
):
	| {
			status: "manual_conflict";
			cycleId: string;
			scheduledBoundary: Date;
			state: ScheduledCycle["state"];
	  }
	| {
			status: "scheduled_conflict";
			cycleId: string;
			scheduledBoundary: Date;
			state: ScheduledCycle["state"];
	  } {
	return cycleRow.origin === "manual"
		? {
				status: "manual_conflict",
				cycleId: cycleRow.id,
				scheduledBoundary,
				state: cycleRow.state,
			}
		: {
				status: "scheduled_conflict",
				cycleId: cycleRow.id,
				scheduledBoundary,
				state: cycleRow.state,
			};
}

function uniqueBoundaries(cycles: ScheduledCycle[]): Date[] {
	return cycles
		.flatMap((cycleRow) =>
			cycleRow.scheduledBoundary ? [cycleRow.scheduledBoundary] : [],
		)
		.sort((left, right) => left.getTime() - right.getTime());
}

async function getLockedGenerationState({
	tx,
	workspaceId,
	teamId,
}: {
	tx: CycleTransaction;
	workspaceId: string;
	teamId: string;
}) {
	const [teamRow] = await tx
		.select({ id: team.id, workspaceTimezone: workspace.timezone })
		.from(team)
		.innerJoin(workspace, eq(team.workspaceId, workspace.id))
		.where(and(eq(team.id, teamId), eq(team.workspaceId, workspaceId)))
		.limit(1)
		.for("update");
	if (!teamRow) return null;

	const [settings] = await tx
		.select()
		.from(teamCycleSettings)
		.where(eq(teamCycleSettings.teamId, teamId))
		.limit(1)
		.for("update");
	const cycles = await tx
		.select()
		.from(cycle)
		.where(and(eq(cycle.workspaceId, workspaceId), eq(cycle.teamId, teamId)))
		.for("update");
	return { teamRow, settings: settings ?? null, cycles };
}

function findMissingOccurrences({
	cycles,
	occurrences,
	planningHorizon,
}: {
	cycles: ScheduledCycle[];
	occurrences: ScheduledOccurrence[];
	planningHorizon: number;
}):
	| { status: "satisfied"; scheduledBoundaries: Date[] }
	| { status: "unreachable" }
	| {
			status: "manual_conflict";
			cycleId: string;
			scheduledBoundary: Date;
			state: ScheduledCycle["state"];
	  }
	| {
			status: "scheduled_conflict";
			cycleId: string;
			scheduledBoundary: Date;
			state: ScheduledCycle["state"];
	  }
	| { status: "missing"; occurrences: ScheduledOccurrence[] } {
	const firstBoundary = occurrences[0]?.boundary;
	if (!firstBoundary) return { status: "unreachable" };

	const matchingPlanned: ScheduledCycle[] = [];
	const missing: ScheduledOccurrence[] = [];
	for (const occurrence of occurrences) {
		const matchingCycle = cycles.find((cycleRow) =>
			hasSameBoundary(cycleRow, occurrence.boundary),
		);
		if (matchingCycle) {
			if (isExactPlannedOccurrence(matchingCycle, occurrence)) {
				matchingPlanned.push(matchingCycle);
				if (matchingPlanned.length >= planningHorizon) {
					return {
						status: "satisfied",
						scheduledBoundaries: uniqueBoundaries(matchingPlanned),
					};
				}
				continue;
			}
			if (
				isExactScheduledOccurrence(matchingCycle, occurrence) &&
				matchingCycle.state !== "canceled"
			) {
				continue;
			}
			if (matchingCycle.state === "canceled") continue;
			return conflictFromCycle(matchingCycle, occurrence.boundary);
		}

		const overlap = cycles.find((cycleRow) =>
			overlaps({ cycleRow, occurrence }),
		);
		if (overlap) return conflictFromCycle(overlap, occurrence.boundary);

		missing.push(occurrence);
		if (matchingPlanned.length + missing.length === planningHorizon) {
			return { status: "missing", occurrences: missing };
		}
	}

	return { status: "unreachable" };
}

function toRequestedScheduleSettings(
	settings: CycleSettingsLike,
): ScheduleSettings {
	return {
		cadenceEnabled: settings.cadenceEnabled,
		cadenceDays: settings.cadenceDays,
		anchorDate: settings.anchorDate
			? settings.anchorDate instanceof Date
				? settings.anchorDate
				: new Date(settings.anchorDate)
			: null,
		endBehavior: settings.endBehavior,
		gracePeriodMinutes: settings.gracePeriodMinutes,
		reminderLeadMinutes: settings.reminderLeadMinutes,
	};
}

type CycleSettingsLike = {
	cadenceEnabled: boolean;
	cadenceDays: number;
	anchorDate: Date | string | null;
	planningHorizon: number;
	endBehavior: ScheduleSettings["endBehavior"];
	gracePeriodMinutes: number;
	reminderLeadMinutes: number;
};

function compatibilityReasonFromConflict(
	conflict:
		| {
				status: "manual_conflict";
				cycleId: string;
				scheduledBoundary: Date;
				state: ScheduledCycle["state"];
		  }
		| {
				status: "scheduled_conflict";
				cycleId: string;
				scheduledBoundary: Date;
				state: ScheduledCycle["state"];
		  },
): ScheduleCompatibilityReason {
	if (conflict.state === "active") return "active_cycle_conflict";
	if (conflict.status === "manual_conflict") return "manual_cycle_conflict";
	return "scheduled_cycles_require_resolution";
}

export function assessEnabledScheduleCompatibility({
	cycles,
	workspaceTimezone,
	settings,
	now,
}: {
	cycles: ScheduledCycle[];
	workspaceTimezone: string;
	settings: CycleSettingsLike;
	now: Date;
}): ScheduleCompatibilityResult {
	if (!settings.cadenceEnabled || !settings.anchorDate) {
		return { status: "compatible" };
	}

	const scheduleSettings = toRequestedScheduleSettings(settings);
	for (const cycleRow of cycles) {
		if (cycleRow.origin !== "scheduled" || cycleRow.state !== "planned") {
			continue;
		}
		if (!cycleRow.scheduledBoundary) {
			return {
				status: "incompatible",
				reason: "scheduled_cycles_require_resolution",
			};
		}
		const occurrence = cadenceOccurrenceAtBoundary({
			workspaceTimezone,
			settings: scheduleSettings,
			boundary: cycleRow.scheduledBoundary,
		});
		if (!occurrence || !isExactPlannedOccurrence(cycleRow, occurrence)) {
			return {
				status: "incompatible",
				reason: "scheduled_cycles_require_resolution",
			};
		}
	}

	const [firstOccurrence] = enumerateScheduledCycleOccurrences({
		workspaceTimezone,
		settings: scheduleSettings,
		now,
		count: 1,
	});
	if (!firstOccurrence) {
		return {
			status: "incompatible",
			reason: "scheduled_cycles_require_resolution",
		};
	}
	const persistedIdentityCount = cycles.filter(
		(cycleRow) =>
			cycleRow.origin === "scheduled" &&
			cycleRow.scheduledBoundary !== null &&
			cycleRow.scheduledBoundary >= firstOccurrence.boundary,
	).length;
	const occurrences = enumerateScheduledCycleOccurrences({
		workspaceTimezone,
		settings: scheduleSettings,
		now,
		count: settings.planningHorizon + persistedIdentityCount,
	});
	const reconciliation = findMissingOccurrences({
		cycles,
		occurrences,
		planningHorizon: settings.planningHorizon,
	});
	if (
		reconciliation.status === "manual_conflict" ||
		reconciliation.status === "scheduled_conflict"
	) {
		return {
			status: "incompatible",
			reason: compatibilityReasonFromConflict(reconciliation),
		};
	}
	return { status: "compatible" };
}

export async function maintainPlannedCycleHorizonInTransaction({
	tx,
	workspaceId,
	teamId,
	now,
}: {
	tx: CycleTransaction;
	workspaceId: string;
	teamId: string;
	now: Date;
}): Promise<PlannedCycleHorizonResult> {
	await lockCycleTeam({ tx, workspaceId, teamId });
	const state = await getLockedGenerationState({ tx, workspaceId, teamId });
	if (!state) return { status: "team_not_found" };
	if (!state.settings) return { status: "settings_missing" };
	if (!state.settings.cadenceEnabled) return { status: "disabled" };
	if (!state.settings.anchorDate) return { status: "anchor_required" };
	if (!isValidIanaTimezone(state.teamRow.workspaceTimezone)) {
		return {
			status: "invalid_timezone",
			workspaceTimezone: state.teamRow.workspaceTimezone,
		};
	}

	const settings = toScheduleSettings(state.settings);
	const [firstOccurrence] = enumerateScheduledCycleOccurrences({
		workspaceTimezone: state.teamRow.workspaceTimezone,
		settings,
		now,
		count: 1,
	});
	if (!firstOccurrence) return { status: "horizon_unreachable" };
	const persistedIdentityCount = state.cycles.filter(
		(cycleRow) =>
			cycleRow.origin === "scheduled" &&
			cycleRow.scheduledBoundary !== null &&
			cycleRow.scheduledBoundary >= firstOccurrence.boundary,
	).length;
	const occurrences = enumerateScheduledCycleOccurrences({
		workspaceTimezone: state.teamRow.workspaceTimezone,
		settings,
		now,
		count: state.settings.planningHorizon + persistedIdentityCount,
	});
	const reconciliation = findMissingOccurrences({
		cycles: state.cycles,
		occurrences,
		planningHorizon: state.settings.planningHorizon,
	});
	if (reconciliation.status === "satisfied") {
		return {
			status: "already_satisfied",
			scheduledBoundaries: reconciliation.scheduledBoundaries,
		};
	}
	if (reconciliation.status === "unreachable") {
		return { status: "horizon_unreachable" };
	}
	if (reconciliation.status === "manual_conflict") {
		return {
			status: "manual_cycle_conflict",
			cycleId: reconciliation.cycleId,
			scheduledBoundary: reconciliation.scheduledBoundary,
		};
	}
	if (reconciliation.status === "scheduled_conflict") {
		return {
			status: "scheduled_cycle_conflict",
			cycleId: reconciliation.cycleId,
			scheduledBoundary: reconciliation.scheduledBoundary,
		};
	}

	const sequenceStart = await getNextCycleSequence({
		tx,
		workspaceId,
		teamId,
	});
	const values: (typeof cycle.$inferInsert)[] = reconciliation.occurrences.map(
		(occurrence, index) => {
			const sequence = sequenceStart + index;
			return {
				id: createId(),
				workspaceId,
				teamId,
				name: `Cycle ${sequence}`,
				sequence,
				startDate: occurrence.boundary,
				endDate: occurrence.endDate,
				state: "planned",
				origin: "scheduled",
				scheduledBoundary: occurrence.boundary,
			};
		},
	);
	const created = await tx.insert(cycle).values(values).returning();
	return {
		status: "created",
		created,
		scheduledBoundaries: uniqueBoundaries(created),
	};
}

export async function maintainPlannedCycleHorizon({
	workspaceId,
	teamId,
	now,
}: {
	workspaceId: string;
	teamId: string;
	now: Date;
}): Promise<PlannedCycleHorizonResult> {
	return await db.transaction((tx) =>
		maintainPlannedCycleHorizonInTransaction({ tx, workspaceId, teamId, now }),
	);
}
