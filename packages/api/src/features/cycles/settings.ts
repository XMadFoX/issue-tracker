import type { db } from "db";
import { teamCycleSettings } from "db/features/tracker/team-cycle-settings.schema";
import { team, workspace } from "db/features/tracker/tracker.schema";
import { and, eq } from "drizzle-orm";
import type { CycleSettingsValue } from "./schema";

const DEFAULT_CADENCE_DAYS = 14;
const DEFAULT_REMINDER_LEAD_MINUTES = 1440;

type DbTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
type DbExecutor = typeof db | DbTransaction;
type TeamCycleSettings = typeof teamCycleSettings.$inferSelect;
type TeamCycleSettingsInsert = typeof teamCycleSettings.$inferInsert;

type InitialSettingsTeam = Pick<
	typeof team.$inferSelect,
	"id" | "cycleDuration"
>;

export function normalizeCadenceDays(cycleDuration: number | null): number {
	return cycleDuration !== null && cycleDuration > 0
		? cycleDuration
		: DEFAULT_CADENCE_DAYS;
}

export function buildInitialTeamCycleSettings(
	teamRow: InitialSettingsTeam,
	updatedBy: string | null,
): TeamCycleSettingsInsert {
	return {
		teamId: teamRow.id,
		cadenceEnabled: false,
		cadenceDays: normalizeCadenceDays(teamRow.cycleDuration),
		anchorDate: null,
		planningHorizon: 2,
		endBehavior: "automatic",
		gracePeriodMinutes: 1440,
		defaultRolloverPolicy: "carry_over",
		reminderLeadMinutes: DEFAULT_REMINDER_LEAD_MINUTES,
		updatedBy,
	};
}

export async function ensureTeamCycleSettings({
	executor,
	teamRow,
	updatedBy = null,
}: {
	executor: DbExecutor;
	teamRow: InitialSettingsTeam;
	updatedBy?: string | null;
}): Promise<void> {
	await executor
		.insert(teamCycleSettings)
		.values(buildInitialTeamCycleSettings(teamRow, updatedBy))
		.onConflictDoNothing();
}

export async function backfillTeamCycleSettings(
	executor: DbExecutor,
): Promise<void> {
	const teams = await executor
		.select({ id: team.id, cycleDuration: team.cycleDuration })
		.from(team);

	for (const teamRow of teams) {
		await ensureTeamCycleSettings({ executor, teamRow });
	}
}

export type ScopedTeamCycleSettings = {
	settings: TeamCycleSettings | null;
	team: Pick<typeof team.$inferSelect, "id" | "workspaceId">;
	workspaceTimezone: string;
};

export async function getScopedTeamCycleSettings({
	executor,
	workspaceId,
	teamId,
}: {
	executor: DbExecutor;
	workspaceId: string;
	teamId: string;
}): Promise<ScopedTeamCycleSettings | null> {
	const [row] = await executor
		.select({
			teamId: team.id,
			teamWorkspaceId: team.workspaceId,
			workspaceTimezone: workspace.timezone,
			settings: teamCycleSettings,
		})
		.from(team)
		.innerJoin(workspace, eq(team.workspaceId, workspace.id))
		.leftJoin(teamCycleSettings, eq(teamCycleSettings.teamId, team.id))
		.where(and(eq(team.id, teamId), eq(team.workspaceId, workspaceId)))
		.limit(1);
	if (!row) return null;

	return {
		team: { id: row.teamId, workspaceId: row.teamWorkspaceId },
		workspaceTimezone: row.workspaceTimezone,
		settings: row.settings,
	};
}

export type UpdateTeamCycleSettingsResult =
	| { status: "updated"; settings: TeamCycleSettings }
	| { status: "unchanged"; settings: TeamCycleSettings }
	| { status: "conflict"; settings: TeamCycleSettings }
	| { status: "unavailable"; settings: TeamCycleSettings };

function settingsMatch(
	current: TeamCycleSettings,
	requested: CycleSettingsValue,
): boolean {
	return (
		current.cadenceEnabled === requested.cadenceEnabled &&
		current.cadenceDays === requested.cadenceDays &&
		(current.anchorDate?.getTime() ?? null) ===
			(requested.anchorDate
				? new Date(requested.anchorDate).getTime()
				: null) &&
		current.planningHorizon === requested.planningHorizon &&
		current.endBehavior === requested.endBehavior &&
		current.gracePeriodMinutes === requested.gracePeriodMinutes &&
		current.defaultRolloverPolicy === requested.defaultRolloverPolicy &&
		current.reminderLeadMinutes === requested.reminderLeadMinutes
	);
}

export async function updateScopedTeamCycleSettings({
	executor,
	workspaceId,
	teamId,
	updatedBy,
	settings,
	expectedUpdatedAt,
	automationAvailable,
}: {
	executor: DbExecutor;
	workspaceId: string;
	teamId: string;
	updatedBy: string;
	settings: CycleSettingsValue;
	expectedUpdatedAt: string;
	automationAvailable: boolean;
}): Promise<UpdateTeamCycleSettingsResult | null> {
	const [scopedTeam] = await executor
		.select({ id: team.id, cycleDuration: team.cycleDuration })
		.from(team)
		.where(and(eq(team.id, teamId), eq(team.workspaceId, workspaceId)))
		.limit(1)
		.for("update");
	if (!scopedTeam) return null;

	const [current] = await executor
		.select()
		.from(teamCycleSettings)
		.where(eq(teamCycleSettings.teamId, teamId))
		.limit(1)
		.for("update");
	if (!current) return null;

	if (settingsMatch(current, settings)) {
		return { status: "unchanged", settings: current };
	}
	if (current.updatedAt.getTime() !== Date.parse(expectedUpdatedAt)) {
		return { status: "conflict", settings: current };
	}
	if (settings.cadenceEnabled && automationAvailable === false) {
		return { status: "unavailable", settings: current };
	}

	const [updated] = await executor
		.update(teamCycleSettings)
		.set({
			cadenceEnabled: settings.cadenceEnabled,
			cadenceDays: settings.cadenceDays,
			anchorDate: settings.anchorDate ? new Date(settings.anchorDate) : null,
			planningHorizon: settings.planningHorizon,
			endBehavior: settings.endBehavior,
			gracePeriodMinutes: settings.gracePeriodMinutes,
			defaultRolloverPolicy: settings.defaultRolloverPolicy,
			reminderLeadMinutes: settings.reminderLeadMinutes,
			updatedBy,
			updatedAt: new Date(),
		})
		.where(eq(teamCycleSettings.teamId, teamId))
		.returning();
	if (!updated) return null;

	if (scopedTeam.cycleDuration !== settings.cadenceDays) {
		await executor
			.update(team)
			.set({ cycleDuration: settings.cadenceDays, updatedAt: new Date() })
			.where(eq(team.id, scopedTeam.id));
	}
	return { status: "updated", settings: updated };
}
