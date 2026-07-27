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
	enumerateScheduledCycleOccurrences,
	type ScheduleSettings,
} from "./schedule";

type ScheduledCycle = typeof cycle.$inferSelect;
type ScheduledOccurrence = {
	boundary: Date;
	endDate: Date;
};

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

function hasSameBoundary(cycleRow: ScheduledCycle, boundary: Date): boolean {
	return cycleRow.scheduledBoundary?.getTime() === boundary.getTime();
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
	| { status: "manual_conflict"; cycleId: string; scheduledBoundary: Date }
	| { status: "scheduled_conflict"; cycleId: string; scheduledBoundary: Date }
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
			if (matchingCycle.state === "planned")
				matchingPlanned.push(matchingCycle);
			if (matchingPlanned.length >= planningHorizon) {
				return {
					status: "satisfied",
					scheduledBoundaries: uniqueBoundaries(matchingPlanned),
				};
			}
			continue;
		}

		const overlap = cycles.find((cycleRow) =>
			overlaps({ cycleRow, occurrence }),
		);
		if (overlap) {
			return overlap.origin === "manual"
				? {
						status: "manual_conflict",
						cycleId: overlap.id,
						scheduledBoundary: occurrence.boundary,
					}
				: {
						status: "scheduled_conflict",
						cycleId: overlap.id,
						scheduledBoundary: occurrence.boundary,
					};
		}

		missing.push(occurrence);
		if (matchingPlanned.length + missing.length === planningHorizon) {
			return { status: "missing", occurrences: missing };
		}
	}

	return { status: "unreachable" };
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
	return await db.transaction(async (tx) => {
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
		const values: (typeof cycle.$inferInsert)[] =
			reconciliation.occurrences.map((occurrence, index) => {
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
			});
		const created = await tx.insert(cycle).values(values).returning();
		return {
			status: "created",
			created,
			scheduledBoundaries: uniqueBoundaries(created),
		};
	});
}
