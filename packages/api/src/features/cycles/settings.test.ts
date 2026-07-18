import {
	afterAll,
	beforeAll,
	beforeEach,
	describe,
	expect,
	test,
} from "bun:test";
import { createId } from "@paralleldrive/cuid2";
import { eq, sql } from "drizzle-orm";
import setupDb from "../../utils/prepare-tests";

let db: typeof import("db").db;
let cycle: typeof import("db/features/tracker/cycles.schema").cycle;
let team: typeof import("db/features/tracker/tracker.schema").team;
let teamCycleSettings: typeof import("db/features/tracker/team-cycle-settings.schema").teamCycleSettings;
let user: typeof import("db/features/auth/auth.schema").user;
let workspace: typeof import("db/features/tracker/tracker.schema").workspace;
let teardown: Awaited<ReturnType<typeof setupDb>>;

const ids = {
	actor: createId(),
	team: createId(),
	workspace: createId(),
};

beforeAll(async () => {
	teardown = await setupDb();
	({ db } = await import("db"));
	({ cycle } = await import("db/features/tracker/cycles.schema"));
	({ team, workspace } = await import("db/features/tracker/tracker.schema"));
	({ teamCycleSettings } = await import(
		"db/features/tracker/team-cycle-settings.schema"
	));
	({ user } = await import("db/features/auth/auth.schema"));
}, 30_000);

afterAll(async () => {
	if (teardown) await teardown();
}, 30_000);

beforeEach(async () => {
	await db.execute(sql`truncate table team, workspace, "user" cascade`);
	await db.insert(user).values({
		id: ids.actor,
		name: "Settings Actor",
		email: "settings-actor@example.test",
	});
	await db.insert(workspace).values({
		id: ids.workspace,
		name: "Settings Workspace",
		slug: "settings-workspace",
		timezone: "America/New_York",
	});
});

async function insertTeam(cycleDuration: number | null, id = ids.team) {
	await db.insert(team).values({
		id,
		workspaceId: ids.workspace,
		name: `Settings Team ${id}`,
		key: id.slice(0, 8).toUpperCase(),
		privacy: "public",
		cycleDuration,
	});
}

describe("team cycle settings persistence", () => {
	test("backfills disabled settings idempotently with valid or fallback cadence", async () => {
		const secondTeamId = createId();
		await insertTeam(21);
		await insertTeam(0, secondTeamId);
		const { backfillTeamCycleSettings } = await import("./settings");

		await backfillTeamCycleSettings(db);
		await backfillTeamCycleSettings(db);

		const rows = await db
			.select()
			.from(teamCycleSettings)
			.orderBy(teamCycleSettings.teamId);
		expect(rows).toHaveLength(2);
		expect(rows.map((row) => row.cadenceEnabled)).toEqual([false, false]);
		expect(rows.map((row) => row.cadenceDays).sort()).toEqual([14, 21]);
		expect(rows.every((row) => row.anchorDate === null)).toBeTrue();
		expect(rows.every((row) => row.reminderLeadMinutes === 1440)).toBeTrue();
		expect(await db.select().from(cycle)).toHaveLength(0);
	});

	test("enforces database ranges and cascades settings with the team", async () => {
		await insertTeam(14);
		let insertError: unknown = null;
		try {
			await db.insert(teamCycleSettings).values({
				teamId: ids.team,
				cadenceDays: 0,
			});
		} catch (error) {
			insertError = error;
		}
		expect(insertError).not.toBeNull();
		await db.insert(teamCycleSettings).values({
			teamId: ids.team,
			cadenceDays: 14,
		});
		await db.delete(team).where(eq(team.id, ids.team));
		const rows = await db
			.select()
			.from(teamCycleSettings)
			.where(eq(teamCycleSettings.teamId, ids.team));
		expect(rows).toHaveLength(0);
	});

	test("updates settings and legacy duration atomically with authenticated audit", async () => {
		await insertTeam(14);
		const { ensureTeamCycleSettings, updateScopedTeamCycleSettings } =
			await import("./settings");
		await ensureTeamCycleSettings({
			executor: db,
			teamRow: { id: ids.team, cycleDuration: 14 },
		});
		const updated = await updateScopedTeamCycleSettings({
			executor: db,
			workspaceId: ids.workspace,
			teamId: ids.team,
			updatedBy: ids.actor,
			settings: {
				cadenceEnabled: false,
				cadenceDays: 28,
				anchorDate: null,
				planningHorizon: 3,
				endBehavior: "reminder_only",
				gracePeriodMinutes: 0,
				defaultRolloverPolicy: "move_to_backlog",
				reminderLeadMinutes: 30,
			},
		});
		expect(updated).toMatchObject({ cadenceDays: 28, updatedBy: ids.actor });
		const [updatedTeam] = await db
			.select({ cycleDuration: team.cycleDuration })
			.from(team)
			.where(eq(team.id, ids.team));
		expect(updatedTeam?.cycleDuration).toBe(28);
	});
});
