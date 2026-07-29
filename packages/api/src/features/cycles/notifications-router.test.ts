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
import { and, eq, inArray, sql } from "drizzle-orm";
import type { AuthedORPCContext } from "../../context";
import setupDb from "../../utils/prepare-tests";

let db: typeof import("db").db;
let router: typeof import("../../router").router;
let cycle: typeof import("db/features/tracker/cycles.schema").cycle;
let cycleActionRequired: typeof import("db/features/tracker/cycle-actions.schema").cycleActionRequired;
let cycleNotification: typeof import("db/features/tracker/cycle-notifications.schema").cycleNotification;
let teamCycleSettings: typeof import("db/features/tracker/team-cycle-settings.schema").teamCycleSettings;
let team: typeof import("db/features/tracker/tracker.schema").team;
let user: typeof import("db/features/auth/auth.schema").user;
let workspace: typeof import("db/features/tracker/tracker.schema").workspace;
let workspaceMembership: typeof import("db/features/tracker/tracker.schema").workspaceMembership;
let permissionsCatalog: typeof import("db/features/abac/abac.schema").permissionsCatalog;
let roleDefinitions: typeof import("db/features/abac/abac.schema").roleDefinitions;
let rolePermissions: typeof import("db/features/abac/abac.schema").rolePermissions;
let teardown: Awaited<ReturnType<typeof setupDb>>;

const ids = {
	manager: createId(),
	reader: createId(),
	outsider: createId(),
	workspace: createId(),
	team: createId(),
	cycle: createId(),
	managerNotification: createId(),
	readerNotification: createId(),
	foreignNotification: createId(),
};
const endDate = new Date("2026-08-01T10:00:00.000Z");

function auth(userId: string): AuthedORPCContext["auth"] {
	return {
		session: {
			id: createId(),
			userId,
			token: `${userId}-token`,
			expiresAt: new Date("2030-01-01"),
			createdAt: new Date(),
			updatedAt: new Date(),
			ipAddress: null,
			userAgent: null,
		},
		user: {
			id: userId,
			name: "Cycle User",
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

async function grant(userId: string, keys: string[]) {
	const roleId = createId();
	const catalog = await db
		.select({ id: permissionsCatalog.id, key: permissionsCatalog.key })
		.from(permissionsCatalog)
		.where(inArray(permissionsCatalog.key, keys));
	await db.insert(roleDefinitions).values({
		id: roleId,
		workspaceId: ids.workspace,
		scopeLevel: "workspace",
		teamId: null,
		name: `Notification role ${roleId}`,
		createdBy: ids.manager,
		attributes: {},
	});
	await db.insert(rolePermissions).values(
		catalog
			.filter((permission) => keys.includes(permission.key))
			.map((permission) => ({
				roleId,
				permissionId: permission.id,
				effect: "allow" as const,
				attributes: {},
			})),
	);
	await db.insert(workspaceMembership).values({
		id: createId(),
		workspaceId: ids.workspace,
		userId,
		roleId,
		status: "active",
	});
}

async function expectCode(operation: Promise<unknown>, code: string) {
	try {
		await operation;
		expect.unreachable("expected oRPC error");
	} catch (error) {
		if (!(error instanceof ORPCError)) throw error;
		expect(error.code).toBe(code);
	}
}

beforeAll(async () => {
	teardown = await setupDb();
	({ db } = await import("db"));
	({ router } = await import("../../router"));
	({ cycle } = await import("db/features/tracker/cycles.schema"));
	({ cycleActionRequired } = await import(
		"db/features/tracker/cycle-actions.schema"
	));
	({ cycleNotification } = await import(
		"db/features/tracker/cycle-notifications.schema"
	));
	({ teamCycleSettings } = await import(
		"db/features/tracker/team-cycle-settings.schema"
	));
	({ team, workspace, workspaceMembership } = await import(
		"db/features/tracker/tracker.schema"
	));
	({ user } = await import("db/features/auth/auth.schema"));
	({ permissionsCatalog, roleDefinitions, rolePermissions } = await import(
		"db/features/abac/abac.schema"
	));
}, 300_000);

afterAll(async () => {
	if (teardown) await teardown();
}, 60_000);

beforeEach(async () => {
	await db.execute(sql`truncate table team, workspace, "user" cascade`);
	await db.insert(user).values([
		{ id: ids.manager, name: "Manager", email: "notify-manager@example.test" },
		{ id: ids.reader, name: "Reader", email: "notify-reader@example.test" },
		{
			id: ids.outsider,
			name: "Outsider",
			email: "notify-outsider@example.test",
		},
	]);
	await db.insert(workspace).values({
		id: ids.workspace,
		name: "Notification Workspace",
		slug: `notify-${ids.workspace}`,
		timezone: "UTC",
	});
	await db.insert(team).values({
		id: ids.team,
		workspaceId: ids.workspace,
		name: "Notification Team",
		key: `NT${ids.team.slice(0, 3)}`,
		privacy: "public",
	});
	await db.insert(teamCycleSettings).values({
		teamId: ids.team,
		cadenceEnabled: true,
		cadenceDays: 14,
		anchorDate: new Date("2026-07-18T10:00:00.000Z"),
		planningHorizon: 2,
		endBehavior: "automatic",
		gracePeriodMinutes: 0,
		defaultRolloverPolicy: "carry_over",
		reminderLeadMinutes: 60,
	});
	await db.insert(cycle).values({
		id: ids.cycle,
		workspaceId: ids.workspace,
		teamId: ids.team,
		name: "Current cycle",
		sequence: 1,
		state: "active",
		origin: "scheduled",
		scheduledBoundary: endDate,
		startDate: new Date("2026-07-18T10:00:00.000Z"),
		endDate,
	});
	await db.execute(sql`select 1`);
	const { ensurePermissionCatalog } = await import("../workspaces/defaults");
	await ensurePermissionCatalog(db);
	await grant(ids.manager, ["cycle:read", "cycle:manage_settings"]);
	await grant(ids.reader, ["cycle:read"]);
	const [settings] = await db
		.select({ updatedAt: teamCycleSettings.updatedAt })
		.from(teamCycleSettings)
		.where(eq(teamCycleSettings.teamId, ids.team));
	if (!settings) throw new Error("settings missing");
	await db.insert(cycleNotification).values([
		{
			id: ids.managerNotification,
			workspaceId: ids.workspace,
			teamId: ids.team,
			cycleId: ids.cycle,
			recipientUserId: ids.manager,
			kind: "end_reminder",
			scheduledBoundary: endDate,
			eventRevisionAt: settings.updatedAt,
			deliverAt: new Date("2026-07-15T10:00:00.000Z"),
			cycleName: "Current cycle",
			teamName: "Notification Team",
		},
		{
			id: ids.readerNotification,
			workspaceId: ids.workspace,
			teamId: ids.team,
			cycleId: ids.cycle,
			recipientUserId: ids.reader,
			kind: "end_reminder",
			scheduledBoundary: endDate,
			eventRevisionAt: settings.updatedAt,
			deliverAt: new Date("2026-07-15T10:00:00.000Z"),
			cycleName: "Current cycle",
			teamName: "Notification Team",
		},
	]);
});

describe("cycle notification access", () => {
	test("returns only the active recipient and supports idempotent mark-read", async () => {
		const result = await client(ids.reader).cycle.listNotifications(
			{ workspaceId: ids.workspace, teamId: ids.team, unreadOnly: true },
			options(ids.reader),
		);
		expect(result).toHaveLength(1);
		expect(result[0]?.id).toBe(ids.readerNotification);
		const marked = await client(ids.reader).cycle.markNotificationRead(
			{ workspaceId: ids.workspace, notificationId: ids.readerNotification },
			options(ids.reader),
		);
		expect(marked.id).toBe(ids.readerNotification);
		expect(marked.readAt).toBeInstanceOf(Date);
		const repeated = await client(ids.reader).cycle.markNotificationRead(
			{ workspaceId: ids.workspace, notificationId: ids.readerNotification },
			options(ids.reader),
		);
		expect(repeated.readAt).toEqual(marked.readAt);
	});

	test("marks an end reminder read while confirmation is required", async () => {
		const confirmationRevision = new Date("2026-07-16T10:00:00.000Z");
		await db
			.update(teamCycleSettings)
			.set({
				endBehavior: "confirmation_required",
				updatedAt: confirmationRevision,
			})
			.where(eq(teamCycleSettings.teamId, ids.team));
		await db
			.update(cycleNotification)
			.set({ eventRevisionAt: confirmationRevision })
			.where(eq(cycleNotification.id, ids.readerNotification));

		const notifications = await client(ids.reader).cycle.listNotifications(
			{ workspaceId: ids.workspace, teamId: ids.team, unreadOnly: true },
			options(ids.reader),
		);
		expect(notifications).toHaveLength(1);
		expect(notifications[0]?.kind).toBe("end_reminder");

		const marked = await client(ids.reader).cycle.markNotificationRead(
			{ workspaceId: ids.workspace, notificationId: ids.readerNotification },
			options(ids.reader),
		);
		expect(marked.id).toBe(ids.readerNotification);
		expect(marked.readAt).toBeInstanceOf(Date);

		const unread = await client(ids.reader).cycle.listNotifications(
			{ workspaceId: ids.workspace, teamId: ids.team, unreadOnly: true },
			options(ids.reader),
		);
		expect(unread).toHaveLength(0);
	});

	test("does not disclose a foreign recipient, stale revision, or revoked membership", async () => {
		await expectCode(
			client(ids.reader).cycle.markNotificationRead(
				{ workspaceId: ids.workspace, notificationId: ids.managerNotification },
				options(ids.reader),
			),
			"NOT_FOUND",
		);
		await db
			.update(teamCycleSettings)
			.set({ updatedAt: new Date("2026-07-16T10:00:00.000Z") })
			.where(eq(teamCycleSettings.teamId, ids.team));
		await expectCode(
			client(ids.reader).cycle.markNotificationRead(
				{ workspaceId: ids.workspace, notificationId: ids.readerNotification },
				options(ids.reader),
			),
			"NOT_FOUND",
		);
		await db
			.update(workspaceMembership)
			.set({ status: "inactive" })
			.where(
				and(
					eq(workspaceMembership.workspaceId, ids.workspace),
					eq(workspaceMembership.userId, ids.reader),
				),
			);
		await expectCode(
			client(ids.reader).cycle.listNotifications(
				{ workspaceId: ids.workspace, teamId: ids.team },
				options(ids.reader),
			),
			"UNAUTHORIZED",
		);
	});

	test("manager pending actions require the active manager permission pair", async () => {
		await db
			.update(teamCycleSettings)
			.set({ endBehavior: "confirmation_required" })
			.where(eq(teamCycleSettings.teamId, ids.team));
		const [currentSettings] = await db
			.select({ updatedAt: teamCycleSettings.updatedAt })
			.from(teamCycleSettings)
			.where(eq(teamCycleSettings.teamId, ids.team));
		if (!currentSettings) throw new Error("updated settings missing");
		await db.insert(cycleActionRequired).values({
			id: createId(),
			workspaceId: ids.workspace,
			teamId: ids.team,
			cycleId: ids.cycle,
			kind: "completion_confirmation",
			scheduledBoundary: endDate,
			eventRevisionAt: currentSettings.updatedAt,
			dueAt: new Date("2026-07-15T10:00:00.000Z"),
		});
		const pending = await client(ids.manager).cycle.listPendingActions(
			{ workspaceId: ids.workspace, teamId: ids.team },
			options(ids.manager),
		);
		expect(pending).toHaveLength(1);
		expect(pending[0]?.cycleId).toBe(ids.cycle);
		await expectCode(
			client(ids.reader).cycle.listPendingActions(
				{ workspaceId: ids.workspace, teamId: ids.team },
				options(ids.reader),
			),
			"UNAUTHORIZED",
		);
	});
});
