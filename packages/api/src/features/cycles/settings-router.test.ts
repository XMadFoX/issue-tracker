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
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import type { AuthedORPCContext } from "../../context";
import { env } from "../../env";
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
let issue: typeof import("db/features/tracker/issues.schema").issue;
let issueActivity: typeof import("db/features/tracker/issue-activities.schema").issueActivity;
let issueStatus: typeof import("db/features/tracker/issue-statuses.schema").issueStatus;
let issueStatusGroup: typeof import("db/features/tracker/issue-statuses.schema").issueStatusGroup;
let issueType: typeof import("db/features/tracker/issue-types.schema").issueType;
let teardown: Awaited<ReturnType<typeof setupDb>>;

const ids = {
	admin: createId(),
	manager: createId(),
	reader: createId(),
	workspaceGrantee: createId(),
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
		return error;
	}
	throw new Error("expected oRPC error");
}

function setAutomationEnabled(value: boolean) {
	Object.assign(env, { CYCLES_AUTOMATION_ENABLED: value });
}

async function withAutomationEnabled<T>(run: () => Promise<T>): Promise<T> {
	const previous = env.CYCLES_AUTOMATION_ENABLED;
	setAutomationEnabled(true);
	try {
		return await run();
	} finally {
		setAutomationEnabled(previous);
	}
}

const enabledSettings = {
	...settings,
	cadenceEnabled: true,
	cadenceDays: 7,
	anchorDate: "2026-07-01T10:00:00.000Z",
	planningHorizon: 2,
} as const;

async function snapshotTeamState() {
	const [settingsRow] = await db
		.select()
		.from(teamCycleSettings)
		.where(eq(teamCycleSettings.teamId, ids.team));
	const [teamRow] = await db.select().from(team).where(eq(team.id, ids.team));
	const cycles = await db
		.select()
		.from(cycle)
		.where(eq(cycle.teamId, ids.team))
		.orderBy(cycle.sequence);
	const jobs = await db
		.select()
		.from(cycleScheduleJob)
		.where(eq(cycleScheduleJob.teamId, ids.team))
		.orderBy(cycleScheduleJob.id);
	const actions = await db
		.select()
		.from(cycleActionRequired)
		.where(eq(cycleActionRequired.teamId, ids.team))
		.orderBy(cycleActionRequired.id);
	const notifications = await db
		.select()
		.from(cycleNotification)
		.where(eq(cycleNotification.teamId, ids.team))
		.orderBy(cycleNotification.id);
	return { settingsRow, teamRow, cycles, jobs, actions, notifications };
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
	({ issue } = await import("db/features/tracker/issues.schema"));
	({ issueActivity } = await import(
		"db/features/tracker/issue-activities.schema"
	));
	({ issueStatus, issueStatusGroup } = await import(
		"db/features/tracker/issue-statuses.schema"
	));
	({ issueType } = await import("db/features/tracker/issue-types.schema"));
	({ router } = await import("../../router"));
}, 300_000);

afterAll(async () => {
	if (teardown) await teardown();
}, 60_000);

beforeEach(async () => {
	await db.execute(sql`truncate table team, workspace, "user" cascade`);
	await db.insert(user).values([
		{
			id: ids.admin,
			name: "Admin",
			email: "settings-admin@example.test",
		},
		{
			id: ids.manager,
			name: "Manager",
			email: "settings-manager@example.test",
		},
		{ id: ids.reader, name: "Reader", email: "settings-reader@example.test" },
		{
			id: ids.workspaceGrantee,
			name: "Workspace Grantee",
			email: "settings-workspace-grantee@example.test",
		},
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
		privacy: "private",
		cycleDuration: 14,
	});
	await db.insert(teamCycleSettings).values({
		teamId: ids.team,
		cadenceDays: 14,
		updatedBy: null,
	});
	const { ensurePermissionCatalog } = await import("../workspaces/defaults");
	await ensurePermissionCatalog(db);
	await grant(ids.reader, ["cycle:read", "team:read"]);
	await grant(ids.manager, ["cycle:read", "cycle:manage_settings"]);
	await grant(ids.admin, ["*"], null);
	await grant(ids.manager, ["team:create", "team:update"], null);
	await grant(ids.reader, ["workspace:read"], null);
	await grant(ids.workspaceGrantee, ["workspace:read"], null);
	for (const userId of [
		ids.admin,
		ids.manager,
		ids.reader,
		ids.workspaceGrantee,
	]) {
		const [workspaceAssignment] = await db
			.select({ roleId: roleAssignments.roleId })
			.from(roleAssignments)
			.where(
				and(
					eq(roleAssignments.userId, userId),
					eq(roleAssignments.workspaceId, ids.workspace),
					isNull(roleAssignments.teamId),
				),
			)
			.limit(1);
		if (!workspaceAssignment)
			throw new Error("missing workspace role assignment");
		await db.insert(workspaceMembership).values({
			id: createId(),
			workspaceId: ids.workspace,
			userId,
			roleId: workspaceAssignment.roleId,
			status: "active",
		});
		if (userId === ids.admin || userId === ids.workspaceGrantee) continue;
		const [teamAssignment] = await db
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
		if (!teamAssignment) throw new Error("missing team role assignment");
		await db.insert(teamMembership).values({
			id: createId(),
			teamId: ids.team,
			userId,
			roleId: teamAssignment.roleId,
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

	test("allows workspace-scoped grants across teams without team membership", async () => {
		expect(
			await client(ids.workspaceGrantee).team.listByWorkspace(
				{ id: ids.workspace },
				options(ids.workspaceGrantee),
			),
		).toEqual([]);
		await grant(
			ids.workspaceGrantee,
			["cycle:read", "cycle:manage_settings", "team:read"],
			null,
		);

		const result = await client(ids.workspaceGrantee).cycle.getSettings(
			{ workspaceId: ids.workspace, teamId: ids.team },
			options(ids.workspaceGrantee),
		);
		expect(result.canManageSettings).toBeTrue();
		expect(
			await client(ids.workspaceGrantee).team.listByWorkspace(
				{ id: ids.workspace },
				options(ids.workspaceGrantee),
			),
		).toHaveLength(1);
	});

	test("denies stale or malformed team-scoped assignments without active team membership", async () => {
		await grant(ids.workspaceGrantee, ["cycle:read", "team:read"]);
		expect(
			await client(ids.workspaceGrantee).team.listByWorkspace(
				{ id: ids.workspace },
				options(ids.workspaceGrantee),
			),
		).toEqual([]);
		await expectCode(
			client(ids.workspaceGrantee).cycle.getSettings(
				{ workspaceId: ids.workspace, teamId: ids.team },
				options(ids.workspaceGrantee),
			),
			"UNAUTHORIZED",
		);

		await db
			.update(roleAssignments)
			.set({ teamId: null })
			.where(
				and(
					eq(roleAssignments.userId, ids.workspaceGrantee),
					eq(roleAssignments.workspaceId, ids.workspace),
					eq(roleAssignments.teamId, ids.team),
				),
			);
		await expectCode(
			client(ids.workspaceGrantee).cycle.getSettings(
				{ workspaceId: ids.workspace, teamId: ids.team },
				options(ids.workspaceGrantee),
			),
			"UNAUTHORIZED",
		);
		expect(
			await client(ids.workspaceGrantee).team.listByWorkspace(
				{ id: ids.workspace },
				options(ids.workspaceGrantee),
			),
		).toEqual([]);
	});

	test("rejects malformed workspace, team, wrong-team, and cross-workspace role scopes", async () => {
		const otherTeamId = createId();
		const roleIds = {
			emptyMembership: createId(),
			workspaceAssignedAsTeam: createId(),
			teamAssignedGlobally: createId(),
			teamAssignedToWrongTeam: createId(),
			crossWorkspace: createId(),
		};
		await db.insert(team).values({
			id: otherTeamId,
			workspaceId: ids.workspace,
			name: "Malformed Scope Team",
			key: "MST",
			privacy: "private",
		});
		await db.insert(roleDefinitions).values([
			{
				id: roleIds.emptyMembership,
				workspaceId: ids.workspace,
				teamId: ids.team,
				scopeLevel: "team",
				name: "Empty membership role",
				createdBy: ids.manager,
				attributes: {},
			},
			{
				id: roleIds.workspaceAssignedAsTeam,
				workspaceId: ids.workspace,
				teamId: null,
				scopeLevel: "workspace",
				name: "Workspace role assigned as team",
				createdBy: ids.manager,
				attributes: {},
			},
			{
				id: roleIds.teamAssignedGlobally,
				workspaceId: ids.workspace,
				teamId: ids.team,
				scopeLevel: "team",
				name: "Team role assigned globally",
				createdBy: ids.manager,
				attributes: {},
			},
			{
				id: roleIds.teamAssignedToWrongTeam,
				workspaceId: ids.workspace,
				teamId: ids.team,
				scopeLevel: "team",
				name: "Team role assigned to wrong team",
				createdBy: ids.manager,
				attributes: {},
			},
			{
				id: roleIds.crossWorkspace,
				workspaceId: ids.wrongWorkspace,
				teamId: null,
				scopeLevel: "workspace",
				name: "Cross workspace role",
				createdBy: ids.manager,
				attributes: {},
			},
		]);
		const [cycleReadPermission] = await db
			.select({ id: permissionsCatalog.id })
			.from(permissionsCatalog)
			.where(eq(permissionsCatalog.key, "cycle:read"));
		if (!cycleReadPermission) throw new Error("cycle:read permission missing");
		await db.insert(rolePermissions).values(
			[
				roleIds.workspaceAssignedAsTeam,
				roleIds.teamAssignedGlobally,
				roleIds.teamAssignedToWrongTeam,
				roleIds.crossWorkspace,
			].map((roleId) => ({
				roleId,
				permissionId: cycleReadPermission.id,
				effect: "allow" as const,
				attributes: {},
			})),
		);
		await db.insert(teamMembership).values({
			id: createId(),
			teamId: ids.team,
			userId: ids.workspaceGrantee,
			roleId: roleIds.emptyMembership,
			status: "active",
		});
		await db.insert(roleAssignments).values([
			{
				id: createId(),
				roleId: roleIds.workspaceAssignedAsTeam,
				userId: ids.workspaceGrantee,
				workspaceId: ids.workspace,
				teamId: ids.team,
				assignedBy: ids.manager,
				attributes: {},
			},
			{
				id: createId(),
				roleId: roleIds.teamAssignedGlobally,
				userId: ids.workspaceGrantee,
				workspaceId: ids.workspace,
				teamId: null,
				assignedBy: ids.manager,
				attributes: {},
			},
			{
				id: createId(),
				roleId: roleIds.teamAssignedToWrongTeam,
				userId: ids.workspaceGrantee,
				workspaceId: ids.workspace,
				teamId: otherTeamId,
				assignedBy: ids.manager,
				attributes: {},
			},
			{
				id: createId(),
				roleId: roleIds.crossWorkspace,
				userId: ids.workspaceGrantee,
				workspaceId: ids.workspace,
				teamId: null,
				assignedBy: ids.manager,
				attributes: {},
			},
		]);

		await expectCode(
			client(ids.workspaceGrantee).cycle.getSettings(
				{ workspaceId: ids.workspace, teamId: ids.team },
				options(ids.workspaceGrantee),
			),
			"UNAUTHORIZED",
		);
	});

	test("allows workspace admin without team membership and denies inactive admin", async () => {
		const result = await client(ids.admin).cycle.getSettings(
			{ workspaceId: ids.workspace, teamId: ids.team },
			options(ids.admin),
		);
		expect(result.canManageSettings).toBeTrue();
		expect(result.capabilities).toEqual({
			create: true,
			update: true,
			cancel: true,
			complete: true,
			delete: true,
		});

		await db
			.update(workspaceMembership)
			.set({ status: "inactive" })
			.where(
				and(
					eq(workspaceMembership.userId, ids.admin),
					eq(workspaceMembership.workspaceId, ids.workspace),
				),
			);
		await expectCode(
			client(ids.admin).cycle.getSettings(
				{ workspaceId: ids.workspace, teamId: ids.team },
				options(ids.admin),
			),
			"UNAUTHORIZED",
		);
	});

	test("lists all teams for workspace admin and only joined teams for member", async () => {
		const otherTeamId = createId();
		await db.insert(team).values({
			id: otherTeamId,
			workspaceId: ids.workspace,
			name: "Private Admin Team",
			key: "PAT",
			privacy: "private",
		});

		const adminTeams = await client(ids.admin).team.listByWorkspace(
			{ id: ids.workspace },
			options(ids.admin),
		);
		const readerTeams = await client(ids.reader).team.listByWorkspace(
			{ id: ids.workspace },
			options(ids.reader),
		);
		expect(adminTeams.map((row) => row.id).sort()).toEqual(
			[ids.team, otherTeamId].sort(),
		);
		expect(readerTeams.map((row) => row.id)).toEqual([ids.team]);

		const memberTeams = await client(ids.reader).team.listUserTeamsByWorkspace(
			{ id: ids.workspace },
			options(ids.reader),
		);
		const allMemberTeams = await client(ids.reader).team.listUserTeams(
			undefined,
			options(ids.reader),
		);
		expect(memberTeams.map((row) => row.id)).toEqual([ids.team]);
		expect(allMemberTeams.map((row) => row.id)).toEqual([ids.team]);
		expect(memberTeams[0]).toMatchObject({
			id: ids.team,
			workspaceId: ids.workspace,
		});

		await db
			.update(workspaceMembership)
			.set({ status: "inactive" })
			.where(
				and(
					eq(workspaceMembership.userId, ids.reader),
					eq(workspaceMembership.workspaceId, ids.workspace),
				),
			);
		expect(
			await client(ids.reader).team.listUserTeamsByWorkspace(
				{ id: ids.workspace },
				options(ids.reader),
			),
		).toEqual([]);
		expect(
			await client(ids.reader).team.listUserTeams(
				undefined,
				options(ids.reader),
			),
		).toEqual([]);
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

	test("creates disabled settings without synthetic membership for a workspace admin", async () => {
		const input = {
			workspaceId: ids.workspace,
			name: "New Settings Team",
			key: "NEW",
			privacy: "public",
			cycleDuration: null,
		};
		const created = await client(ids.admin).team.create(
			input,
			options(ids.admin),
		);
		const createdSettings = await db
			.select()
			.from(teamCycleSettings)
			.where(eq(teamCycleSettings.teamId, created.id));
		expect(createdSettings).toHaveLength(1);
		expect(createdSettings[0]).toMatchObject({
			cadenceEnabled: false,
			cadenceDays: 14,
			updatedBy: ids.admin,
		});

		const memberships = await db
			.select({
				status: teamMembership.status,
				roleName: roleDefinitions.name,
			})
			.from(teamMembership)
			.innerJoin(roleDefinitions, eq(teamMembership.roleId, roleDefinitions.id))
			.where(
				and(
					eq(teamMembership.teamId, created.id),
					eq(teamMembership.userId, ids.admin),
				),
			);
		expect(memberships).toEqual([]);

		const settingsResult = await client(ids.admin).cycle.getSettings(
			{ workspaceId: ids.workspace, teamId: created.id },
			options(ids.admin),
		);
		expect(settingsResult.canManageSettings).toBeTrue();
		expect(settingsResult.capabilities).toEqual({
			create: true,
			update: true,
			cancel: true,
			complete: true,
			delete: true,
		});
		await expectCode(
			client(ids.noAccess).cycle.getSettings(
				{ workspaceId: ids.workspace, teamId: created.id },
				options(ids.noAccess),
			),
			"UNAUTHORIZED",
		);

		await expectCode(
			client(ids.admin).team.create(input, options(ids.admin)),
			"CONFLICT",
		);
		const [duplicateCounts] = await db
			.select({
				teams: sql<number>`count(distinct ${team.id})::int`,
				memberships: sql<number>`count(distinct ${teamMembership.id})::int`,
				settings: sql<number>`count(distinct ${teamCycleSettings.teamId})::int`,
			})
			.from(team)
			.leftJoin(teamMembership, eq(teamMembership.teamId, team.id))
			.innerJoin(teamCycleSettings, eq(teamCycleSettings.teamId, team.id))
			.where(and(eq(team.workspaceId, ids.workspace), eq(team.key, input.key)));
		expect(duplicateCounts).toEqual({
			teams: 1,
			memberships: 0,
			settings: 1,
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

	test("rejects incompatible enabled cadence changes without mutating preserved state", async () => {
		const staleCycleId = createId();
		const issueId = createId();
		const activityId = createId();
		const statusGroupId = createId();
		const statusId = createId();
		const typeId = createId();
		await db.insert(cycle).values({
			id: staleCycleId,
			workspaceId: ids.workspace,
			teamId: ids.team,
			name: "Stale planned",
			sequence: 1,
			startDate: new Date("2020-01-01T10:00:00.000Z"),
			endDate: new Date("2020-01-08T10:00:00.000Z"),
			state: "planned",
			origin: "scheduled",
			scheduledBoundary: new Date("2020-01-01T10:00:00.000Z"),
		});
		await db.insert(issueStatusGroup).values({
			id: statusGroupId,
			workspaceId: ids.workspace,
			key: "planned",
			name: "Planned",
			canonicalCategory: "planned",
			orderIndex: 0,
		});
		await db.insert(issueStatus).values({
			id: statusId,
			workspaceId: ids.workspace,
			statusGroupId,
			name: "Planned",
			orderIndex: 0,
		});
		await db.insert(issueType).values({
			id: typeId,
			workspaceId: ids.workspace,
			teamId: ids.team,
			name: "Task",
			key: "task",
			icon: "check",
			color: "blue",
			orderIndex: 0,
		});
		await db.insert(issue).values({
			id: issueId,
			workspaceId: ids.workspace,
			teamId: ids.team,
			number: 1,
			title: "Attached",
			statusId,
			issueTypeId: typeId,
			cycleId: staleCycleId,
			creatorId: ids.manager,
			sortOrder: "a00",
		});
		await db.insert(issueActivity).values({
			id: activityId,
			workspaceId: ids.workspace,
			teamId: ids.team,
			issueId,
			cycleId: staleCycleId,
			actionType: "issue.cycle_assigned",
		});
		const artifacts = await seedScheduledArtifacts();
		await db
			.update(team)
			.set({ cycleDuration: 14 })
			.where(eq(team.id, ids.team));
		const before = await snapshotTeamState();
		const [issueBefore] = await db
			.select()
			.from(issue)
			.where(eq(issue.id, issueId));
		const [activityBefore] = await db
			.select()
			.from(issueActivity)
			.where(eq(issueActivity.id, activityId));

		const error = await withAutomationEnabled(async () =>
			expectCode(
				client(ids.manager).cycle.updateSettings(
					{
						workspaceId: ids.workspace,
						teamId: ids.team,
						expectedUpdatedAt: await currentRevision(),
						...enabledSettings,
						cadenceDays: 21,
					},
					options(ids.manager),
				),
				"SCHEDULE_RECONCILIATION_REQUIRED",
			),
		);
		expect(error.data).toEqual({
			reason: "scheduled_cycles_require_resolution",
		});
		expect(error.message).toContain("Cancel or reschedule");
		expect(JSON.stringify(error.data)).not.toContain(staleCycleId);

		const after = await snapshotTeamState();
		expect(after).toEqual(before);
		const [issueAfter] = await db
			.select()
			.from(issue)
			.where(eq(issue.id, issueId));
		const [activityAfter] = await db
			.select()
			.from(issueActivity)
			.where(eq(issueActivity.id, activityId));
		expect(issueAfter).toEqual(issueBefore);
		expect(activityAfter).toEqual(activityBefore);
		const [job] = await db
			.select()
			.from(cycleScheduleJob)
			.where(eq(cycleScheduleJob.id, artifacts.jobId));
		expect(job?.status).toBe("queued");
	});

	test("allows a compatible enable when no persisted cycles exist", async () => {
		const result = await withAutomationEnabled(async () =>
			client(ids.manager).cycle.updateSettings(
				{
					workspaceId: ids.workspace,
					teamId: ids.team,
					expectedUpdatedAt: await currentRevision(),
					...enabledSettings,
				},
				options(ids.manager),
			),
		);
		expect(result.settings.cadenceEnabled).toBeTrue();
		expect(result.settings.cadenceDays).toBe(7);
		const [updatedTeam] = await db
			.select({ cycleDuration: team.cycleDuration })
			.from(team)
			.where(eq(team.id, ids.team));
		expect(updatedTeam?.cycleDuration).toBe(7);
	});

	test("does not reject policy-only saves because an active cycle exists", async () => {
		await db
			.update(teamCycleSettings)
			.set({
				cadenceEnabled: true,
				cadenceDays: 7,
				anchorDate: new Date(enabledSettings.anchorDate),
			})
			.where(eq(teamCycleSettings.teamId, ids.team));
		await db.insert(cycle).values({
			id: createId(),
			workspaceId: ids.workspace,
			teamId: ids.team,
			name: "Active",
			sequence: 1,
			state: "active",
			origin: "scheduled",
			scheduledBoundary: new Date("2026-07-01T10:00:00.000Z"),
			startDate: new Date("2026-07-01T10:00:00.000Z"),
			endDate: new Date("2026-07-08T10:00:00.000Z"),
		});
		const cyclesBefore = await db.select().from(cycle);
		const result = await withAutomationEnabled(async () =>
			client(ids.manager).cycle.updateSettings(
				{
					workspaceId: ids.workspace,
					teamId: ids.team,
					expectedUpdatedAt: await currentRevision(),
					...enabledSettings,
					endBehavior: "reminder_only",
					reminderLeadMinutes: 120,
				},
				options(ids.manager),
			),
		);
		expect(result.settings.endBehavior).toBe("reminder_only");
		expect(result.settings.cadenceEnabled).toBeTrue();
		expect(await db.select().from(cycle)).toEqual(cyclesBefore);
	});

	test("rejects an overlapping manual cycle and preserves completed cycles", async () => {
		const { enumerateScheduledCycleOccurrences } = await import("./schedule");
		const [occurrence] = enumerateScheduledCycleOccurrences({
			workspaceTimezone: "America/New_York",
			settings: {
				...enabledSettings,
				anchorDate: new Date(enabledSettings.anchorDate),
			},
			now: new Date(),
			count: 1,
		});
		if (!occurrence) throw new Error("expected an occurrence");
		const completedId = createId();
		await db.insert(cycle).values([
			{
				id: createId(),
				workspaceId: ids.workspace,
				teamId: ids.team,
				name: "Manual overlap",
				sequence: 1,
				state: "planned",
				origin: "manual",
				startDate: occurrence.boundary,
				endDate: occurrence.endDate,
			},
			{
				id: completedId,
				workspaceId: ids.workspace,
				teamId: ids.team,
				name: "Completed",
				sequence: 2,
				state: "completed",
				origin: "scheduled",
				scheduledBoundary: new Date("2019-01-01T10:00:00.000Z"),
				startDate: new Date("2019-01-01T10:00:00.000Z"),
				endDate: new Date("2019-01-08T10:00:00.000Z"),
			},
		]);
		const [completedBefore] = await db
			.select()
			.from(cycle)
			.where(eq(cycle.id, completedId));
		const error = await withAutomationEnabled(async () =>
			expectCode(
				client(ids.manager).cycle.updateSettings(
					{
						workspaceId: ids.workspace,
						teamId: ids.team,
						expectedUpdatedAt: await currentRevision(),
						...enabledSettings,
					},
					options(ids.manager),
				),
				"SCHEDULE_RECONCILIATION_REQUIRED",
			),
		);
		expect(error.data).toEqual({ reason: "manual_cycle_conflict" });
		const [completedAfter] = await db
			.select()
			.from(cycle)
			.where(eq(cycle.id, completedId));
		expect(completedAfter).toEqual(completedBefore);
	});

	test("rejects an overlapping active cycle without mutating it", async () => {
		const { enumerateScheduledCycleOccurrences } = await import("./schedule");
		const [occurrence] = enumerateScheduledCycleOccurrences({
			workspaceTimezone: "America/New_York",
			settings: {
				...enabledSettings,
				anchorDate: new Date(enabledSettings.anchorDate),
			},
			now: new Date(),
			count: 1,
		});
		if (!occurrence) throw new Error("expected an occurrence");
		const activeId = createId();
		await db.insert(cycle).values({
			id: activeId,
			workspaceId: ids.workspace,
			teamId: ids.team,
			name: "Active overlap",
			sequence: 1,
			state: "active",
			origin: "manual",
			startDate: occurrence.boundary,
			endDate: occurrence.endDate,
		});
		const [before] = await db
			.select()
			.from(cycle)
			.where(eq(cycle.id, activeId));
		const error = await withAutomationEnabled(async () =>
			expectCode(
				client(ids.manager).cycle.updateSettings(
					{
						workspaceId: ids.workspace,
						teamId: ids.team,
						expectedUpdatedAt: await currentRevision(),
						...enabledSettings,
					},
					options(ids.manager),
				),
				"SCHEDULE_RECONCILIATION_REQUIRED",
			),
		);
		expect(error.data).toEqual({ reason: "active_cycle_conflict" });
		const [after] = await db.select().from(cycle).where(eq(cycle.id, activeId));
		expect(after).toEqual(before);
	});

	test("keeps unauthorized rejections non-disclosing and non-mutating", async () => {
		await db.insert(cycle).values({
			id: createId(),
			workspaceId: ids.workspace,
			teamId: ids.team,
			name: "Hidden",
			sequence: 1,
			startDate: new Date("2020-01-01T10:00:00.000Z"),
			endDate: new Date("2020-01-08T10:00:00.000Z"),
			state: "planned",
			origin: "scheduled",
			scheduledBoundary: new Date("2020-01-01T10:00:00.000Z"),
		});
		const before = await snapshotTeamState();
		const error = await expectCode(
			client(ids.reader).cycle.updateSettings(
				{
					workspaceId: ids.workspace,
					teamId: ids.team,
					expectedUpdatedAt: await currentRevision(),
					...enabledSettings,
				},
				options(ids.reader),
			),
			"UNAUTHORIZED",
		);
		expect(error.data).toBeUndefined();
		expect(error.message).not.toContain("cadence");
		expect(await snapshotTeamState()).toEqual(before);
	});

	test("stale expectedUpdatedAt wins over schedule reconciliation", async () => {
		await db.insert(cycle).values({
			id: createId(),
			workspaceId: ids.workspace,
			teamId: ids.team,
			name: "Stale",
			sequence: 1,
			startDate: new Date("2020-01-01T10:00:00.000Z"),
			endDate: new Date("2020-01-08T10:00:00.000Z"),
			state: "planned",
			origin: "scheduled",
			scheduledBoundary: new Date("2020-01-01T10:00:00.000Z"),
		});
		await withAutomationEnabled(async () =>
			expectCode(
				client(ids.manager).cycle.updateSettings(
					{
						workspaceId: ids.workspace,
						teamId: ids.team,
						expectedUpdatedAt: "2020-01-01T00:00:00.000Z",
						...enabledSettings,
					},
					options(ids.manager),
				),
				"SETTINGS_CHANGED",
			),
		);
	});

	test("disables cadence while preserving cycles and started job leases", async () => {
		const cycleId = createId();
		const boundary = new Date("2026-07-15T10:00:00.000Z");
		const [initial] = await db
			.select()
			.from(teamCycleSettings)
			.where(eq(teamCycleSettings.teamId, ids.team));
		if (!initial) throw new Error("settings missing");
		await db.insert(cycle).values({
			id: cycleId,
			workspaceId: ids.workspace,
			teamId: ids.team,
			name: "Keep me",
			sequence: 1,
			state: "planned",
			origin: "scheduled",
			scheduledBoundary: boundary,
			startDate: boundary,
			endDate: new Date("2026-07-22T10:00:00.000Z"),
		});
		const startedId = createId();
		const queuedId = createId();
		const blockedId = createId();
		const failedId = createId();
		const claimToken = "started-claim-token";
		await db.insert(cycleScheduleJob).values([
			{
				id: startedId,
				workspaceId: ids.workspace,
				teamId: ids.team,
				cycleId,
				jobType: "start_scheduled_cycle",
				scheduledBoundary: boundary,
				eventRevisionAt: initial.updatedAt,
				status: "started",
				attempts: 1,
				availableAt: boundary,
				leaseExpiresAt: new Date("2030-01-01T00:00:00.000Z"),
				workerId: "worker-1",
				claimToken,
				startedAt: new Date("2026-07-15T10:00:00.000Z"),
			},
			{
				id: queuedId,
				workspaceId: ids.workspace,
				teamId: ids.team,
				cycleId,
				jobType: "complete_scheduled_cycle",
				scheduledBoundary: new Date("2026-07-22T10:00:00.000Z"),
				eventRevisionAt: initial.updatedAt,
				status: "queued",
			},
			{
				id: blockedId,
				workspaceId: ids.workspace,
				teamId: ids.team,
				cycleId,
				jobType: "start_scheduled_cycle",
				scheduledBoundary: new Date("2026-07-29T10:00:00.000Z"),
				eventRevisionAt: initial.updatedAt,
				status: "blocked",
				attempts: 0,
				startedAt: new Date("2026-07-15T10:00:00.000Z"),
			},
			{
				id: failedId,
				workspaceId: ids.workspace,
				teamId: ids.team,
				cycleId,
				jobType: "send_cycle_reminder",
				scheduledBoundary: new Date("2026-07-22T10:00:00.000Z"),
				eventRevisionAt: initial.updatedAt,
				status: "failed",
				attempts: 1,
				finishedAt: new Date("2026-07-15T11:00:00.000Z"),
			},
		]);
		const [startedBefore] = await db
			.select()
			.from(cycleScheduleJob)
			.where(eq(cycleScheduleJob.id, startedId));
		await client(ids.manager).cycle.updateSettings(
			{
				workspaceId: ids.workspace,
				teamId: ids.team,
				expectedUpdatedAt: await currentRevision(),
				...settings,
				cadenceEnabled: false,
			},
			options(ids.manager),
		);
		const [keptCycle] = await db
			.select()
			.from(cycle)
			.where(eq(cycle.id, cycleId));
		expect(keptCycle?.state).toBe("planned");
		const [startedAfter] = await db
			.select()
			.from(cycleScheduleJob)
			.where(eq(cycleScheduleJob.id, startedId));
		expect(startedAfter).toEqual(startedBefore);
		expect(startedAfter?.claimToken).toBe(claimToken);
		expect(startedAfter?.workerId).toBe("worker-1");
		const [queued] = await db
			.select()
			.from(cycleScheduleJob)
			.where(eq(cycleScheduleJob.id, queuedId));
		const [blocked] = await db
			.select()
			.from(cycleScheduleJob)
			.where(eq(cycleScheduleJob.id, blockedId));
		const [failed] = await db
			.select()
			.from(cycleScheduleJob)
			.where(eq(cycleScheduleJob.id, failedId));
		expect(queued).toMatchObject({
			status: "succeeded",
			outcome: "obsolete_settings",
		});
		expect(blocked).toMatchObject({
			status: "succeeded",
			outcome: "obsolete_settings",
		});
		expect(failed).toMatchObject({
			status: "succeeded",
			outcome: "obsolete_settings",
		});
	});

	test("re-enables a compatible schedule and rejects an incompatible re-enable", async () => {
		const boundary = new Date(enabledSettings.anchorDate);
		const endDate = new Date("2026-07-08T10:00:00.000Z");
		await db.insert(cycle).values({
			id: createId(),
			workspaceId: ids.workspace,
			teamId: ids.team,
			name: "On grid",
			sequence: 1,
			state: "planned",
			origin: "scheduled",
			scheduledBoundary: boundary,
			startDate: boundary,
			endDate,
		});
		const enabled = await withAutomationEnabled(async () =>
			client(ids.manager).cycle.updateSettings(
				{
					workspaceId: ids.workspace,
					teamId: ids.team,
					expectedUpdatedAt: await currentRevision(),
					...enabledSettings,
				},
				options(ids.manager),
			),
		);
		expect(enabled.settings.cadenceEnabled).toBeTrue();
		await client(ids.manager).cycle.updateSettings(
			{
				workspaceId: ids.workspace,
				teamId: ids.team,
				expectedUpdatedAt: enabled.settings.updatedAt.toISOString(),
				...enabledSettings,
				cadenceEnabled: false,
			},
			options(ids.manager),
		);
		await db.insert(cycle).values({
			id: createId(),
			workspaceId: ids.workspace,
			teamId: ids.team,
			name: "Off grid",
			sequence: 2,
			state: "planned",
			origin: "scheduled",
			scheduledBoundary: new Date("2020-02-01T10:00:00.000Z"),
			startDate: new Date("2020-02-01T10:00:00.000Z"),
			endDate: new Date("2020-02-08T10:00:00.000Z"),
		});
		await withAutomationEnabled(async () =>
			expectCode(
				client(ids.manager).cycle.updateSettings(
					{
						workspaceId: ids.workspace,
						teamId: ids.team,
						expectedUpdatedAt: await currentRevision(),
						...enabledSettings,
					},
					options(ids.manager),
				),
				"SCHEDULE_RECONCILIATION_REQUIRED",
			),
		);
	});

	test("serializes settings updates with generation under the team lock", async () => {
		const { maintainPlannedCycleHorizon } = await import("./generation");
		await withAutomationEnabled(async () => {
			await client(ids.manager).cycle.updateSettings(
				{
					workspaceId: ids.workspace,
					teamId: ids.team,
					expectedUpdatedAt: await currentRevision(),
					...enabledSettings,
				},
				options(ids.manager),
			);
			const generated = await maintainPlannedCycleHorizon({
				workspaceId: ids.workspace,
				teamId: ids.team,
				now: new Date("2026-07-15T10:00:00.000Z"),
			});
			expect([
				"created",
				"already_satisfied",
				"scheduled_cycle_conflict",
			]).toContain(generated.status);
			await expectCode(
				client(ids.manager).cycle.updateSettings(
					{
						workspaceId: ids.workspace,
						teamId: ids.team,
						expectedUpdatedAt: await currentRevision(),
						...enabledSettings,
						cadenceDays: 21,
						anchorDate: "2026-08-01T10:00:00.000Z",
					},
					options(ids.manager),
				),
				"SCHEDULE_RECONCILIATION_REQUIRED",
			);
			const disable = await client(ids.manager).cycle.updateSettings(
				{
					workspaceId: ids.workspace,
					teamId: ids.team,
					expectedUpdatedAt: await currentRevision(),
					...enabledSettings,
					cadenceEnabled: false,
				},
				options(ids.manager),
			);
			expect(disable.settings.cadenceEnabled).toBeFalse();
			expect(
				await maintainPlannedCycleHorizon({
					workspaceId: ids.workspace,
					teamId: ids.team,
					now: new Date("2026-07-15T10:00:00.000Z"),
				}),
			).toEqual({ status: "disabled" });
		});
	});
});
