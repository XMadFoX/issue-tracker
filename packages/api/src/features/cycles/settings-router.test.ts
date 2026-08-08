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
let cycleScheduleJob: typeof import("db/features/tracker/cycle-schedule-jobs.schema").cycleScheduleJob;
let permissionsCatalog: typeof import("db/features/abac/abac.schema").permissionsCatalog;
let roleAssignments: typeof import("db/features/abac/abac.schema").roleAssignments;
let roleDefinitions: typeof import("db/features/abac/abac.schema").roleDefinitions;
let rolePermissions: typeof import("db/features/abac/abac.schema").rolePermissions;
let teamCycleSettings: typeof import("db/features/tracker/team-cycle-settings.schema").teamCycleSettings;
let team: typeof import("db/features/tracker/tracker.schema").team;
let teamMembership: typeof import("db/features/tracker/tracker.schema").teamMembership;
let workspaceMembership: typeof import("db/features/tracker/tracker.schema").workspaceMembership;
let user: typeof import("db/features/auth/auth.schema").user;
let workspace: typeof import("db/features/tracker/tracker.schema").workspace;
let teardown: Awaited<ReturnType<typeof setupDb>>;

const ids = {
	manager: createId(),
	reader: createId(),
	noAccess: createId(),
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

async function currentRevision() {
	const [row] = await db
		.select({ updatedAt: teamCycleSettings.updatedAt })
		.from(teamCycleSettings)
		.where(eq(teamCycleSettings.teamId, ids.team));
	if (!row) throw new Error("settings missing");
	return row.updatedAt.toISOString();
}

async function seedScheduledArtifacts() {
	const cycleId = createId();
	const actionId = createId();
	const notificationId = createId();
	const jobId = createId();
	const boundary = new Date("2026-08-01T00:00:00.000Z");
	const [initial] = await db
		.select()
		.from(teamCycleSettings)
		.where(eq(teamCycleSettings.teamId, ids.team));
	if (!initial) throw new Error("settings missing");
	await db.insert(cycle).values({
		id: cycleId,
		workspaceId: ids.workspace,
		teamId: ids.team,
		name: "Concurrent artifact cycle",
		sequence: 102,
		startDate: new Date("2026-07-18T00:00:00.000Z"),
		endDate: boundary,
		state: "planned",
		origin: "scheduled",
		scheduledBoundary: boundary,
	});
	await db.insert(cycleActionRequired).values({
		id: actionId,
		workspaceId: ids.workspace,
		teamId: ids.team,
		cycleId,
		kind: "completion_confirmation",
		scheduledBoundary: boundary,
		eventRevisionAt: initial.updatedAt,
		dueAt: boundary,
	});
	await db.insert(cycleNotification).values({
		id: notificationId,
		workspaceId: ids.workspace,
		teamId: ids.team,
		cycleId,
		actionRequiredId: actionId,
		recipientUserId: ids.manager,
		kind: "completion_confirmation",
		scheduledBoundary: boundary,
		eventRevisionAt: initial.updatedAt,
		deliverAt: boundary,
		cycleName: "Concurrent artifact cycle",
		teamName: "Settings Team",
	});
	await db.insert(cycleScheduleJob).values({
		id: jobId,
		workspaceId: ids.workspace,
		teamId: ids.team,
		cycleId,
		jobType: "create_cycle_confirmation_required",
		scheduledBoundary: boundary,
		eventRevisionAt: initial.updatedAt,
		status: "queued",
	});
	return { actionId, notificationId, jobId };
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
	({ cycle } = await import("db/features/tracker/cycles.schema"));
	({ cycleActionRequired } = await import(
		"db/features/tracker/cycle-actions.schema"
	));
	({ cycleNotification } = await import(
		"db/features/tracker/cycle-notifications.schema"
	));
	({ cycleScheduleJob } = await import(
		"db/features/tracker/cycle-schedule-jobs.schema"
	));
	({ team, teamMembership, workspace, workspaceMembership } = await import(
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
	await db.insert(user).values([
		{
			id: ids.manager,
			name: "Manager",
			email: "settings-manager@example.test",
		},
		{ id: ids.reader, name: "Reader", email: "settings-reader@example.test" },
		{
			id: ids.noAccess,
			name: "No Access",
			email: "settings-no-access@example.test",
		},
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
	for (const userId of [ids.manager, ids.reader]) {
		const [assignment] = await db
			.select({ roleId: roleAssignments.roleId })
			.from(roleAssignments)
			.where(
				and(
					eq(roleAssignments.userId, userId),
					eq(roleAssignments.workspaceId, ids.workspace),
					eq(roleAssignments.teamId, ids.team),
				),
			)
			.limit(1);
		if (!assignment) throw new Error("missing team role assignment");
		await db.insert(workspaceMembership).values({
			id: createId(),
			workspaceId: ids.workspace,
			userId,
			roleId: assignment.roleId,
			status: "active",
		});
		await db.insert(teamMembership).values({
			id: createId(),
			teamId: ids.team,
			userId,
			roleId: assignment.roleId,
			status: "active",
		});
	}
});

describe("cycle settings routes", () => {
	test("returns permission-specific mutation capabilities", async () => {
		await grant(ids.manager, [
			"cycle:create",
			"cycle:update",
			"cycle:complete",
			"issue:update",
			"cycle:delete",
		]);

		const managerResult = await client(ids.manager).cycle.getSettings(
			{ workspaceId: ids.workspace, teamId: ids.team },
			options(ids.manager),
		);
		const readerResult = await client(ids.reader).cycle.getSettings(
			{ workspaceId: ids.workspace, teamId: ids.team },
			options(ids.reader),
		);

		expect(managerResult.capabilities).toEqual({
			create: true,
			update: true,
			cancel: true,
			complete: true,
			delete: true,
		});
		expect(readerResult.capabilities).toEqual({
			create: false,
			update: false,
			cancel: false,
			complete: false,
			delete: false,
		});
	});

	test("allows cycle readers to read but not manage settings", async () => {
		const result = await client(ids.reader).cycle.getSettings(
			{ workspaceId: ids.workspace, teamId: ids.team },
			options(ids.reader),
		);
		expect(result.canManageSettings).toBeFalse();
		expect(result.capabilities).toEqual({
			create: false,
			update: false,
			cancel: false,
			complete: false,
			delete: false,
		});
		expect(result.workspaceTimezone).toBe("America/New_York");
		await expectCode(
			client(ids.reader).cycle.updateSettings(
				{
					workspaceId: ids.workspace,
					teamId: ids.team,
					expectedUpdatedAt: await currentRevision(),
					...settings,
				},
				options(ids.reader),
			),
			"UNAUTHORIZED",
		);
	});

	test("requires active workspace and team membership even for direct role assignments", async () => {
		await db
			.update(workspaceMembership)
			.set({ status: "inactive" })
			.where(
				and(
					eq(workspaceMembership.userId, ids.manager),
					eq(workspaceMembership.workspaceId, ids.workspace),
				),
			);
		await expectCode(
			client(ids.manager).cycle.getSettings(
				{ workspaceId: ids.workspace, teamId: ids.team },
				options(ids.manager),
			),
			"UNAUTHORIZED",
		);
		await db
			.update(workspaceMembership)
			.set({ status: "active" })
			.where(
				and(
					eq(workspaceMembership.userId, ids.manager),
					eq(workspaceMembership.workspaceId, ids.workspace),
				),
			);
		await db
			.update(teamMembership)
			.set({ status: "inactive" })
			.where(
				and(
					eq(teamMembership.userId, ids.manager),
					eq(teamMembership.teamId, ids.team),
				),
			);
		await expectCode(
			client(ids.manager).cycle.getSchedulePreview(
				{ workspaceId: ids.workspace, teamId: ids.team },
				options(ids.manager),
			),
			"UNAUTHORIZED",
		);
	});

	test("updates full replacement settings, audit actor, and legacy cadence", async () => {
		const result = await client(ids.manager).cycle.updateSettings(
			{
				workspaceId: ids.workspace,
				teamId: ids.team,
				expectedUpdatedAt: await currentRevision(),
				...settings,
			},
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

	test("returns a read-only schedule preview for a cycle reader", async () => {
		await db
			.update(teamCycleSettings)
			.set({
				cadenceEnabled: true,
				anchorDate: new Date("2026-07-01T10:00:00.000Z"),
			})
			.where(eq(teamCycleSettings.teamId, ids.team));
		const [settingsBefore, cyclesBefore] = await Promise.all([
			db
				.select()
				.from(teamCycleSettings)
				.where(eq(teamCycleSettings.teamId, ids.team)),
			db.select().from(cycle),
		]);

		const result = await client(ids.reader).cycle.getSchedulePreview(
			{ workspaceId: ids.workspace, teamId: ids.team },
			options(ids.reader),
		);
		expect(result).toMatchObject({
			status: "ready",
			automationAvailable: false,
			workspaceTimezone: "America/New_York",
		});
		const [settingsAfter, cyclesAfter] = await Promise.all([
			db
				.select()
				.from(teamCycleSettings)
				.where(eq(teamCycleSettings.teamId, ids.team)),
			db.select().from(cycle),
		]);
		expect(settingsAfter).toEqual(settingsBefore);
		expect(cyclesAfter).toEqual(cyclesBefore);
	});

	test("enforces preview authorization, scoping, and persisted timezone safety", async () => {
		await expectCode(
			client(ids.noAccess).cycle.getSchedulePreview(
				{ workspaceId: ids.workspace, teamId: ids.team },
				options(ids.noAccess),
			),
			"UNAUTHORIZED",
		);
		await expectCode(
			client(ids.reader).cycle.getSchedulePreview(
				{ workspaceId: ids.wrongWorkspace, teamId: ids.team },
				options(ids.reader),
			),
			"NOT_FOUND",
		);
		await db
			.update(workspace)
			.set({ timezone: "Invalid/Timezone" })
			.where(eq(workspace.id, ids.workspace));
		await expectCode(
			client(ids.reader).cycle.getSchedulePreview(
				{ workspaceId: ids.workspace, teamId: ids.team },
				options(ids.reader),
			),
			"INVALID_WORKSPACE_TIMEZONE",
		);
	});

	test("reports an uninitialized schedule as an invariant error", async () => {
		await db
			.delete(teamCycleSettings)
			.where(eq(teamCycleSettings.teamId, ids.team));
		await expectCode(
			client(ids.reader).cycle.getSchedulePreview(
				{ workspaceId: ids.workspace, teamId: ids.team },
				options(ids.reader),
			),
			"SETTINGS_NOT_INITIALIZED",
		);
	});

	test("cancels scheduled artifacts once and leaves stale no-op retries untouched", async () => {
		const cycleId = createId();
		const actionId = createId();
		const notificationId = createId();
		const jobId = createId();
		const boundary = new Date("2026-08-01T00:00:00.000Z");
		await db.insert(cycle).values({
			id: cycleId,
			workspaceId: ids.workspace,
			teamId: ids.team,
			name: "Scheduled artifact cycle",
			sequence: 100,
			startDate: new Date("2026-07-18T00:00:00.000Z"),
			endDate: boundary,
			state: "planned",
			origin: "scheduled",
			scheduledBoundary: boundary,
		});
		const [initial] = await db
			.select()
			.from(teamCycleSettings)
			.where(eq(teamCycleSettings.teamId, ids.team));
		if (!initial) throw new Error("settings missing");
		await db.insert(cycleActionRequired).values({
			id: actionId,
			workspaceId: ids.workspace,
			teamId: ids.team,
			cycleId,
			kind: "completion_confirmation",
			scheduledBoundary: boundary,
			eventRevisionAt: initial.updatedAt,
			dueAt: new Date("2026-07-31T00:00:00.000Z"),
		});
		await db.insert(cycleNotification).values({
			id: notificationId,
			workspaceId: ids.workspace,
			teamId: ids.team,
			cycleId,
			actionRequiredId: actionId,
			recipientUserId: ids.manager,
			kind: "completion_confirmation",
			scheduledBoundary: boundary,
			eventRevisionAt: initial.updatedAt,
			deliverAt: new Date("2026-07-31T00:00:00.000Z"),
			cycleName: "Scheduled artifact cycle",
			teamName: "Settings Team",
		});
		await db.insert(cycleScheduleJob).values({
			id: jobId,
			workspaceId: ids.workspace,
			teamId: ids.team,
			cycleId,
			jobType: "create_cycle_confirmation_required",
			scheduledBoundary: boundary,
			eventRevisionAt: initial.updatedAt,
			status: "queued",
		});
		const staleRevision = initial.updatedAt.toISOString();
		const changed = await client(ids.manager).cycle.updateSettings(
			{
				workspaceId: ids.workspace,
				teamId: ids.team,
				expectedUpdatedAt: staleRevision,
				...settings,
				cadenceDays: 28,
			},
			options(ids.manager),
		);
		expect(changed.unchanged).toBeFalse();
		const canceled = await Promise.all([
			db
				.select()
				.from(cycleActionRequired)
				.where(eq(cycleActionRequired.id, actionId)),
			db
				.select()
				.from(cycleNotification)
				.where(eq(cycleNotification.id, notificationId)),
			db.select().from(cycleScheduleJob).where(eq(cycleScheduleJob.id, jobId)),
		]);
		expect(canceled[0][0]?.status).toBe("canceled");
		expect(canceled[0][0]?.cancellationReason).toBe("settings_changed");
		expect(canceled[1][0]?.cancellationReason).toBe("settings_changed");
		expect(canceled[2][0]?.outcome).toBe("obsolete_settings");
		const unchanged = await client(ids.manager).cycle.updateSettings(
			{
				workspaceId: ids.workspace,
				teamId: ids.team,
				expectedUpdatedAt: staleRevision,
				...settings,
				cadenceDays: 28,
			},
			options(ids.manager),
		);
		expect(unchanged.unchanged).toBeTrue();
		const afterRetry = await Promise.all([
			db
				.select()
				.from(cycleActionRequired)
				.where(eq(cycleActionRequired.id, actionId)),
			db
				.select()
				.from(cycleNotification)
				.where(eq(cycleNotification.id, notificationId)),
			db.select().from(cycleScheduleJob).where(eq(cycleScheduleJob.id, jobId)),
		]);
		expect(afterRetry).toEqual(canceled);
	});

	test("rolls back settings, audit, duration, and every artifact on cancellation failure", async () => {
		const cycleId = createId();
		const actionId = createId();
		const notificationId = createId();
		const jobId = createId();
		const boundary = new Date("2026-08-01T00:00:00.000Z");
		await db.insert(cycle).values({
			id: cycleId,
			workspaceId: ids.workspace,
			teamId: ids.team,
			name: "Rollback cycle",
			sequence: 101,
			startDate: new Date("2026-07-18T00:00:00.000Z"),
			endDate: boundary,
			state: "planned",
			origin: "scheduled",
			scheduledBoundary: boundary,
		});
		const [initial] = await db
			.select()
			.from(teamCycleSettings)
			.where(eq(teamCycleSettings.teamId, ids.team));
		if (!initial) throw new Error("settings missing");
		await db.insert(cycleActionRequired).values({
			id: actionId,
			workspaceId: ids.workspace,
			teamId: ids.team,
			cycleId,
			kind: "completion_confirmation",
			scheduledBoundary: boundary,
			eventRevisionAt: initial.updatedAt,
			dueAt: boundary,
		});
		await db.insert(cycleNotification).values({
			id: notificationId,
			workspaceId: ids.workspace,
			teamId: ids.team,
			cycleId,
			actionRequiredId: actionId,
			recipientUserId: ids.manager,
			kind: "completion_confirmation",
			scheduledBoundary: boundary,
			eventRevisionAt: initial.updatedAt,
			deliverAt: boundary,
			cycleName: "Rollback cycle",
			teamName: "Settings Team",
		});
		await db.insert(cycleScheduleJob).values({
			id: jobId,
			workspaceId: ids.workspace,
			teamId: ids.team,
			cycleId,
			jobType: "create_cycle_confirmation_required",
			scheduledBoundary: boundary,
			eventRevisionAt: initial.updatedAt,
			status: "queued",
		});
		const before = {
			settings: (
				await db
					.select()
					.from(teamCycleSettings)
					.where(eq(teamCycleSettings.teamId, ids.team))
			)[0],
			team: (await db.select().from(team).where(eq(team.id, ids.team)))[0],
			action: (
				await db
					.select()
					.from(cycleActionRequired)
					.where(eq(cycleActionRequired.id, actionId))
			)[0],
			notification: (
				await db
					.select()
					.from(cycleNotification)
					.where(eq(cycleNotification.id, notificationId))
			)[0],
			job: (
				await db
					.select()
					.from(cycleScheduleJob)
					.where(eq(cycleScheduleJob.id, jobId))
			)[0],
		};
		await db.execute(sql`
			create or replace function settings_test_failure() returns trigger
			language plpgsql as $$ begin
				if new.cancellation_reason = 'settings_changed' then
					raise exception 'settings cancellation failure';
				end if;
				return new;
			end $$;
		`);
		await db.execute(sql`
			create trigger settings_test_failure_trigger
			before update on cycle_notification
			for each row execute function settings_test_failure()
		`);
		let failure: unknown;
		try {
			await client(ids.manager).cycle.updateSettings(
				{
					workspaceId: ids.workspace,
					teamId: ids.team,
					expectedUpdatedAt: initial.updatedAt.toISOString(),
					...settings,
					cadenceDays: 28,
				},
				options(ids.manager),
			);
		} catch (error) {
			failure = error;
		} finally {
			await db.execute(
				sql`drop trigger if exists settings_test_failure_trigger on cycle_notification`,
			);
			await db.execute(sql`drop function if exists settings_test_failure()`);
		}
		expect(failure).toBeDefined();
		const after = {
			settings: (
				await db
					.select()
					.from(teamCycleSettings)
					.where(eq(teamCycleSettings.teamId, ids.team))
			)[0],
			team: (await db.select().from(team).where(eq(team.id, ids.team)))[0],
			action: (
				await db
					.select()
					.from(cycleActionRequired)
					.where(eq(cycleActionRequired.id, actionId))
			)[0],
			notification: (
				await db
					.select()
					.from(cycleNotification)
					.where(eq(cycleNotification.id, notificationId))
			)[0],
			job: (
				await db
					.select()
					.from(cycleScheduleJob)
					.where(eq(cycleScheduleJob.id, jobId))
			)[0],
		};
		expect(after).toEqual(before);
	});

	test("serializes genuinely concurrent differing replacements", async () => {
		const artifacts = await seedScheduledArtifacts();
		const revision = await currentRevision();
		const artifactsBefore = await Promise.all([
			db
				.select()
				.from(cycleActionRequired)
				.where(eq(cycleActionRequired.id, artifacts.actionId)),
			db
				.select()
				.from(cycleNotification)
				.where(eq(cycleNotification.id, artifacts.notificationId)),
			db
				.select()
				.from(cycleScheduleJob)
				.where(eq(cycleScheduleJob.id, artifacts.jobId)),
		]);
		const results = await Promise.allSettled([
			client(ids.manager).cycle.updateSettings(
				{
					workspaceId: ids.workspace,
					teamId: ids.team,
					expectedUpdatedAt: revision,
					...settings,
					cadenceDays: 28,
				},
				options(ids.manager),
			),
			client(ids.manager).cycle.updateSettings(
				{
					workspaceId: ids.workspace,
					teamId: ids.team,
					expectedUpdatedAt: revision,
					...settings,
					cadenceDays: 35,
				},
				options(ids.manager),
			),
		]);
		expect(
			results.filter((result) => result.status === "fulfilled"),
		).toHaveLength(1);
		expect(
			results.filter((result) => result.status === "rejected"),
		).toHaveLength(1);
		const rejected = results.find((result) => result.status === "rejected");
		if (rejected?.status === "rejected")
			expect(rejected.reason.code).toBe("SETTINGS_CHANGED");
		const [winner] = await db
			.select()
			.from(teamCycleSettings)
			.where(eq(teamCycleSettings.teamId, ids.team));
		expect(winner).toBeDefined();
		if (winner) expect([28, 35]).toContain(winner.cadenceDays);
		const afterArtifacts = await Promise.all([
			db
				.select()
				.from(cycleActionRequired)
				.where(eq(cycleActionRequired.id, artifacts.actionId)),
			db
				.select()
				.from(cycleNotification)
				.where(eq(cycleNotification.id, artifacts.notificationId)),
			db
				.select()
				.from(cycleScheduleJob)
				.where(eq(cycleScheduleJob.id, artifacts.jobId)),
		]);
		expect(afterArtifacts).not.toEqual(artifactsBefore);
		expect(afterArtifacts[0][0]?.status).toBe("canceled");
		expect(afterArtifacts[0][0]?.cancellationReason).toBe("settings_changed");
		expect(afterArtifacts[1][0]?.cancellationReason).toBe("settings_changed");
		expect(afterArtifacts[2][0]?.outcome).toBe("obsolete_settings");
	});

	test("returns typed conflict before runtime availability and performs no write", async () => {
		const artifacts = await seedScheduledArtifacts();
		const revision = await currentRevision();
		await client(ids.manager).cycle.updateSettings(
			{
				workspaceId: ids.workspace,
				teamId: ids.team,
				expectedUpdatedAt: revision,
				...settings,
				cadenceDays: 28,
			},
			options(ids.manager),
		);
		const [afterWinner] = await db
			.select()
			.from(teamCycleSettings)
			.where(eq(teamCycleSettings.teamId, ids.team));
		if (!afterWinner) throw new Error("settings missing");
		const artifactsAfterWinner = await Promise.all([
			db
				.select()
				.from(cycleActionRequired)
				.where(eq(cycleActionRequired.id, artifacts.actionId)),
			db
				.select()
				.from(cycleNotification)
				.where(eq(cycleNotification.id, artifacts.notificationId)),
			db
				.select()
				.from(cycleScheduleJob)
				.where(eq(cycleScheduleJob.id, artifacts.jobId)),
		]);
		await expectCode(
			client(ids.manager).cycle.updateSettings(
				{
					workspaceId: ids.workspace,
					teamId: ids.team,
					expectedUpdatedAt: revision,
					...settings,
					cadenceDays: 35,
					cadenceEnabled: true,
					anchorDate: "2026-01-01T00:00:00.000Z",
				},
				options(ids.manager),
			),
			"SETTINGS_CHANGED",
		);
		const [afterConflict] = await db
			.select()
			.from(teamCycleSettings)
			.where(eq(teamCycleSettings.teamId, ids.team));
		expect(afterConflict?.updatedAt).toEqual(afterWinner.updatedAt);
		expect(afterConflict?.cadenceDays).toBe(28);
		const [action, notification, job] = await Promise.all([
			db
				.select()
				.from(cycleActionRequired)
				.where(eq(cycleActionRequired.id, artifacts.actionId)),
			db
				.select()
				.from(cycleNotification)
				.where(eq(cycleNotification.id, artifacts.notificationId)),
			db
				.select()
				.from(cycleScheduleJob)
				.where(eq(cycleScheduleJob.id, artifacts.jobId)),
		]);
		expect(action[0]?.status).toBe("canceled");
		expect(notification[0]?.cancellationReason).toBe("settings_changed");
		expect(job[0]?.outcome).toBe("obsolete_settings");
		expect([action, notification, job]).toEqual(artifactsAfterWinner);
	});

	test("rejects enabling automation and workspace/team mismatches", async () => {
		await expectCode(
			client(ids.manager).cycle.updateSettings(
				{
					workspaceId: ids.workspace,
					teamId: ids.team,
					expectedUpdatedAt: await currentRevision(),
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
