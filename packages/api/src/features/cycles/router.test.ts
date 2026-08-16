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
import { and, eq, sql } from "drizzle-orm";
import type { AuthedORPCContext } from "../../context";
import setupDb from "../../utils/prepare-tests";

let db: typeof import("db").db;
let router: typeof import("../../router").router;
let cycle: typeof import("db/features/tracker/cycles.schema").cycle;
let cycleScheduleJob: typeof import("db/features/tracker/cycle-schedule-jobs.schema").cycleScheduleJob;
let issue: typeof import("db/features/tracker/issues.schema").issue;
let issueStatus: typeof import("db/features/tracker/issue-statuses.schema").issueStatus;
let issueStatusGroup: typeof import("db/features/tracker/issue-statuses.schema").issueStatusGroup;
let issueType: typeof import("db/features/tracker/issue-types.schema").issueType;
let team: typeof import("db/features/tracker/tracker.schema").team;
let teamMembership: typeof import("db/features/tracker/tracker.schema").teamMembership;
let workspace: typeof import("db/features/tracker/tracker.schema").workspace;
let workspaceMembership: typeof import("db/features/tracker/tracker.schema").workspaceMembership;
let teamCycleSettings: typeof import("db/features/tracker/team-cycle-settings.schema").teamCycleSettings;
let user: typeof import("db/features/auth/auth.schema").user;
let permissionsCatalog: typeof import("db/features/abac/abac.schema").permissionsCatalog;
let roleDefinitions: typeof import("db/features/abac/abac.schema").roleDefinitions;
let rolePermissions: typeof import("db/features/abac/abac.schema").rolePermissions;
let roleAssignments: typeof import("db/features/abac/abac.schema").roleAssignments;
let teardown: Awaited<ReturnType<typeof setupDb>>;

const ids = {
	actor: createId(),
	workspace: createId(),
	team: createId(),
	source: createId(),
	type: createId(),
	status: createId(),
	unassignedIssue: createId(),
};

type Permission =
	| "cycle:complete"
	| "cycle:create"
	| "cycle:manage_settings"
	| "cycle:read"
	| "cycle:update"
	| "issue:create"
	| "issue:update";

function auth(userId: string): AuthedORPCContext["auth"] {
	return {
		session: {
			id: `session-${userId}`,
			userId,
			token: `token-${userId}`,
			expiresAt: new Date("2030-01-01"),
			createdAt: new Date(),
			updatedAt: new Date(),
			ipAddress: null,
			userAgent: null,
		},
		user: {
			id: userId,
			name: "Router Actor",
			email: `${userId}@example.test`,
			emailVerified: true,
			image: null,
			createdAt: new Date(),
			updatedAt: new Date(),
		},
	};
}

function options(userId = ids.actor) {
	return { context: { headers: new Headers(), auth: auth(userId) } };
}

function client(userId = ids.actor) {
	return createRouterClient<typeof router, AuthedORPCContext>(
		router,
		options(userId),
	);
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

async function seed(permissions: Permission[]) {
	await db.insert(user).values({
		id: ids.actor,
		name: "Router Actor",
		email: "router-actor@example.test",
	});
	await db.insert(workspace).values({
		id: ids.workspace,
		name: "Router Workspace",
		slug: "router-workspace",
		timezone: "UTC",
	});
	await db.insert(team).values({
		id: ids.team,
		workspaceId: ids.workspace,
		name: "Router Team",
		key: "RTR",
		privacy: "public",
	});
	await db.insert(issueType).values({
		id: ids.type,
		workspaceId: ids.workspace,
		teamId: ids.team,
		name: "Task",
		key: "task",
		icon: "check",
		color: "blue",
		orderIndex: 0,
	});
	await db.insert(issueStatusGroup).values({
		id: "cycle-router-group",
		workspaceId: ids.workspace,
		key: "planned",
		name: "Planned",
		canonicalCategory: "planned",
		orderIndex: 0,
	});
	await db.insert(issueStatus).values({
		id: ids.status,
		workspaceId: ids.workspace,
		statusGroupId: "cycle-router-group",
		name: "Planned",
		orderIndex: 0,
	});
	await db.insert(cycle).values({
		id: ids.source,
		workspaceId: ids.workspace,
		teamId: ids.team,
		name: "Source",
		sequence: 1,
		state: "active",
		startDate: new Date("2025-01-01"),
		endDate: new Date("2025-01-14"),
	});
	const { ensurePermissionCatalog } = await import("../workspaces/defaults");
	await ensurePermissionCatalog(db);
	await db.insert(roleDefinitions).values([
		{
			id: "cycle-router-workspace-role",
			workspaceId: ids.workspace,
			teamId: null,
			scopeLevel: "workspace",
			name: "Router workspace role",
			createdBy: ids.actor,
			attributes: {},
		},
		{
			id: "cycle-router-role",
			workspaceId: ids.workspace,
			teamId: ids.team,
			scopeLevel: "team",
			name: "Router role",
			createdBy: ids.actor,
			attributes: {},
		},
	]);
	const catalog = await db
		.select()
		.from(permissionsCatalog)
		.where(
			sql`${permissionsCatalog.key} in (${sql.join(
				permissions.map((key) => sql`${key}`),
				sql`, `,
			)})`,
		);
	if (catalog.length !== permissions.length)
		throw new Error("permission catalog was not seeded");
	await db.insert(rolePermissions).values(
		catalog.map((permission): typeof rolePermissions.$inferInsert => ({
			roleId: "cycle-router-role",
			permissionId: permission.id,
			effect: "allow",
			attributes: {},
		})),
	);
	await db.insert(roleAssignments).values({
		id: "cycle-router-assignment",
		roleId: "cycle-router-role",
		userId: ids.actor,
		workspaceId: ids.workspace,
		teamId: ids.team,
		assignedBy: ids.actor,
		attributes: {},
	});
	await db.insert(workspaceMembership).values({
		id: "cycle-router-workspace-membership",
		workspaceId: ids.workspace,
		userId: ids.actor,
		roleId: "cycle-router-workspace-role",
		status: "active",
		joinedAt: new Date(),
	});
	await db.insert(teamMembership).values({
		id: "cycle-router-team-membership",
		teamId: ids.team,
		userId: ids.actor,
		roleId: "cycle-router-role",
		status: "active",
	});
}

async function grant(permissions: Permission[]) {
	const catalog = await db
		.select()
		.from(permissionsCatalog)
		.where(
			sql`${permissionsCatalog.key} in (${sql.join(
				permissions.map((key) => sql`${key}`),
				sql`, `,
			)})`,
		);
	await db.insert(rolePermissions).values(
		catalog.map((permission): typeof rolePermissions.$inferInsert => ({
			roleId: "cycle-router-role",
			permissionId: permission.id,
			effect: "allow",
			attributes: {},
		})),
	);
}

async function sourceState() {
	const [source] = await db
		.select({ state: cycle.state })
		.from(cycle)
		.where(eq(cycle.id, ids.source));
	return source?.state;
}

async function seedFailedStartJob(
	boundary = new Date("2026-07-15T10:00:00.000Z"),
) {
	await db
		.update(cycle)
		.set({
			state: "planned",
			origin: "scheduled",
			scheduledBoundary: boundary,
			startDate: boundary,
			endDate: new Date(boundary.getTime() + 7 * 86_400_000),
		})
		.where(eq(cycle.id, ids.source));
	const [settings] = await db
		.insert(teamCycleSettings)
		.values({
			teamId: ids.team,
			cadenceEnabled: true,
			cadenceDays: 7,
			anchorDate: boundary,
			planningHorizon: 2,
			endBehavior: "automatic",
			gracePeriodMinutes: 0,
			defaultRolloverPolicy: "carry_over",
			reminderLeadMinutes: 60,
			updatedBy: null,
		})
		.returning();
	if (!settings) throw new Error("settings missing");
	const jobId = createId();
	await db.insert(cycleScheduleJob).values({
		id: jobId,
		workspaceId: ids.workspace,
		teamId: ids.team,
		cycleId: ids.source,
		jobType: "start_scheduled_cycle",
		scheduledBoundary: boundary,
		eventRevisionAt: settings.updatedAt,
		status: "failed",
		attempts: 8,
		availableAt: boundary,
		finishedAt: new Date(),
		outcome: "transient_error",
		lastErrorCode: "TRANSIENT_RUNTIME_ERROR",
		lastErrorSummary: "redacted",
	});
	return jobId;
}

async function waitForWaiter() {
	for (let attempt = 0; attempt < 100; attempt++) {
		const result = await db.execute<{ waiting: boolean }>(
			sql`select exists (select 1 from pg_locks where locktype = 'advisory' and not granted) as waiting`,
		);
		if (result.rows[0]?.waiting) return;
		await Bun.sleep(10);
	}
	throw new Error("route never waited for the cycle advisory lock");
}

beforeAll(async () => {
	teardown = await setupDb();
	({ db } = await import("db"));
	({ cycle } = await import("db/features/tracker/cycles.schema"));
	({ cycleScheduleJob } = await import(
		"db/features/tracker/cycle-schedule-jobs.schema"
	));
	({ issue } = await import("db/features/tracker/issues.schema"));
	({ issueStatus, issueStatusGroup } = await import(
		"db/features/tracker/issue-statuses.schema"
	));
	({ issueType } = await import("db/features/tracker/issue-types.schema"));
	({ team, teamMembership, workspace, workspaceMembership } = await import(
		"db/features/tracker/tracker.schema"
	));
	({ teamCycleSettings } = await import(
		"db/features/tracker/team-cycle-settings.schema"
	));
	({ user } = await import("db/features/auth/auth.schema"));
	({ permissionsCatalog, roleDefinitions, rolePermissions, roleAssignments } =
		await import("db/features/abac/abac.schema"));
	const { mock } = await import("bun:test");
	mock.module("../issues/publisher", () => ({
		issuePublisher: { publish: async () => {} },
	}));
	({ router } = await import("../../router"));
}, 300_000);
afterAll(async () => {
	if (teardown) await teardown();
}, 60_000);
beforeEach(async () => {
	await db.execute(
		sql`truncate table issue_activity, issue, cycle, issue_status, issue_status_group, issue_type, role_assignments, role_permissions, role_definitions, permissions_catalog, team, workspace, "user" cascade`,
	);
});

describe("cycle router authorization and transitions", () => {
	test("lists only current lifecycle problems for an authorized manager", async () => {
		await seed(["cycle:manage_settings", "cycle:read", "cycle:update"]);
		const jobId = await seedFailedStartJob();
		const [currentJob] = await db
			.select()
			.from(cycleScheduleJob)
			.where(eq(cycleScheduleJob.id, jobId));
		if (!currentJob?.eventRevisionAt) throw new Error("current job missing");
		await db.insert(cycleScheduleJob).values({
			id: createId(),
			workspaceId: ids.workspace,
			teamId: ids.team,
			cycleId: ids.source,
			jobType: "start_scheduled_cycle",
			scheduledBoundary: currentJob.scheduledBoundary,
			eventRevisionAt: new Date(currentJob.eventRevisionAt.getTime() - 1_000),
			status: "failed",
			attempts: 8,
			availableAt: currentJob.availableAt,
			finishedAt: new Date(),
			outcome: "transient_error",
			lastErrorSummary: "obsolete failure",
		});
		await db.insert(cycleScheduleJob).values({
			id: createId(),
			workspaceId: ids.workspace,
			teamId: ids.team,
			jobType: "generate_planned_cycles",
			scheduledBoundary: new Date(),
			status: "failed",
			attempts: 8,
			availableAt: new Date(),
			finishedAt: new Date(),
		});

		const failed = await client().cycle.listLifecycleProblems(
			{ workspaceId: ids.workspace, teamId: ids.team },
			options(),
		);
		expect(failed).toHaveLength(1);
		expect(failed[0]).toMatchObject({
			id: jobId,
			cycleId: ids.source,
			cycleName: "Source",
			jobType: "start_scheduled_cycle",
			status: "failed",
			attempts: 8,
			maxAttempts: 8,
			lastErrorCode: "TRANSIENT_RUNTIME_ERROR",
			lastErrorSummary:
				"Cycle automation failed. Retry the job or inspect worker telemetry.",
			canRetry: true,
		});

		await db
			.update(cycleScheduleJob)
			.set({
				status: "blocked",
				attempts: 0,
				startedAt: new Date(),
				finishedAt: null,
				outcome: "active_cycle_blocked",
			})
			.where(eq(cycleScheduleJob.id, jobId));
		const blocked = await client().cycle.listLifecycleProblems(
			{ workspaceId: ids.workspace, teamId: ids.team },
			options(),
		);
		expect(blocked[0]).toMatchObject({ status: "blocked", canRetry: false });

		await db
			.update(cycleScheduleJob)
			.set({ status: "queued", attempts: 1, outcome: "transient_error" })
			.where(eq(cycleScheduleJob.id, jobId));
		const retrying = await client().cycle.listLifecycleProblems(
			{ workspaceId: ids.workspace, teamId: ids.team },
			options(),
		);
		expect(retrying[0]).toMatchObject({ status: "queued", attempts: 1 });
		await db
			.update(cycleScheduleJob)
			.set({ attempts: 0, outcome: null })
			.where(eq(cycleScheduleJob.id, jobId));
		expect(
			await client().cycle.listLifecycleProblems(
				{ workspaceId: ids.workspace, teamId: ids.team },
				options(),
			),
		).toEqual([]);
	});

	test("hides stale scheduled provenance and unsafe persisted problem text", async () => {
		await seed(["cycle:manage_settings", "cycle:read", "cycle:update"]);
		const jobId = await seedFailedStartJob();
		await db
			.update(cycleScheduleJob)
			.set({
				outcome: "customer-123 api_key=super-secret",
				lastErrorCode: "SECRET_customer-123",
				lastErrorSummary: "token=super-secret customer-123",
			})
			.where(eq(cycleScheduleJob.id, jobId));
		const sanitized = await client().cycle.listLifecycleProblems(
			{ workspaceId: ids.workspace, teamId: ids.team },
			options(),
		);
		expect(sanitized).toHaveLength(1);
		expect(sanitized[0]).toMatchObject({
			outcome: null,
			lastErrorCode: null,
			lastErrorSummary:
				"Cycle automation failed. Retry the job or inspect worker telemetry.",
		});
		expect(JSON.stringify(sanitized)).not.toContain("super-secret");
		expect(JSON.stringify(sanitized)).not.toContain("customer-123");

		await db
			.update(cycle)
			.set({
				scheduledBoundary: new Date("2026-07-16T10:00:00.000Z"),
			})
			.where(eq(cycle.id, ids.source));
		expect(
			await client().cycle.listLifecycleProblems(
				{ workspaceId: ids.workspace, teamId: ids.team },
				options(),
			),
		).toEqual([]);
	});

	test("derives completion retry capability from both required permissions", async () => {
		await seed([
			"cycle:manage_settings",
			"cycle:read",
			"cycle:complete",
			"issue:update",
		]);
		await seedFailedStartJob();
		const [settings] = await db.select().from(teamCycleSettings);
		if (!settings) throw new Error("settings missing");
		const endDate = new Date("2026-07-22T10:00:00.000Z");
		await db
			.update(cycle)
			.set({ state: "active", endDate })
			.where(eq(cycle.id, ids.source));
		const completionJobId = createId();
		await db.insert(cycleScheduleJob).values({
			id: completionJobId,
			workspaceId: ids.workspace,
			teamId: ids.team,
			cycleId: ids.source,
			jobType: "complete_scheduled_cycle",
			scheduledBoundary: endDate,
			eventRevisionAt: settings.updatedAt,
			status: "failed",
			attempts: 8,
			availableAt: endDate,
			finishedAt: new Date(),
			outcome: "no_rollover_target",
			lastErrorSummary: "No rollover target is available",
		});
		const problems = await client().cycle.listLifecycleProblems(
			{ workspaceId: ids.workspace, teamId: ids.team },
			options(),
		);
		expect(problems).toHaveLength(1);
		expect(problems[0]).toMatchObject({
			id: completionJobId,
			jobType: "complete_scheduled_cycle",
			canRetry: true,
		});
	});

	test("protects lifecycle problem visibility and retry capability", async () => {
		await seed(["cycle:read", "cycle:manage_settings"]);
		await seedFailedStartJob();
		const managerRows = await client().cycle.listLifecycleProblems(
			{ workspaceId: ids.workspace, teamId: ids.team },
			options(),
		);
		expect(managerRows[0]?.canRetry).toBe(false);
		await db.execute(sql`truncate table role_permissions cascade`);
		await grant(["cycle:read"]);
		await expectCode(
			client().cycle.listLifecycleProblems(
				{ workspaceId: ids.workspace, teamId: ids.team },
				options(),
			),
			"UNAUTHORIZED",
		);
		const outsiderId = createId();
		await expectCode(
			client(outsiderId).cycle.listLifecycleProblems(
				{ workspaceId: ids.workspace, teamId: ids.team },
				options(outsiderId),
			),
			"UNAUTHORIZED",
		);
	});

	test("retries a current failed start job with read and update permissions", async () => {
		await seed(["cycle:read", "cycle:update"]);
		const jobId = await seedFailedStartJob();
		expect(
			await client().cycle.retryLifecycleJob(
				{ workspaceId: ids.workspace, jobId },
				options(),
			),
		).toMatchObject({
			status: "retried",
			jobId,
			jobType: "start_scheduled_cycle",
		});
		const [job] = await db
			.select()
			.from(cycleScheduleJob)
			.where(eq(cycleScheduleJob.id, jobId));
		expect(job).toMatchObject({ status: "queued", attempts: 0 });
		expect(job?.finishedAt).toBeNull();
	});

	test("requires active team membership for lifecycle retry", async () => {
		await seed(["cycle:read", "cycle:update"]);
		const jobId = await seedFailedStartJob();
		await db
			.update(teamMembership)
			.set({ status: "inactive" })
			.where(
				and(
					eq(teamMembership.teamId, ids.team),
					eq(teamMembership.userId, ids.actor),
				),
			);
		await expectCode(
			client().cycle.retryLifecycleJob(
				{ workspaceId: ids.workspace, jobId },
				options(),
			),
			"NOT_FOUND",
		);
		await db
			.delete(teamMembership)
			.where(
				and(
					eq(teamMembership.teamId, ids.team),
					eq(teamMembership.userId, ids.actor),
				),
			);
		await expectCode(
			client().cycle.retryLifecycleJob(
				{ workspaceId: ids.workspace, jobId },
				options(),
			),
			"NOT_FOUND",
		);
	});

	test("resets future lifecycle retries to their policy due times", async () => {
		await seed([
			"cycle:read",
			"cycle:update",
			"cycle:complete",
			"issue:update",
		]);
		const futureStart = new Date("2030-01-10T10:00:00.000Z");
		const startJobId = await seedFailedStartJob(futureStart);
		await client().cycle.retryLifecycleJob(
			{ workspaceId: ids.workspace, jobId: startJobId },
			options(),
		);
		const [startJob] = await db
			.select()
			.from(cycleScheduleJob)
			.where(eq(cycleScheduleJob.id, startJobId));
		expect(startJob?.availableAt).toEqual(futureStart);

		const futureEnd = new Date("2030-01-17T10:00:00.000Z");
		await db
			.update(cycle)
			.set({ state: "active", endDate: futureEnd })
			.where(eq(cycle.id, ids.source));
		const [settings] = await db
			.update(teamCycleSettings)
			.set({ gracePeriodMinutes: 60, updatedAt: new Date() })
			.where(eq(teamCycleSettings.teamId, ids.team))
			.returning();
		if (!settings) throw new Error("settings missing");
		const completionJobId = createId();
		await db.insert(cycleScheduleJob).values({
			id: completionJobId,
			workspaceId: ids.workspace,
			teamId: ids.team,
			cycleId: ids.source,
			jobType: "complete_scheduled_cycle",
			scheduledBoundary: futureEnd,
			eventRevisionAt: settings.updatedAt,
			status: "failed",
			attempts: 8,
			availableAt: new Date(),
			finishedAt: new Date(),
			outcome: "transient_error",
		});
		await client().cycle.retryLifecycleJob(
			{ workspaceId: ids.workspace, jobId: completionJobId },
			options(),
		);
		const [completionJob] = await db
			.select()
			.from(cycleScheduleJob)
			.where(eq(cycleScheduleJob.id, completionJobId));
		expect(completionJob?.availableAt).toEqual(
			new Date(futureEnd.getTime() + 60 * 60_000),
		);
	});

	test("hides foreign-team jobs and rejects non-lifecycle job types", async () => {
		await seed(["cycle:read", "cycle:update"]);
		const generationJobId = createId();
		await db.insert(cycleScheduleJob).values({
			id: generationJobId,
			workspaceId: ids.workspace,
			teamId: ids.team,
			jobType: "generate_planned_cycles",
			scheduledBoundary: new Date(),
			status: "failed",
			attempts: 8,
			availableAt: new Date(),
			finishedAt: new Date(),
		});
		await expectCode(
			client().cycle.retryLifecycleJob(
				{ workspaceId: ids.workspace, jobId: generationJobId },
				options(),
			),
			"NOT_FOUND",
		);

		const foreignTeamId = createId();
		const foreignCycleId = createId();
		const boundary = new Date("2030-02-01T10:00:00.000Z");
		await db.insert(team).values({
			id: foreignTeamId,
			workspaceId: ids.workspace,
			name: "Foreign team",
			key: "FRT",
			privacy: "public",
		});
		const [foreignSettings] = await db
			.insert(teamCycleSettings)
			.values({
				teamId: foreignTeamId,
				cadenceEnabled: true,
				cadenceDays: 7,
				anchorDate: boundary,
				planningHorizon: 2,
				endBehavior: "automatic",
				gracePeriodMinutes: 0,
				defaultRolloverPolicy: "carry_over",
				reminderLeadMinutes: 60,
				updatedBy: null,
			})
			.returning();
		if (!foreignSettings) throw new Error("foreign settings missing");
		await db.insert(cycle).values({
			id: foreignCycleId,
			workspaceId: ids.workspace,
			teamId: foreignTeamId,
			name: "Foreign cycle",
			sequence: 1,
			state: "planned",
			origin: "scheduled",
			scheduledBoundary: boundary,
			startDate: boundary,
			endDate: new Date(boundary.getTime() + 7 * 86_400_000),
		});
		const foreignJobId = createId();
		await db.insert(cycleScheduleJob).values({
			id: foreignJobId,
			workspaceId: ids.workspace,
			teamId: foreignTeamId,
			cycleId: foreignCycleId,
			jobType: "start_scheduled_cycle",
			scheduledBoundary: boundary,
			eventRevisionAt: foreignSettings.updatedAt,
			status: "failed",
			attempts: 8,
			availableAt: boundary,
			finishedAt: new Date(),
		});
		await expectCode(
			client().cycle.retryLifecycleJob(
				{ workspaceId: ids.workspace, jobId: foreignJobId },
				options(),
			),
			"NOT_FOUND",
		);
	});

	test("protects lifecycle retries and rejects nonfailed or obsolete jobs", async () => {
		await seed(["cycle:read"]);
		const jobId = await seedFailedStartJob();
		await expectCode(
			client().cycle.retryLifecycleJob(
				{ workspaceId: ids.workspace, jobId },
				options(),
			),
			"NOT_FOUND",
		);
		await expectCode(
			client().cycle.retryLifecycleJob(
				{ workspaceId: ids.workspace, jobId: createId() },
				options(),
			),
			"NOT_FOUND",
		);
		await grant(["cycle:update"]);
		await db
			.update(cycleScheduleJob)
			.set({
				status: "succeeded",
				finishedAt: new Date(),
				outcome: "started",
			})
			.where(eq(cycleScheduleJob.id, jobId));
		await expectCode(
			client().cycle.retryLifecycleJob(
				{ workspaceId: ids.workspace, jobId },
				options(),
			),
			"JOB_NOT_FAILED",
		);
		await db
			.update(cycleScheduleJob)
			.set({ status: "failed", finishedAt: new Date() })
			.where(eq(cycleScheduleJob.id, jobId));
		await db
			.update(teamCycleSettings)
			.set({ cadenceEnabled: false })
			.where(eq(teamCycleSettings.teamId, ids.team));
		await expectCode(
			client().cycle.retryLifecycleJob(
				{ workspaceId: ids.workspace, jobId },
				options(),
			),
			"JOB_OBSOLETE",
		);
	});

	test("requires completion and issue update permissions for completion retry", async () => {
		await seed(["cycle:read", "cycle:complete"]);
		const startJobId = await seedFailedStartJob();
		const [settings] = await db.select().from(teamCycleSettings);
		if (!settings) throw new Error("settings missing");
		const end = new Date("2026-07-22T10:00:00.000Z");
		await db
			.update(cycle)
			.set({ state: "active" })
			.where(eq(cycle.id, ids.source));
		const completionJobId = createId();
		await db.insert(cycleScheduleJob).values({
			id: completionJobId,
			workspaceId: ids.workspace,
			teamId: ids.team,
			cycleId: ids.source,
			jobType: "complete_scheduled_cycle",
			scheduledBoundary: end,
			eventRevisionAt: settings.updatedAt,
			status: "failed",
			attempts: 8,
			availableAt: end,
			finishedAt: new Date(),
			outcome: "transient_error",
		});
		await expectCode(
			client().cycle.retryLifecycleJob(
				{ workspaceId: ids.workspace, jobId: completionJobId },
				options(),
			),
			"NOT_FOUND",
		);
		await grant(["issue:update"]);
		expect(
			await client().cycle.retryLifecycleJob(
				{ workspaceId: ids.workspace, jobId: completionJobId },
				options(),
			),
		).toMatchObject({ status: "retried" });
		await expectCode(
			client().cycle.retryLifecycleJob(
				{ workspaceId: createId(), jobId: startJobId },
				options(),
			),
			"NOT_FOUND",
		);
	});

	test("requires both completion and issue update permissions", async () => {
		await seed(["cycle:complete"]);
		await expectCode(
			client().cycle.complete(
				{
					workspaceId: ids.workspace,
					cycleId: ids.source,
					disposition: { type: "moveToBacklog" },
				},
				options(),
			),
			"UNAUTHORIZED",
		);
		expect(await sourceState()).toBe("active");
		await db.execute(
			sql`truncate table role_assignments, role_permissions cascade`,
		);
		await db.insert(roleAssignments).values({
			id: "cycle-router-assignment",
			roleId: "cycle-router-role",
			userId: ids.actor,
			workspaceId: ids.workspace,
			teamId: ids.team,
			assignedBy: ids.actor,
			attributes: {},
		});
		await grant(["issue:update"]);
		await expectCode(
			client().cycle.complete(
				{
					workspaceId: ids.workspace,
					cycleId: ids.source,
					disposition: { type: "moveToBacklog" },
				},
				options(),
			),
			"UNAUTHORIZED",
		);
		expect(await sourceState()).toBe("active");
	});

	test("allows a non-default ABAC role with both permissions", async () => {
		await seed(["cycle:complete", "issue:update"]);
		await db.insert(issue).values({
			id: createId(),
			workspaceId: ids.workspace,
			teamId: ids.team,
			number: 1,
			title: "Member",
			statusId: ids.status,
			issueTypeId: ids.type,
			cycleId: ids.source,
			creatorId: ids.actor,
			sortOrder: "a00",
		});
		const result = await client().cycle.complete(
			{
				workspaceId: ids.workspace,
				cycleId: ids.source,
				disposition: { type: "moveToBacklog" },
			},
			options(),
		);
		expect(result.ok).toBeTrue();
		expect(await sourceState()).toBe("completed");
	});

	test("rejects manual activation while another team cycle is active", async () => {
		await seed(["cycle:update"]);
		await db
			.update(cycle)
			.set({
				state: "planned",
				startDate: new Date("2025-01-14"),
				endDate: new Date("2025-01-28"),
			})
			.where(eq(cycle.id, ids.source));
		await db.insert(cycle).values({
			id: "cycle-router-active-blocker",
			workspaceId: ids.workspace,
			teamId: ids.team,
			name: "Active blocker",
			sequence: 2,
			state: "active",
			startDate: new Date("2025-01-01"),
			endDate: new Date("2025-01-14"),
		});

		await expectCode(
			client().cycle.update(
				{ id: ids.source, workspaceId: ids.workspace, state: "active" },
				options(),
			),
			"INVALID_STATE_TRANSITION",
		);
		expect(await sourceState()).toBe("planned");
	});

	test("rejects generic completion and protects cancellation with completion permission", async () => {
		await seed(["cycle:update"]);
		await expectCode(
			client().cycle.update(
				{ id: ids.source, workspaceId: ids.workspace, state: "completed" },
				options(),
			),
			"INVALID_STATE_TRANSITION",
		);
		await expectCode(
			client().cycle.update(
				{ id: ids.source, workspaceId: ids.workspace, state: "canceled" },
				options(),
			),
			"UNAUTHORIZED",
		);
		expect(await sourceState()).toBe("active");
		await db.execute(
			sql`truncate table role_assignments, role_permissions cascade`,
		);
		await db.insert(roleAssignments).values({
			id: "cycle-router-assignment",
			roleId: "cycle-router-role",
			userId: ids.actor,
			workspaceId: ids.workspace,
			teamId: ids.team,
			assignedBy: ids.actor,
			attributes: {},
		});
		await grant(["cycle:complete"]);
		const updated = await client().cycle.update(
			{ id: ids.source, workspaceId: ids.workspace, state: "canceled" },
			options(),
		);
		expect(updated.state).toBe("canceled");
	});
});

describe("planned-cycle generation races", () => {
	test("serializes the real cycle.create route with horizon maintenance", async () => {
		await seed(["cycle:create"]);
		await db.insert(teamCycleSettings).values({
			teamId: ids.team,
			cadenceEnabled: true,
			cadenceDays: 7,
			anchorDate: new Date("2026-07-15T10:00:00.000Z"),
			planningHorizon: 2,
			endBehavior: "automatic",
			gracePeriodMinutes: 0,
			defaultRolloverPolicy: "carry_over",
			reminderLeadMinutes: 60,
			updatedBy: null,
		});
		const { maintainPlannedCycleHorizon } = await import("./generation");
		const generation = maintainPlannedCycleHorizon({
			workspaceId: ids.workspace,
			teamId: ids.team,
			now: new Date("2026-07-15T10:00:00.000Z"),
		});
		const creation = client().cycle.create(
			{
				workspaceId: ids.workspace,
				teamId: ids.team,
				startDate: "2026-07-15T10:00:00.000Z",
				endDate: "2026-07-22T10:00:00.000Z",
			},
			options(),
		);
		const [generated, created] = await Promise.allSettled([
			generation,
			creation,
		]);
		const rows = await db
			.select()
			.from(cycle)
			.where(eq(cycle.teamId, ids.team));
		expect(new Set(rows.map((row) => row.sequence)).size).toBe(rows.length);
		if (
			generated.status === "fulfilled" &&
			generated.value.status === "created"
		) {
			expect(created.status).toBe("rejected");
			if (created.status !== "rejected")
				throw new Error("route unexpectedly fulfilled");
			expect(created.reason).toBeInstanceOf(ORPCError);
			if (!(created.reason instanceof ORPCError)) {
				throw new Error("route rejected with an untyped error");
			}
			expect(created.reason.code).toBe("CYCLE_OVERLAP");
			const horizonRows = rows.filter(
				(row) => row.startDate >= new Date("2026-07-15T10:00:00.000Z"),
			);
			expect(horizonRows).toHaveLength(2);
			expect(horizonRows.map((row) => row.origin)).toEqual([
				"scheduled",
				"scheduled",
			]);
			expect(
				horizonRows.map((row) => row.scheduledBoundary?.toISOString()),
			).toEqual(["2026-07-15T10:00:00.000Z", "2026-07-22T10:00:00.000Z"]);
			expect(generated.value.created).toHaveLength(2);
		} else {
			expect(generated.status).toBe("fulfilled");
			if (generated.status !== "fulfilled") {
				throw new Error(
					"generation rejected before conflicting with the route",
				);
			}
			expect(generated.value.status).toBe("manual_cycle_conflict");
			expect(created.status).toBe("fulfilled");
			const horizonRows = rows.filter(
				(row) => row.startDate >= new Date("2026-07-15T10:00:00.000Z"),
			);
			expect(horizonRows).toHaveLength(1);
			expect(horizonRows[0]?.origin).toBe("manual");
			expect(horizonRows[0]?.startDate.toISOString()).toBe(
				"2026-07-15T10:00:00.000Z",
			);
			expect(horizonRows[0]?.endDate.toISOString()).toBe(
				"2026-07-22T10:00:00.000Z",
			);
		}
	});
});

describe("issue assignment races", () => {
	async function completionFirst<T>(assignment: () => Promise<T>) {
		return await db.transaction(async (tx) => {
			await tx.execute(
				sql`select pg_advisory_xact_lock(hashtext(${`cycle:${ids.workspace}:${ids.team}`}))`,
			);
			const completing = client().cycle.complete(
				{
					workspaceId: ids.workspace,
					cycleId: ids.source,
					disposition: { type: "moveToBacklog" },
				},
				options(),
			);
			await waitForWaiter();
			const assigned = assignment();
			return { completing, assigned };
		});
	}

	test("create revalidates after a completion-first advisory-lock gate", async () => {
		await seed([
			"cycle:complete",
			"cycle:read",
			"issue:update",
			"issue:create",
		]);
		const { completing, assigned } = await completionFirst(() =>
			client().issue.create(
				{
					workspaceId: ids.workspace,
					teamId: ids.team,
					title: "Racing create",
					statusId: ids.status,
					issueTypeId: ids.type,
					cycleId: ids.source,
				},
				options(),
			),
		);
		await completing;
		await expectCode(assigned, "CYCLE_CLOSED");
		expect(await sourceState()).toBe("completed");
		const rows = await db
			.select()
			.from(issue)
			.where(eq(issue.cycleId, ids.source));
		expect(rows).toHaveLength(0);
	});

	test("update revalidates after a completion-first advisory-lock gate", async () => {
		await seed(["cycle:complete", "cycle:update", "issue:update"]);
		await db.insert(issue).values({
			id: ids.unassignedIssue,
			workspaceId: ids.workspace,
			teamId: ids.team,
			number: 1,
			title: "Unassigned",
			statusId: ids.status,
			issueTypeId: ids.type,
			creatorId: ids.actor,
			sortOrder: "a00",
		});
		const { completing, assigned } = await completionFirst(() =>
			client().issue.update(
				{
					id: ids.unassignedIssue,
					workspaceId: ids.workspace,
					cycleId: ids.source,
				},
				options(),
			),
		);
		await completing;
		await expectCode(assigned, "CYCLE_CLOSED");
		const [row] = await db
			.select({ cycleId: issue.cycleId })
			.from(issue)
			.where(
				and(
					eq(issue.id, ids.unassignedIssue),
					eq(issue.workspaceId, ids.workspace),
				),
			);
		expect(row?.cycleId).toBeNull();
	});
});
