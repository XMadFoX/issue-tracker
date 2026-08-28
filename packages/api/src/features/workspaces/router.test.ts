import {
	afterAll,
	beforeAll,
	beforeEach,
	describe,
	expect,
	test,
} from "bun:test";
import { createRouterClient } from "@orpc/server";
import { createId } from "@paralleldrive/cuid2";
import { and, eq, sql } from "drizzle-orm";
import type { AuthedORPCContext } from "../../context";
import setupDb from "../../utils/prepare-tests";

let db: typeof import("db").db;
let router: typeof import("../../router").router;
let cycle: typeof import("db/features/tracker/cycles.schema").cycle;
let teamCycleSettings: typeof import("db/features/tracker/team-cycle-settings.schema").teamCycleSettings;
let team: typeof import("db/features/tracker/tracker.schema").team;
let teamMembership: typeof import("db/features/tracker/tracker.schema").teamMembership;
let user: typeof import("db/features/auth/auth.schema").user;
let teardown: Awaited<ReturnType<typeof setupDb>>;

const ids = {
	actor: createId(),
};

function auth(userId: string): AuthedORPCContext["auth"] {
	return {
		session: {
			id: createId(),
			userId,
			token: "workspace-router-token",
			expiresAt: new Date("2030-01-01"),
			createdAt: new Date(),
			updatedAt: new Date(),
			ipAddress: null,
			userAgent: null,
		},
		user: {
			id: userId,
			name: "Workspace Actor",
			email: `${userId}@example.test`,
			emailVerified: true,
			image: null,
			createdAt: new Date(),
			updatedAt: new Date(),
		},
	};
}

function options(userId: string) {
	return { context: { headers: new Headers(), auth: auth(userId) } };
}

function client(userId: string) {
	return createRouterClient<typeof router, AuthedORPCContext>(
		router,
		options(userId),
	);
}

beforeAll(async () => {
	teardown = await setupDb();
	({ db } = await import("db"));
	({ cycle } = await import("db/features/tracker/cycles.schema"));
	({ teamCycleSettings } = await import(
		"db/features/tracker/team-cycle-settings.schema"
	));
	({ team, teamMembership } = await import(
		"db/features/tracker/tracker.schema"
	));
	({ user } = await import("db/features/auth/auth.schema"));
	({ router } = await import("../../router"));
}, 300_000);

afterAll(async () => {
	if (teardown) await teardown();
}, 60_000);

beforeEach(async () => {
	await db.execute(sql`truncate table team, workspace, "user" cascade`);
	await db.insert(user).values({
		id: ids.actor,
		name: "Workspace Actor",
		email: "workspace-actor@example.test",
	});
});

describe("workspace create default team cycle settings", () => {
	test("initializes disabled default-team settings immediately without backfill", async () => {
		const created = await client(ids.actor).workspace.create(
			{
				name: "Fresh Workspace",
				slug: "fresh-workspace",
				timezone: "America/New_York",
			},
			options(ids.actor),
		);
		const teams = await db
			.select()
			.from(team)
			.where(eq(team.workspaceId, created.id));
		expect(teams).toHaveLength(1);
		const [defaultTeam] = teams;
		if (!defaultTeam) throw new Error("default team missing");
		expect(defaultTeam.key).toBe("default");

		const settingsRows = await db
			.select()
			.from(teamCycleSettings)
			.where(eq(teamCycleSettings.teamId, defaultTeam.id));
		expect(settingsRows).toHaveLength(1);
		expect(settingsRows[0]).toMatchObject({
			cadenceEnabled: false,
			cadenceDays: 14,
			anchorDate: null,
			planningHorizon: 2,
			endBehavior: "automatic",
			gracePeriodMinutes: 1440,
			defaultRolloverPolicy: "carry_over",
			reminderLeadMinutes: 1440,
			updatedBy: ids.actor,
		});

		const memberships = await db
			.select()
			.from(teamMembership)
			.where(
				and(
					eq(teamMembership.teamId, defaultTeam.id),
					eq(teamMembership.userId, ids.actor),
				),
			);
		expect(memberships).toHaveLength(1);
		expect(memberships[0]?.status).toBe("active");

		const loaded = await client(ids.actor).cycle.getSettings(
			{ workspaceId: created.id, teamId: defaultTeam.id },
			options(ids.actor),
		);
		expect(loaded.settings.cadenceEnabled).toBeFalse();
		expect(loaded.settings.cadenceDays).toBe(14);
		expect(
			await db.select().from(cycle).where(eq(cycle.teamId, defaultTeam.id)),
		).toEqual([]);
	});
});
