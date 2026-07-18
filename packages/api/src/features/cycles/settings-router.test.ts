import {
	afterAll,
	beforeAll,
	beforeEach,
	describe,
	expect,
	test,
} from "bun:test";
import { createRouterClient, ORPCError } from "@orpc/server";
import { createId } from "@paralleldrive/cuid2";
import { eq, inArray, sql } from "drizzle-orm";
import type { AuthedORPCContext } from "../../context";
import setupDb from "../../utils/prepare-tests";

let db: typeof import("db").db;
let router: typeof import("../../router").router;
let permissionsCatalog: typeof import("db/features/abac/abac.schema").permissionsCatalog;
let roleAssignments: typeof import("db/features/abac/abac.schema").roleAssignments;
let roleDefinitions: typeof import("db/features/abac/abac.schema").roleDefinitions;
let rolePermissions: typeof import("db/features/abac/abac.schema").rolePermissions;
let teamCycleSettings: typeof import("db/features/tracker/team-cycle-settings.schema").teamCycleSettings;
let team: typeof import("db/features/tracker/tracker.schema").team;
let user: typeof import("db/features/auth/auth.schema").user;
let workspace: typeof import("db/features/tracker/tracker.schema").workspace;
let teardown: Awaited<ReturnType<typeof setupDb>>;

const ids = {
	manager: createId(),
	reader: createId(),
	team: createId(),
	workspace: createId(),
	wrongWorkspace: createId(),
};

function auth(userId: string): AuthedORPCContext["auth"] {
	return {
		session: {
			id: createId(),
			userId,
			token: "settings-router-token",
			expiresAt: new Date("2030-01-01"),
			createdAt: new Date(),
			updatedAt: new Date(),
			ipAddress: null,
			userAgent: null,
		},
		user: {
			id: userId,
			name: "Settings User",
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

const settings = {
	cadenceEnabled: false,
	cadenceDays: 21,
	anchorDate: null,
	planningHorizon: 2,
	endBehavior: "automatic" as const,
	gracePeriodMinutes: 1440,
	defaultRolloverPolicy: "carry_over" as const,
	reminderLeadMinutes: 60,
};

async function expectCode(operation: Promise<unknown>, code: string) {
	try {
		await operation;
		expect.unreachable("expected oRPC error");
	} catch (error) {
		if (!(error instanceof ORPCError)) throw error;
		expect(error.code).toBe(code);
	}
}

async function grant(
	userId: string,
	keys: string[],
	teamId: string | null = ids.team,
) {
	const roleId = createId();
	const catalog = await db
		.select({ id: permissionsCatalog.id, key: permissionsCatalog.key })
		.from(permissionsCatalog)
		.where(inArray(permissionsCatalog.key, keys));
	await db.insert(roleDefinitions).values({
		id: roleId,
		workspaceId: ids.workspace,
		teamId,
		scopeLevel: teamId ? "team" : "workspace",
		name: `Settings ${roleId}`,
		createdBy: ids.manager,
		attributes: {},
	});
	await db.insert(rolePermissions).values(
		catalog.map((permission) => ({
			roleId,
			permissionId: permission.id,
			effect: "allow" as const,
			attributes: {},
		})),
	);
	await db.insert(roleAssignments).values({
		id: createId(),
		roleId,
		userId,
		workspaceId: ids.workspace,
		teamId,
		assignedBy: ids.manager,
		attributes: {},
	});
}

beforeAll(async () => {
	teardown = await setupDb();
	({ db } = await import("db"));
	({ permissionsCatalog, roleAssignments, roleDefinitions, rolePermissions } =
		await import("db/features/abac/abac.schema"));
	({ teamCycleSettings } = await import(
		"db/features/tracker/team-cycle-settings.schema"
	));
	({ team, workspace } = await import("db/features/tracker/tracker.schema"));
	({ user } = await import("db/features/auth/auth.schema"));
	({ router } = await import("../../router"));
}, 30_000);

afterAll(async () => {
	if (teardown) await teardown();
}, 30_000);

beforeEach(async () => {
	await db.execute(sql`truncate table team, workspace, "user" cascade`);
	await db.insert(user).values([
		{
			id: ids.manager,
			name: "Manager",
			email: "settings-manager@example.test",
		},
		{ id: ids.reader, name: "Reader", email: "settings-reader@example.test" },
	]);
	await db.insert(workspace).values([
		{
			id: ids.workspace,
			name: "Settings Workspace",
			slug: "settings-router-workspace",
			timezone: "America/New_York",
		},
		{
			id: ids.wrongWorkspace,
			name: "Other Workspace",
			slug: "settings-router-other",
			timezone: "UTC",
		},
	]);
	await db.insert(team).values({
		id: ids.team,
		workspaceId: ids.workspace,
		name: "Settings Team",
		key: "SET",
		privacy: "public",
		cycleDuration: 14,
	});
	await db.insert(teamCycleSettings).values({
		teamId: ids.team,
		cadenceDays: 14,
		updatedBy: null,
	});
	const { ensurePermissionCatalog } = await import("../workspaces/defaults");
	await ensurePermissionCatalog(db);
	await grant(ids.reader, ["cycle:read"]);
	await grant(ids.manager, ["cycle:read", "cycle:manage_settings"]);
	await grant(ids.manager, ["team:create", "team:update"], null);
});

describe("cycle settings routes", () => {
	test("allows cycle readers to read but not manage settings", async () => {
		const result = await client(ids.reader).cycle.getSettings(
			{ workspaceId: ids.workspace, teamId: ids.team },
			options(ids.reader),
		);
		expect(result.canManageSettings).toBeFalse();
		expect(result.workspaceTimezone).toBe("America/New_York");
		await expectCode(
			client(ids.reader).cycle.updateSettings(
				{ workspaceId: ids.workspace, teamId: ids.team, ...settings },
				options(ids.reader),
			),
			"UNAUTHORIZED",
		);
	});

	test("updates full replacement settings, audit actor, and legacy cadence", async () => {
		const result = await client(ids.manager).cycle.updateSettings(
			{ workspaceId: ids.workspace, teamId: ids.team, ...settings },
			options(ids.manager),
		);
		expect(result.canManageSettings).toBeTrue();
		expect(result.settings).toMatchObject({
			cadenceDays: 21,
			updatedBy: ids.manager,
		});
		const [updatedTeam] = await db
			.select({ cycleDuration: team.cycleDuration })
			.from(team)
			.where(eq(team.id, ids.team));
		expect(updatedTeam?.cycleDuration).toBe(21);
	});

	test("creates disabled settings atomically through the supported team route", async () => {
		const created = await client(ids.manager).team.create(
			{
				workspaceId: ids.workspace,
				name: "New Settings Team",
				key: "NEW",
				privacy: "public",
				cycleDuration: null,
			},
			options(ids.manager),
		);
		const createdSettings = await db
			.select()
			.from(teamCycleSettings)
			.where(eq(teamCycleSettings.teamId, created.id));
		expect(createdSettings).toHaveLength(1);
		expect(createdSettings[0]).toMatchObject({
			cadenceEnabled: false,
			cadenceDays: 14,
			updatedBy: ids.manager,
		});
	});

	test("mirrors legacy team duration changes and rolls back when settings are missing", async () => {
		await client(ids.manager).team.update(
			{ id: ids.team, workspaceId: ids.workspace, cycleDuration: 28 },
			options(ids.manager),
		);
		const [syncedSettings] = await db
			.select()
			.from(teamCycleSettings)
			.where(eq(teamCycleSettings.teamId, ids.team));
		expect(syncedSettings).toMatchObject({
			cadenceDays: 28,
			updatedBy: ids.manager,
		});

		await db
			.delete(teamCycleSettings)
			.where(eq(teamCycleSettings.teamId, ids.team));
		await expect(
			client(ids.manager).team.update(
				{ id: ids.team, workspaceId: ids.workspace, cycleDuration: 35 },
				options(ids.manager),
			),
		).rejects.toBeInstanceOf(ORPCError);
		const [teamAfterRejectedUpdate] = await db
			.select({ cycleDuration: team.cycleDuration })
			.from(team)
			.where(eq(team.id, ids.team));
		expect(teamAfterRejectedUpdate?.cycleDuration).toBe(28);
	});

	test("rejects enabling automation and workspace/team mismatches", async () => {
		await expectCode(
			client(ids.manager).cycle.updateSettings(
				{
					workspaceId: ids.workspace,
					teamId: ids.team,
					...settings,
					cadenceEnabled: true,
					anchorDate: "2026-01-01T00:00:00.000Z",
				},
				options(ids.manager),
			),
			"AUTOMATION_UNAVAILABLE",
		);
		await expectCode(
			client(ids.reader).cycle.getSettings(
				{ workspaceId: ids.wrongWorkspace, teamId: ids.team },
				options(ids.reader),
			),
			"NOT_FOUND",
		);
	});
});
