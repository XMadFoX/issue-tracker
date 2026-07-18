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

export async function updateScopedTeamCycleSettings({
	executor,
	workspaceId,
	teamId,
	updatedBy,
	settings,
}: {
	executor: DbExecutor;
	workspaceId: string;
	teamId: string;
	updatedBy: string;
	settings: CycleSettingsValue;
}): Promise<TeamCycleSettings | null> {
	return await executor.transaction(async (tx) => {
		const [scopedTeam] = await tx
			.select({ id: team.id })
			.from(team)
			.where(and(eq(team.id, teamId), eq(team.workspaceId, workspaceId)))
			.limit(1)
			.for("update");
		if (!scopedTeam) return null;

		const [updated] = await tx
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

		await tx
			.update(team)
			.set({ cycleDuration: settings.cadenceDays, updatedAt: new Date() })
			.where(eq(team.id, scopedTeam.id));
		return updated;
	});
}
