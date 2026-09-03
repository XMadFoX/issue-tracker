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
let issuePublisher: typeof import("../issues/publisher").issuePublisher;
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
	updater: createId(),
	reader: createId(),
	noAccess: createId(),
	team: createId(),
	privateTeam: createId(),
	workspace: createId(),
	wrongWorkspace: createId(),
};

const enabledAnchor = "2026-07-01T10:00:00.000Z";
const now = new Date("2026-07-15T10:00:00.000Z");

function auth(userId: string): AuthedORPCContext["auth"] {
	return {
		session: {
			id: createId(),
			userId,
			token: "workspace-timezone-token",
			expiresAt: new Date("2030-01-01"),
			createdAt: new Date(),
			updatedAt: new Date(),
			ipAddress: null,
			userAgent: null,
		},
		user: {
			id: userId,
			name: "Timezone User",
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

const scheduleSettings = {
	cadenceEnabled: true,
	cadenceDays: 7,
	anchorDate: new Date(enabledAnchor),
	endBehavior: "automatic" as const,
	gracePeriodMinutes: 0,
	reminderLeadMinutes: 60,
};

const enabledSettingsInput = {
	cadenceEnabled: true,
	cadenceDays: 7,
	anchorDate: enabledAnchor,
	planningHorizon: 2,
	endBehavior: "automatic" as const,
	gracePeriodMinutes: 0,
	defaultRolloverPolicy: "carry_over" as const,
	reminderLeadMinutes: 60,
};

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
		name: `Timezone ${roleId}`,
		createdBy: ids.admin,
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
		assignedBy: ids.admin,
		attributes: {},
	});
}

async function currentRevision(teamId = ids.team) {
	const [row] = await db
		.select({ updatedAt: teamCycleSettings.updatedAt })
		.from(teamCycleSettings)
		.where(eq(teamCycleSettings.teamId, teamId));
	if (!row) throw new Error("settings missing");
	return row.updatedAt.toISOString();
}

async function snapshotState() {
	const [workspaceRow] = await db
		.select()
		.from(workspace)
		.where(eq(workspace.id, ids.workspace));
	const teams = await db
		.select()
		.from(team)
		.where(eq(team.workspaceId, ids.workspace))
		.orderBy(team.id);
	const settingsRows = await db
		.select()
		.from(teamCycleSettings)
		.orderBy(teamCycleSettings.teamId);
	const cycles = await db.select().from(cycle).orderBy(cycle.id);
	const jobs = await db
		.select()
		.from(cycleScheduleJob)
		.orderBy(cycleScheduleJob.id);
	const actions = await db
		.select()
		.from(cycleActionRequired)
		.orderBy(cycleActionRequired.id);
	const notifications = await db
		.select()
		.from(cycleNotification)
		.orderBy(cycleNotification.id);
	const issues = await db.select().from(issue).orderBy(issue.id);
	const activities = await db
		.select()
		.from(issueActivity)
		.orderBy(issueActivity.id);
	return {
		workspaceRow,
		teams,
		settingsRows,
		cycles,
		jobs,
		actions,
		notifications,
		issues,
		activities,
	};
}

async function occurrenceAt({
	timezone,
	now: occurrenceNow = now,
}: {
	timezone: string;
	now?: Date;
}) {
	const { enumerateScheduledCycleOccurrences } = await import(
		"../cycles/schedule"
	);
	const [occurrence] = enumerateScheduledCycleOccurrences({
		workspaceTimezone: timezone,
		settings: scheduleSettings,
		now: occurrenceNow,
		count: 1,
	});
	if (!occurrence) throw new Error("expected occurrence");
	return occurrence;
}

async function deriveDivergentOccurrence({
	sourceTimezone,
	targetTimezone,
	settings = scheduleSettings,
	now: occurrenceNow = now,
}: {
	sourceTimezone: string;
	targetTimezone: string;
	settings?: typeof scheduleSettings;
	now?: Date;
}) {
	const { cadenceOccurrenceAtBoundary, enumerateScheduledCycleOccurrences } =
		await import("../cycles/schedule");
	const [source] = enumerateScheduledCycleOccurrences({
		workspaceTimezone: sourceTimezone,
		settings,
		now: occurrenceNow,
		count: 1,
	});
	if (!source) throw new Error("expected source occurrence");
	const retargeted = cadenceOccurrenceAtBoundary({
		workspaceTimezone: targetTimezone,
		settings,
		boundary: source.boundary,
	});
	const identical =
		retargeted !== null &&
		retargeted.boundary.getTime() === source.boundary.getTime() &&
		retargeted.endDate.getTime() === source.endDate.getTime();
	if (identical) {
		throw new Error(
			`fixture is not identity-divergent: ${sourceTimezone} -> ${targetTimezone} ${source.boundary.toISOString()} ${source.endDate.toISOString()}`,
		);
	}
	return source;
}

async function enableCadence(teamId = ids.team) {
	await db
		.update(teamCycleSettings)
		.set({
			cadenceEnabled: true,
			cadenceDays: 7,
			anchorDate: new Date(enabledAnchor),
			planningHorizon: 2,
			endBehavior: "automatic",
			gracePeriodMinutes: 0,
			reminderLeadMinutes: 60,
		})
		.where(eq(teamCycleSettings.teamId, teamId));
}

async function insertIssueFixture({ cycleId }: { cycleId: string | null }) {
	const suffix = createId();
	const statusGroupId = createId();
	const statusId = createId();
	const issueTypeId = createId();
	const issueId = createId();
	await db.insert(issueStatusGroup).values({
		id: statusGroupId,
		workspaceId: ids.workspace,
		key: `planned-${suffix}`,
		name: `Planned ${suffix}`,
		canonicalCategory: "planned",
		orderIndex: 0,
	});
	await db.insert(issueStatus).values({
		id: statusId,
		workspaceId: ids.workspace,
		statusGroupId,
		name: `Status ${suffix}`,
		orderIndex: 0,
	});
	await db.insert(issueType).values({
		id: issueTypeId,
		workspaceId: ids.workspace,
		teamId: ids.team,
		name: `Task ${suffix}`,
		key: `task-${suffix}`,
		icon: "check",
		color: "blue",
		orderIndex: 0,
	});
	await db.insert(issue).values({
		id: issueId,
		workspaceId: ids.workspace,
		teamId: ids.team,
		number: 1,
		title: `Issue ${suffix}`,
		statusId,
		issueTypeId,
		cycleId,
		creatorId: ids.updater,
		sortOrder: "a00",
	});
	return { issueId, issueTypeId, statusId };
}

async function runIssueTimezoneRace({
	issueOperation,
	winner,
}: {
	issueOperation: () => Promise<unknown>;
	winner: "issue" | "timezone";
}) {
	const events: string[] = [];
	const lockName =
		winner === "issue"
			? `issue-hierarchy:${ids.workspace}:${ids.team}`
			: `cycle:${ids.workspace}:${ids.team}`;
	const tasks = await db.transaction(async (tx) => {
		await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${lockName}))`);
		const timezoneOperation = () =>
			client(ids.updater)
				.workspace.update(
					{ id: ids.workspace, timezone: "UTC" },
					options(ids.updater),
				)
				.then(() => {
					events.push("timezone");
				});
		if (winner === "issue") {
			const issueTask = issueOperation().then(() => {
				events.push("issue");
			});
			await waitForBlockedLocks();
			const timezoneTask = timezoneOperation();
			return [issueTask, timezoneTask] as const;
		}

		const timezoneTask = timezoneOperation();
		await waitForBlockedLocks();
		const issueTask = issueOperation().then(() => {
			events.push("issue");
		});
		return [timezoneTask, issueTask] as const;
	});
	await Promise.all(tasks);
	expect(events).toEqual(
		winner === "issue" ? ["issue", "timezone"] : ["timezone", "issue"],
	);
}

async function insertScheduledCycle({
	teamId = ids.team,
	state = "planned",
	occurrence,
	sequence = 1,
	name = "Scheduled",
}: {
	teamId?: string;
	state?: "planned" | "active";
	occurrence: { boundary: Date; endDate: Date };
	sequence?: number;
	name?: string;
}) {
	const cycleId = createId();
	await db.insert(cycle).values({
		id: cycleId,
		workspaceId: ids.workspace,
		teamId,
		name,
		sequence,
		state,
		origin: "scheduled",
		scheduledBoundary: occurrence.boundary,
		startDate: occurrence.boundary,
		endDate: occurrence.endDate,
	});
	return cycleId;
}

async function waitForBlockedLocks(expected = 1) {
	for (let attempt = 0; attempt < 200; attempt++) {
		const result = await db.execute<{ waiting: number }>(
			sql`select count(*)::int as waiting from pg_locks where not granted`,
		);
		if ((result.rows[0]?.waiting ?? 0) >= expected) return;
		await Bun.sleep(10);
	}
	throw new Error(`work never waited for ${expected} lock(s)`);
}

async function waitForBlockedLock() {
	await waitForBlockedLocks();
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
	({ issuePublisher } = await import("../issues/publisher"));
	issuePublisher.publish = async () => {};
}, 300_000);

afterAll(async () => {
	if (teardown) await teardown();
}, 60_000);

beforeEach(async () => {
	await db.execute(sql`truncate table team, workspace, "user" cascade`);
	await db.insert(user).values([
		{ id: ids.admin, name: "Admin", email: "tz-admin@example.test" },
		{ id: ids.updater, name: "Updater", email: "tz-updater@example.test" },
		{ id: ids.reader, name: "Reader", email: "tz-reader@example.test" },
		{
			id: ids.noAccess,
			name: "No Access",
			email: "tz-no-access@example.test",
		},
	]);
	await db.insert(workspace).values([
		{
			id: ids.workspace,
			name: "Timezone Workspace",
			slug: "timezone-workspace",
			timezone: "America/New_York",
		},
		{
			id: ids.wrongWorkspace,
			name: "Other Workspace",
			slug: "timezone-other",
			timezone: "UTC",
		},
	]);
	await db.insert(team).values([
		{
			id: ids.team,
			workspaceId: ids.workspace,
			name: "Public Team",
			key: "PUB",
			privacy: "public",
			cycleDuration: 14,
		},
		{
			id: ids.privateTeam,
			workspaceId: ids.workspace,
			name: "Private Team",
			key: "PRV",
			privacy: "private",
			cycleDuration: 14,
		},
	]);
	await db.insert(teamCycleSettings).values([
		{ teamId: ids.team, cadenceDays: 14, updatedBy: null },
		{ teamId: ids.privateTeam, cadenceDays: 14, updatedBy: null },
	]);
	const { ensurePermissionCatalog } = await import("../workspaces/defaults");
	await ensurePermissionCatalog(db);
	await grant(ids.admin, ["*"], null);
	await grant(ids.updater, ["workspace:update", "workspace:read"], null);
	await grant(ids.updater, ["team:create", "team:update"], null);
	await grant(ids.updater, ["cycle:read", "cycle:manage_settings"]);
	await grant(ids.updater, ["issue:create", "issue:update"]);
	await grant(ids.reader, ["workspace:read"], null);
	await grant(ids.reader, ["cycle:read"]);
	for (const userId of [ids.admin, ids.updater, ids.reader]) {
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
		if (userId === ids.admin) continue;
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

describe("workspace timezone updates", () => {
	test("rejects unauthorized mutation without disclosing the workspace", async () => {
		const before = await snapshotState();
		for (const userId of [ids.noAccess, ids.reader]) {
			const error = await expectCode(
				client(userId).workspace.update(
					{ id: ids.workspace, timezone: "UTC" },
					options(userId),
				),
				"UNAUTHORIZED",
			);
			expect(JSON.stringify(error)).not.toContain(ids.privateTeam);
			expect(error.message).not.toContain(ids.workspace);
		}
		expect(await snapshotState()).toEqual(before);
	});

	test("rejects invalid timezones before writing", async () => {
		const before = await snapshotState();
		try {
			await client(ids.updater).workspace.update(
				{ id: ids.workspace, timezone: "Invalid/Timezone" },
				options(ids.updater),
			);
			expect.unreachable("expected invalid timezone rejection");
		} catch (error) {
			expect(error).toBeInstanceOf(Error);
			if (error instanceof ORPCError) {
				expect(error.code).not.toBe("SCHEDULE_RECONCILIATION_REQUIRED");
			}
		}
		expect(await snapshotState()).toEqual(before);
	});

	test("omitted and identical timezones update metadata without schedule rejection", async () => {
		await enableCadence();
		const occurrence = await occurrenceAt({ timezone: "America/New_York" });
		await insertScheduledCycle({ occurrence });
		const before = await snapshotState();
		await client(ids.updater).workspace.update(
			{ id: ids.workspace, name: "Renamed" },
			options(ids.updater),
		);
		const renamed = await snapshotState();
		expect(renamed.workspaceRow?.name).toBe("Renamed");
		expect(renamed.workspaceRow?.timezone).toBe("America/New_York");
		expect(renamed.cycles).toEqual(before.cycles);
		await client(ids.updater).workspace.update(
			{ id: ids.workspace, timezone: "America/New_York" },
			options(ids.updater),
		);
		const identical = await snapshotState();
		expect(identical.workspaceRow?.timezone).toBe("America/New_York");
		expect(identical.cycles).toEqual(before.cycles);
		expect(identical.settingsRows).toEqual(renamed.settingsRows);
	});

	test("allows timezone changes when no enabled schedules exist", async () => {
		await client(ids.updater).workspace.update(
			{ id: ids.workspace, timezone: "UTC" },
			options(ids.updater),
		);
		const [row] = await db
			.select({ timezone: workspace.timezone })
			.from(workspace)
			.where(eq(workspace.id, ids.workspace));
		expect(row?.timezone).toBe("UTC");
	});

	test("allows compatible aliases and preserves artifacts", async () => {
		await enableCadence();
		const occurrence = await occurrenceAt({ timezone: "America/New_York" });
		const cycleId = await insertScheduledCycle({ occurrence });
		const claimToken = "lease-token";
		const jobId = createId();
		const [settings] = await db
			.select()
			.from(teamCycleSettings)
			.where(eq(teamCycleSettings.teamId, ids.team));
		if (!settings) throw new Error("settings missing");
		await db.insert(cycleScheduleJob).values({
			id: jobId,
			workspaceId: ids.workspace,
			teamId: ids.team,
			cycleId,
			jobType: "start_scheduled_cycle",
			scheduledBoundary: occurrence.boundary,
			eventRevisionAt: settings.updatedAt,
			status: "started",
			claimToken,
			workerId: "worker-1",
			leaseExpiresAt: new Date("2030-01-01T00:00:00.000Z"),
			startedAt: now,
			attempts: 1,
		});
		const before = await snapshotState();
		await client(ids.updater).workspace.update(
			{ id: ids.workspace, timezone: "US/Eastern" },
			options(ids.updater),
		);
		const after = await snapshotState();
		expect(after.workspaceRow?.timezone).toBe("US/Eastern");
		expect(after.cycles).toEqual(before.cycles);
		expect(after.jobs).toEqual(before.jobs);
		const [started] = await db
			.select()
			.from(cycleScheduleJob)
			.where(eq(cycleScheduleJob.id, jobId));
		expect(started?.claimToken).toBe(claimToken);
		expect(started?.workerId).toBe("worker-1");
		expect(started?.status).toBe("started");
		expect(after.settingsRows).toEqual(before.settingsRows);
	});

	test("rejects incompatible planned cycles and rolls back accompanying metadata", async () => {
		const dstAnchor = new Date("2026-03-05T05:00:00.000Z");
		await db
			.update(teamCycleSettings)
			.set({
				cadenceEnabled: true,
				cadenceDays: 7,
				anchorDate: dstAnchor,
				planningHorizon: 2,
			})
			.where(eq(teamCycleSettings.teamId, ids.team));
		const occurrence = await deriveDivergentOccurrence({
			sourceTimezone: "America/New_York",
			targetTimezone: "UTC",
			settings: { ...scheduleSettings, cadenceDays: 7, anchorDate: dstAnchor },
			now: dstAnchor,
		});
		const cycleId = await insertScheduledCycle({ occurrence });
		const before = await snapshotState();
		const error = await expectCode(
			client(ids.updater).workspace.update(
				{
					id: ids.workspace,
					name: "Should not stick",
					slug: "should-not-stick",
					timezone: "UTC",
				},
				options(ids.updater),
			),
			"SCHEDULE_RECONCILIATION_REQUIRED",
		);
		expect(error.data).toEqual({
			reason: "scheduled_cycles_require_resolution",
		});
		expect(JSON.stringify(error)).not.toContain(cycleId);
		expect(JSON.stringify(error)).not.toContain(ids.privateTeam);
		expect(await snapshotState()).toEqual(before);
	});

	test("rejects off-horizon active identity loss without mutating history", async () => {
		const phoenixAnchor = new Date("2026-01-01T17:00:00.000Z");
		await db
			.update(workspace)
			.set({ timezone: "America/Phoenix" })
			.where(eq(workspace.id, ids.workspace));
		await db
			.update(teamCycleSettings)
			.set({
				cadenceEnabled: true,
				cadenceDays: 7,
				anchorDate: phoenixAnchor,
				planningHorizon: 2,
			})
			.where(eq(teamCycleSettings.teamId, ids.team));
		const occurrence = await deriveDivergentOccurrence({
			sourceTimezone: "America/Phoenix",
			targetTimezone: "America/Denver",
			settings: {
				...scheduleSettings,
				anchorDate: phoenixAnchor,
			},
			now: new Date("2026-07-15T17:00:00.000Z"),
		});
		const cycleId = await insertScheduledCycle({
			occurrence,
			state: "active",
			name: "Off-horizon active",
		});
		const statusGroupId = createId();
		const statusId = createId();
		const typeId = createId();
		const issueId = createId();
		const activityId = createId();
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
			cycleId,
			creatorId: ids.updater,
			sortOrder: "a00",
		});
		await db.insert(issueActivity).values({
			id: activityId,
			workspaceId: ids.workspace,
			teamId: ids.team,
			issueId,
			cycleId,
			actionType: "issue.cycle_assigned",
		});
		const before = await snapshotState();
		const error = await expectCode(
			client(ids.updater).workspace.update(
				{ id: ids.workspace, timezone: "America/Denver" },
				options(ids.updater),
			),
			"SCHEDULE_RECONCILIATION_REQUIRED",
		);
		expect(error.data).toEqual({ reason: "active_cycle_conflict" });
		expect(JSON.stringify(error.data)).not.toContain(cycleId);
		expect(await snapshotState()).toEqual(before);
	});

	test("allows a disabled timezone change then enforces re-enable compatibility", async () => {
		const phoenixAnchor = new Date("2026-01-01T17:00:00.000Z");
		const phoenixSettingsInput = {
			...enabledSettingsInput,
			anchorDate: phoenixAnchor.toISOString(),
		};
		await db
			.update(workspace)
			.set({ timezone: "America/Phoenix" })
			.where(eq(workspace.id, ids.workspace));
		await db
			.update(teamCycleSettings)
			.set({
				cadenceEnabled: true,
				cadenceDays: 7,
				anchorDate: phoenixAnchor,
				planningHorizon: 2,
			})
			.where(eq(teamCycleSettings.teamId, ids.team));
		const occurrence = await deriveDivergentOccurrence({
			sourceTimezone: "America/Phoenix",
			targetTimezone: "America/Denver",
			settings: {
				...scheduleSettings,
				anchorDate: phoenixAnchor,
			},
			now: new Date("2026-07-15T17:00:00.000Z"),
		});
		await insertScheduledCycle({ occurrence });
		await db
			.update(teamCycleSettings)
			.set({ cadenceEnabled: false })
			.where(eq(teamCycleSettings.teamId, ids.team));
		const before = await snapshotState();
		await client(ids.updater).workspace.update(
			{ id: ids.workspace, timezone: "America/Denver" },
			options(ids.updater),
		);
		const afterDisableChange = await snapshotState();
		expect(afterDisableChange.workspaceRow?.timezone).toBe("America/Denver");
		expect(afterDisableChange.cycles).toEqual(before.cycles);
		await withAutomationEnabled(async () =>
			expectCode(
				client(ids.updater).cycle.updateSettings(
					{
						workspaceId: ids.workspace,
						teamId: ids.team,
						expectedUpdatedAt: await currentRevision(),
						...phoenixSettingsInput,
					},
					options(ids.updater),
				),
				"SCHEDULE_RECONCILIATION_REQUIRED",
			),
		);
		expect((await snapshotState()).cycles).toEqual(before.cycles);
		await client(ids.updater).workspace.update(
			{ id: ids.workspace, timezone: "America/Phoenix" },
			options(ids.updater),
		);
		const reenabled = await withAutomationEnabled(async () =>
			client(ids.updater).cycle.updateSettings(
				{
					workspaceId: ids.workspace,
					teamId: ids.team,
					expectedUpdatedAt: await currentRevision(),
					...phoenixSettingsInput,
				},
				options(ids.updater),
			),
		);
		expect(reenabled.settings.cadenceEnabled).toBeTrue();
		expect(reenabled.workspaceTimezone).toBe("America/Phoenix");
	});

	test("does not disclose a private-team conflict", async () => {
		const dstAnchor = new Date("2026-03-05T05:00:00.000Z");
		await db
			.update(teamCycleSettings)
			.set({
				cadenceEnabled: true,
				cadenceDays: 7,
				anchorDate: dstAnchor,
				planningHorizon: 2,
			})
			.where(eq(teamCycleSettings.teamId, ids.privateTeam));
		const occurrence = await deriveDivergentOccurrence({
			sourceTimezone: "America/New_York",
			targetTimezone: "UTC",
			settings: { ...scheduleSettings, cadenceDays: 7, anchorDate: dstAnchor },
			now: dstAnchor,
		});
		const privateCycleId = await insertScheduledCycle({
			teamId: ids.privateTeam,
			occurrence,
		});
		const before = await snapshotState();
		const error = await expectCode(
			client(ids.updater).workspace.update(
				{ id: ids.workspace, timezone: "UTC" },
				options(ids.updater),
			),
			"SCHEDULE_RECONCILIATION_REQUIRED",
		);
		const serialized = JSON.stringify(error);
		expect(serialized).not.toContain(privateCycleId);
		expect(serialized).not.toContain(ids.privateTeam);
		expect(await snapshotState()).toEqual(before);
	});

	test("rejects DST spring, fold, and non-hour identity changes", async () => {
		const cases = [
			{
				timezone: "America/New_York",
				anchor: new Date("2026-03-05T05:00:00.000Z"),
				now: new Date("2026-03-05T05:00:00.000Z"),
				target: "UTC",
			},
			{
				timezone: "America/New_York",
				anchor: new Date("2026-10-25T06:00:00.000Z"),
				now: new Date("2026-10-25T06:00:00.000Z"),
				target: "UTC",
			},
			{
				timezone: "Asia/Kolkata",
				anchor: new Date("2026-03-05T04:30:00.000Z"),
				now: new Date("2026-03-05T04:30:00.000Z"),
				target: "America/New_York",
			},
		] as const;
		for (const testCase of cases) {
			await db.execute(sql`truncate table cycle cascade`);
			await db
				.update(workspace)
				.set({ timezone: testCase.timezone })
				.where(eq(workspace.id, ids.workspace));
			await db
				.update(teamCycleSettings)
				.set({
					cadenceEnabled: true,
					cadenceDays: 7,
					anchorDate: testCase.anchor,
					planningHorizon: 2,
				})
				.where(eq(teamCycleSettings.teamId, ids.team));
			const occurrence = await deriveDivergentOccurrence({
				sourceTimezone: testCase.timezone,
				targetTimezone: testCase.target,
				settings: {
					...scheduleSettings,
					cadenceDays: 7,
					anchorDate: testCase.anchor,
				},
				now: testCase.now,
			});
			await insertScheduledCycle({ occurrence });
			const before = await snapshotState();
			await expectCode(
				client(ids.updater).workspace.update(
					{ id: ids.workspace, timezone: testCase.target },
					options(ids.updater),
				),
				"SCHEDULE_RECONCILIATION_REQUIRED",
			);
			expect(await snapshotState()).toEqual(before);
		}
	});

	test("rejects equal current offsets with divergent future rules", async () => {
		const phoenixSettings = {
			...scheduleSettings,
			anchorDate: new Date("2026-01-01T17:00:00.000Z"),
		};
		await db
			.update(workspace)
			.set({ timezone: "America/Phoenix" })
			.where(eq(workspace.id, ids.workspace));
		await db
			.update(teamCycleSettings)
			.set({
				cadenceEnabled: true,
				cadenceDays: 7,
				anchorDate: phoenixSettings.anchorDate,
				planningHorizon: 2,
			})
			.where(eq(teamCycleSettings.teamId, ids.team));
		const summer = await deriveDivergentOccurrence({
			sourceTimezone: "America/Phoenix",
			targetTimezone: "America/Denver",
			settings: phoenixSettings,
			now: new Date("2026-07-15T17:00:00.000Z"),
		});
		await insertScheduledCycle({
			occurrence: summer,
			state: "active",
			name: "Summer active",
		});
		const before = await snapshotState();
		await expectCode(
			client(ids.updater).workspace.update(
				{ id: ids.workspace, timezone: "America/Denver" },
				options(ids.updater),
			),
			"SCHEDULE_RECONCILIATION_REQUIRED",
		);
		expect(await snapshotState()).toEqual(before);
	});

	test("serializes issue creation before timezone updates (issue wins)", async () => {
		const cycleId = await insertScheduledCycle({
			occurrence: await occurrenceAt({ timezone: "America/New_York" }),
		});
		const { issueTypeId, statusId } = await insertIssueFixture({
			cycleId: null,
		});
		await runIssueTimezoneRace({
			winner: "issue",
			issueOperation: () =>
				client(ids.updater).issue.create(
					{
						workspaceId: ids.workspace,
						teamId: ids.team,
						title: "Created during timezone update",
						statusId,
						issueTypeId,
						cycleId,
						labelIds: [],
					},
					options(ids.updater),
				),
		});
		const created = await db
			.select({ cycleId: issue.cycleId })
			.from(issue)
			.where(eq(issue.cycleId, cycleId));
		expect(created).toHaveLength(1);
	});

	test("serializes issue creation before timezone updates (timezone wins)", async () => {
		const cycleId = await insertScheduledCycle({
			occurrence: await occurrenceAt({ timezone: "America/New_York" }),
		});
		const { issueTypeId, statusId } = await insertIssueFixture({
			cycleId: null,
		});
		await runIssueTimezoneRace({
			winner: "timezone",
			issueOperation: () =>
				client(ids.updater).issue.create(
					{
						workspaceId: ids.workspace,
						teamId: ids.team,
						title: "Created during timezone update",
						statusId,
						issueTypeId,
						cycleId,
						labelIds: [],
					},
					options(ids.updater),
				),
		});
		const created = await db
			.select({ cycleId: issue.cycleId })
			.from(issue)
			.where(eq(issue.cycleId, cycleId));
		expect(created).toHaveLength(1);
	});

	test("serializes issue assignment before timezone updates (issue wins)", async () => {
		const cycleId = await insertScheduledCycle({
			occurrence: await occurrenceAt({ timezone: "America/New_York" }),
		});
		const { issueId } = await insertIssueFixture({ cycleId: null });
		await runIssueTimezoneRace({
			winner: "issue",
			issueOperation: () =>
				client(ids.updater).issue.update(
					{ id: issueId, workspaceId: ids.workspace, cycleId },
					options(ids.updater),
				),
		});
		const [assigned] = await db
			.select({ cycleId: issue.cycleId })
			.from(issue)
			.where(eq(issue.id, issueId));
		expect(assigned?.cycleId).toBe(cycleId);
	});

	test("serializes issue assignment before timezone updates (timezone wins)", async () => {
		const cycleId = await insertScheduledCycle({
			occurrence: await occurrenceAt({ timezone: "America/New_York" }),
		});
		const { issueId } = await insertIssueFixture({ cycleId: null });
		await runIssueTimezoneRace({
			winner: "timezone",
			issueOperation: () =>
				client(ids.updater).issue.update(
					{ id: issueId, workspaceId: ids.workspace, cycleId },
					options(ids.updater),
				),
		});
		const [assigned] = await db
			.select({ cycleId: issue.cycleId })
			.from(issue)
			.where(eq(issue.id, issueId));
		expect(assigned?.cycleId).toBe(cycleId);
	});

	test("serializes issue unassignment before timezone updates (issue wins)", async () => {
		const cycleId = await insertScheduledCycle({
			occurrence: await occurrenceAt({ timezone: "America/New_York" }),
		});
		const { issueId } = await insertIssueFixture({ cycleId });
		await runIssueTimezoneRace({
			winner: "issue",
			issueOperation: () =>
				client(ids.updater).issue.update(
					{ id: issueId, workspaceId: ids.workspace, cycleId: null },
					options(ids.updater),
				),
		});
		const [unassigned] = await db
			.select({ cycleId: issue.cycleId })
			.from(issue)
			.where(eq(issue.id, issueId));
		expect(unassigned?.cycleId).toBeNull();
	});

	test("serializes issue unassignment before timezone updates (timezone wins)", async () => {
		const cycleId = await insertScheduledCycle({
			occurrence: await occurrenceAt({ timezone: "America/New_York" }),
		});
		const { issueId } = await insertIssueFixture({ cycleId });
		await runIssueTimezoneRace({
			winner: "timezone",
			issueOperation: () =>
				client(ids.updater).issue.update(
					{ id: issueId, workspaceId: ids.workspace, cycleId: null },
					options(ids.updater),
				),
		});
		const [unassigned] = await db
			.select({ cycleId: issue.cycleId })
			.from(issue)
			.where(eq(issue.id, issueId));
		expect(unassigned?.cycleId).toBeNull();
	});

	test("rolls back rejected legacy cycle duration changes", async () => {
		await enableCadence();
		const occurrence = await occurrenceAt({ timezone: "America/New_York" });
		await insertScheduledCycle({ occurrence });
		const before = await snapshotState();
		await expectCode(
			client(ids.updater).team.update(
				{
					id: ids.team,
					workspaceId: ids.workspace,
					cycleDuration: 21,
				},
				options(ids.updater),
			),
			"SCHEDULE_RECONCILIATION_REQUIRED",
		);
		expect(await snapshotState()).toEqual(before);
	});

	test("serializes timezone changes with generation, settings, and legacy cadence", async () => {
		await enableCadence();
		const occurrence = await occurrenceAt({ timezone: "America/New_York" });
		await insertScheduledCycle({ occurrence });
		const { lockCycleTeam } = await import("../cycles/mutation");
		const { maintainPlannedCycleHorizonInTransaction } = await import(
			"../cycles/generation"
		);
		const generationFirst = await db.transaction(async (tx) => {
			await lockCycleTeam({
				tx,
				workspaceId: ids.workspace,
				teamId: ids.team,
			});
			const pendingTimezone = client(ids.updater).workspace.update(
				{ id: ids.workspace, timezone: "US/Eastern" },
				options(ids.updater),
			);
			await waitForBlockedLock();
			const generated = await maintainPlannedCycleHorizonInTransaction({
				tx,
				workspaceId: ids.workspace,
				teamId: ids.team,
				now,
			});
			return { generated, pendingTimezone };
		});
		expect(["created", "already_satisfied"]).toContain(
			generationFirst.generated.status,
		);
		await generationFirst.pendingTimezone;
		expect(
			(
				await db
					.select({ timezone: workspace.timezone })
					.from(workspace)
					.where(eq(workspace.id, ids.workspace))
			)[0]?.timezone,
		).toBe("US/Eastern");

		const timezoneFirst = await db.transaction(async (tx) => {
			await lockCycleTeam({
				tx,
				workspaceId: ids.workspace,
				teamId: ids.team,
			});
			const pendingGeneration = (async () => {
				const { maintainPlannedCycleHorizon } = await import(
					"../cycles/generation"
				);
				return maintainPlannedCycleHorizon({
					workspaceId: ids.workspace,
					teamId: ids.team,
					now,
				});
			})();
			await waitForBlockedLock();
			await tx
				.update(workspace)
				.set({ timezone: "America/New_York" })
				.where(eq(workspace.id, ids.workspace));
			return { pendingGeneration };
		});
		await timezoneFirst.pendingGeneration;

		await withAutomationEnabled(async () => {
			const held = await db.transaction(async (tx) => {
				await lockCycleTeam({
					tx,
					workspaceId: ids.workspace,
					teamId: ids.team,
				});
				const pendingSettings = client(ids.updater).cycle.updateSettings(
					{
						workspaceId: ids.workspace,
						teamId: ids.team,
						expectedUpdatedAt: await currentRevision(),
						...enabledSettingsInput,
						endBehavior: "reminder_only",
					},
					options(ids.updater),
				);
				await waitForBlockedLock();
				const pendingTimezone = client(ids.updater).workspace.update(
					{ id: ids.workspace, timezone: "US/Eastern" },
					options(ids.updater),
				);
				return { pendingSettings, pendingTimezone };
			});
			const settingsResult = await held.pendingSettings;
			expect(settingsResult.workspaceTimezone).toBeDefined();
			await held.pendingTimezone;
		});

		await enableCadence();
		const legacyHeld = await db.transaction(async (tx) => {
			await lockCycleTeam({
				tx,
				workspaceId: ids.workspace,
				teamId: ids.team,
			});
			const pendingLegacy = client(ids.updater).team.update(
				{
					id: ids.team,
					workspaceId: ids.workspace,
					cycleDuration: 21,
				},
				options(ids.updater),
			);
			await waitForBlockedLock();
			return { pendingLegacy };
		});
		await expectCode(
			legacyHeld.pendingLegacy,
			"SCHEDULE_RECONCILIATION_REQUIRED",
		);
	});

	test("serializes timezone changes across multiple teams and team creation", async () => {
		await enableCadence();
		await enableCadence(ids.privateTeam);
		const occurrence = await occurrenceAt({ timezone: "America/New_York" });
		await insertScheduledCycle({ occurrence });
		await insertScheduledCycle({
			teamId: ids.privateTeam,
			occurrence,
			sequence: 1,
			name: "Private scheduled",
		});
		const { lockCycleTeam } = await import("../cycles/mutation");
		const { maintainPlannedCycleHorizon } = await import(
			"../cycles/generation"
		);
		const results = await Promise.allSettled([
			maintainPlannedCycleHorizon({
				workspaceId: ids.workspace,
				teamId: ids.team,
				now,
			}),
			maintainPlannedCycleHorizon({
				workspaceId: ids.workspace,
				teamId: ids.privateTeam,
				now,
			}),
			client(ids.updater).workspace.update(
				{ id: ids.workspace, timezone: "US/Eastern" },
				options(ids.updater),
			),
		]);
		expect(results.every((result) => result.status === "fulfilled")).toBeTrue();

		const createHeld = await db.transaction(async (tx) => {
			await lockCycleTeam({
				tx,
				workspaceId: ids.workspace,
				teamId: ids.team,
			});
			const pendingCreate = client(ids.updater).team.create(
				{
					workspaceId: ids.workspace,
					name: "Later Team",
					key: "LTR",
					privacy: "public",
				},
				options(ids.updater),
			);
			await waitForBlockedLock();
			return { pendingCreate };
		});
		const created = await createHeld.pendingCreate;
		expect(created.id).toBeString();
	});

	test("serializes concurrent timezone writers", async () => {
		const results = await Promise.allSettled([
			client(ids.updater).workspace.update(
				{ id: ids.workspace, timezone: "UTC" },
				options(ids.updater),
			),
			client(ids.admin).workspace.update(
				{ id: ids.workspace, timezone: "Europe/Berlin" },
				options(ids.admin),
			),
		]);
		expect(
			results.filter((result) => result.status === "fulfilled"),
		).toHaveLength(2);
		const [row] = await db
			.select({ timezone: workspace.timezone })
			.from(workspace)
			.where(eq(workspace.id, ids.workspace));
		if (!row) throw new Error("workspace missing");
		expect(["UTC", "Europe/Berlin"]).toContain(row.timezone);
	});

	test("claimed lifecycle and notification jobs revalidate after a timezone change", async () => {
		await enableCadence();
		const occurrence = await occurrenceAt({ timezone: "America/New_York" });
		const cycleId = await insertScheduledCycle({
			occurrence,
			state: "planned",
		});
		await client(ids.updater).workspace.update(
			{ id: ids.workspace, timezone: "US/Eastern" },
			options(ids.updater),
		);
		const { startScheduledCycle } = await import("../cycles/lifecycle");
		const [settings] = await db
			.select()
			.from(teamCycleSettings)
			.where(eq(teamCycleSettings.teamId, ids.team));
		if (!settings) throw new Error("settings missing");
		const started = await startScheduledCycle({
			workspaceId: ids.workspace,
			teamId: ids.team,
			cycleId,
			scheduledBoundary: occurrence.boundary,
			eventRevisionAt: settings.updatedAt,
			now: occurrence.boundary,
		});
		expect(["started", "not_due", "obsolete_settings"]).toContain(
			started.status,
		);
		const { enqueueNotificationJobs, processNotificationJob } = await import(
			"../cycles/notifications"
		);
		await enqueueNotificationJobs({ clock: { now: () => now } });
		const [job] = await db
			.select()
			.from(cycleScheduleJob)
			.where(
				and(
					eq(cycleScheduleJob.cycleId, cycleId),
					eq(cycleScheduleJob.jobType, "send_cycle_reminder"),
				),
			);
		if (!job?.cycleId || !job.eventRevisionAt) return;
		const outcome = await processNotificationJob({
			job: {
				...job,
				jobType: "send_cycle_reminder",
				cycleId: job.cycleId,
			},
		});
		expect([
			"created",
			"already_satisfied",
			"no_recipients",
			"obsolete_settings",
			"obsolete_cycle_state",
		]).toContain(outcome);
	});
});
