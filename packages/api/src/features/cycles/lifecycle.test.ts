import {
	afterAll,
	beforeAll,
	beforeEach,
	describe,
	expect,
	test,
} from "bun:test";
import { and, eq, sql } from "drizzle-orm";
import setupDb from "../../utils/prepare-tests";

let db: typeof import("db").db;
let cycleScheduleJob: typeof import("db/features/tracker/cycle-schedule-jobs.schema").cycleScheduleJob;
let cycle: typeof import("db/features/tracker/cycles.schema").cycle;
let issueActivity: typeof import("db/features/tracker/issue-activities.schema").issueActivity;
let issueStatus: typeof import("db/features/tracker/issue-statuses.schema").issueStatus;
let issueStatusGroup: typeof import("db/features/tracker/issue-statuses.schema").issueStatusGroup;
let issueType: typeof import("db/features/tracker/issue-types.schema").issueType;
let issue: typeof import("db/features/tracker/issues.schema").issue;
let teamCycleSettings: typeof import("db/features/tracker/team-cycle-settings.schema").teamCycleSettings;
let team: typeof import("db/features/tracker/tracker.schema").team;
let workspace: typeof import("db/features/tracker/tracker.schema").workspace;
let user: typeof import("db/features/auth/auth.schema").user;
let startScheduledCycle: typeof import("./lifecycle").startScheduledCycle;
let completeScheduledCycle: typeof import("./lifecycle").completeScheduledCycle;
let teardown: Awaited<ReturnType<typeof setupDb>>;

const ids = {
	workspace: "lifecycle-workspace",
	team: "lifecycle-team",
	source: "lifecycle-source",
	issue: "lifecycle-issue",
	statusGroup: "lifecycle-status-group",
	status: "lifecycle-status",
	type: "lifecycle-type",
	user: "lifecycle-user",
};
const sourceStart = new Date("2026-07-08T10:00:00.000Z");
const sourceEnd = new Date("2026-07-15T10:00:00.000Z");

beforeAll(async () => {
	teardown = await setupDb();
	({ db } = await import("db"));
	({ cycleScheduleJob } = await import(
		"db/features/tracker/cycle-schedule-jobs.schema"
	));
	({ cycle } = await import("db/features/tracker/cycles.schema"));
	({ issueActivity } = await import(
		"db/features/tracker/issue-activities.schema"
	));
	({ issueStatus, issueStatusGroup } = await import(
		"db/features/tracker/issue-statuses.schema"
	));
	({ issueType } = await import("db/features/tracker/issue-types.schema"));
	({ issue } = await import("db/features/tracker/issues.schema"));
	({ teamCycleSettings } = await import(
		"db/features/tracker/team-cycle-settings.schema"
	));
	({ team, workspace } = await import("db/features/tracker/tracker.schema"));
	({ user } = await import("db/features/auth/auth.schema"));
	({ startScheduledCycle, completeScheduledCycle } = await import(
		"./lifecycle"
	));
}, 300_000);

afterAll(async () => {
	if (teardown) await teardown();
}, 60_000);

beforeEach(async () => {
	await db.execute(sql`truncate table workspace, "user" cascade`);
	await db.insert(user).values({
		id: ids.user,
		name: "Lifecycle User",
		email: "lifecycle@example.test",
	});
	await db.insert(workspace).values({
		id: ids.workspace,
		name: "Lifecycle Workspace",
		slug: "lifecycle-workspace",
		timezone: "UTC",
	});
	await db.insert(team).values({
		id: ids.team,
		workspaceId: ids.workspace,
		name: "Lifecycle Team",
		key: "LIF",
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
		id: ids.statusGroup,
		workspaceId: ids.workspace,
		key: "planned",
		name: "Planned",
		canonicalCategory: "planned",
		orderIndex: 0,
	});
	await db.insert(issueStatus).values({
		id: ids.status,
		workspaceId: ids.workspace,
		statusGroupId: ids.statusGroup,
		name: "Planned",
		orderIndex: 0,
	});
});

async function seedSettings(
	overrides: Partial<typeof teamCycleSettings.$inferInsert> = {},
) {
	const [settings] = await db
		.insert(teamCycleSettings)
		.values({
			teamId: ids.team,
			cadenceEnabled: true,
			cadenceDays: 7,
			anchorDate: new Date("2026-07-01T10:00:00.000Z"),
			planningHorizon: 2,
			endBehavior: "automatic",
			gracePeriodMinutes: 0,
			defaultRolloverPolicy: "carry_over",
			reminderLeadMinutes: 60,
			updatedBy: null,
			...overrides,
		})
		.returning();
	if (!settings) throw new Error("settings missing");
	return settings;
}

async function seedSource(state: "planned" | "active" = "active") {
	await db.insert(cycle).values({
		id: ids.source,
		workspaceId: ids.workspace,
		teamId: ids.team,
		name: "Source Cycle",
		sequence: 1,
		state,
		origin: "scheduled",
		scheduledBoundary: sourceStart,
		startDate: sourceStart,
		endDate: sourceEnd,
	});
}

async function seedPlannedIssue() {
	await db.insert(issue).values({
		id: ids.issue,
		workspaceId: ids.workspace,
		teamId: ids.team,
		number: 1,
		title: "Planned work",
		statusId: ids.status,
		issueTypeId: ids.type,
		cycleId: ids.source,
		estimate: 3,
		creatorId: ids.user,
		sortOrder: "a0",
	});
}

function startInput(
	settings: typeof teamCycleSettings.$inferSelect,
	now = sourceStart,
) {
	return {
		workspaceId: ids.workspace,
		teamId: ids.team,
		cycleId: ids.source,
		scheduledBoundary: sourceStart,
		eventRevisionAt: settings.updatedAt,
		now,
	};
}

function completionInput(
	settings: typeof teamCycleSettings.$inferSelect,
	now = sourceEnd,
) {
	return {
		...startInput(settings, now),
		jobId: "lifecycle-completion-job",
		scheduledBoundary: sourceEnd,
	};
}

async function seedCompletionJob(
	settings: typeof teamCycleSettings.$inferSelect,
	input = completionInput(settings),
) {
	await db.insert(cycleScheduleJob).values({
		id: input.jobId,
		workspaceId: input.workspaceId,
		teamId: input.teamId,
		cycleId: input.cycleId,
		jobType: "complete_scheduled_cycle",
		scheduledBoundary: input.scheduledBoundary,
		eventRevisionAt: input.eventRevisionAt,
		availableAt: input.now,
	});
}

describe("scheduled cycle lifecycle", () => {
	test("starts a due scheduled cycle once and converges on retry", async () => {
		const settings = await seedSettings();
		await seedSource("planned");
		expect(await startScheduledCycle(startInput(settings))).toEqual({
			status: "started",
		});
		expect(await startScheduledCycle(startInput(settings))).toEqual({
			status: "already_started",
		});
		const [source] = await db
			.select()
			.from(cycle)
			.where(eq(cycle.id, ids.source));
		expect(source?.state).toBe("active");
	});

	test("keeps not-due, stale, and invalid-provenance starts inert", async () => {
		const settings = await seedSettings();
		await seedSource("planned");
		expect(
			await startScheduledCycle(
				startInput(settings, new Date(sourceStart.getTime() - 1)),
			),
		).toEqual({ status: "not_due" });
		expect(
			await startScheduledCycle({
				...startInput(settings),
				eventRevisionAt: new Date(settings.updatedAt.getTime() - 1),
			}),
		).toEqual({ status: "obsolete_settings" });
		expect(
			await startScheduledCycle({
				...startInput(settings),
				scheduledBoundary: new Date(sourceStart.getTime() + 1),
			}),
		).toEqual({ status: "invalid_provenance" });
		await db
			.update(cycle)
			.set({ state: "canceled" })
			.where(eq(cycle.id, ids.source));
		expect(await startScheduledCycle(startInput(settings))).toEqual({
			status: "obsolete_cycle_state",
		});
		const [source] = await db
			.select()
			.from(cycle)
			.where(eq(cycle.id, ids.source));
		expect(source?.state).toBe("canceled");
	});

	test("blocks without consuming the planned cycle while another cycle is active", async () => {
		const settings = await seedSettings();
		await seedSource("planned");
		await db.insert(cycle).values({
			id: "lifecycle-active-blocker",
			workspaceId: ids.workspace,
			teamId: ids.team,
			name: "Active blocker",
			sequence: 2,
			state: "active",
			startDate: new Date("2026-07-01T10:00:00.000Z"),
			endDate: sourceStart,
		});
		expect(await startScheduledCycle(startInput(settings))).toEqual({
			status: "blocked",
			activeCycleId: "lifecycle-active-blocker",
		});
	});

	test("serializes concurrent starts into one transition", async () => {
		const settings = await seedSettings();
		await seedSource("planned");
		const results = await Promise.all([
			startScheduledCycle(startInput(settings)),
			startScheduledCycle(startInput(settings)),
		]);
		expect(results.map((result) => result.status).sort()).toEqual([
			"already_started",
			"started",
		]);
	});

	test("generates a carry-over target and records scheduled job correlation", async () => {
		const settings = await seedSettings();
		await seedSource();
		await seedPlannedIssue();
		await seedCompletionJob(settings);
		const result = await completeScheduledCycle(completionInput(settings));
		expect(result.status).toBe("completed");
		if (result.status !== "completed") return;
		expect(result.completion.counts.carriedOver).toBe(1);
		const [movedIssue] = await db
			.select({ cycleId: issue.cycleId })
			.from(issue)
			.where(eq(issue.id, ids.issue));
		expect(movedIssue?.cycleId).toBe(result.completion.destinationCycleId);
		const [activity] = await db
			.select({ metadata: issueActivity.metadata })
			.from(issueActivity)
			.where(eq(issueActivity.issueId, ids.issue));
		expect(activity?.metadata).toMatchObject({
			reason: "scheduled",
			scheduleJobId: "lifecycle-completion-job",
		});
		expect(await completeScheduledCycle(completionInput(settings))).toEqual({
			status: "already_completed",
		});
	});

	test("honors grace and records move-to-backlog job correlation", async () => {
		const settings = await seedSettings({
			gracePeriodMinutes: 60,
			defaultRolloverPolicy: "move_to_backlog",
		});
		await seedSource();
		await seedPlannedIssue();
		await seedCompletionJob(settings);
		expect(await completeScheduledCycle(completionInput(settings))).toEqual({
			status: "not_due",
		});
		const due = new Date(sourceEnd.getTime() + 60 * 60 * 1000);
		const result = await completeScheduledCycle(completionInput(settings, due));
		expect(result.status).toBe("completed");
		const [movedIssue] = await db
			.select({ cycleId: issue.cycleId })
			.from(issue)
			.where(eq(issue.id, ids.issue));
		expect(movedIssue?.cycleId).toBeNull();
		const [activity] = await db
			.select({ metadata: issueActivity.metadata })
			.from(issueActivity)
			.where(eq(issueActivity.issueId, ids.issue));
		expect(activity?.metadata).toMatchObject({
			reason: "scheduled",
			scheduleJobId: "lifecycle-completion-job",
		});
	});

	test("keeps confirmation and reminder-only cycles and membership unchanged", async () => {
		for (const endBehavior of [
			"confirmation_required",
			"reminder_only",
		] as const) {
			await db.execute(
				sql`truncate table issue_activity, issue, cycle, team_cycle_settings cascade`,
			);
			const settings = await seedSettings({ endBehavior });
			await seedSource();
			await seedPlannedIssue();
			await seedCompletionJob(settings);
			expect(await completeScheduledCycle(completionInput(settings))).toEqual({
				status: "obsolete_settings",
			});
			const [source] = await db
				.select({ state: cycle.state })
				.from(cycle)
				.where(eq(cycle.id, ids.source));
			const [persistedIssue] = await db
				.select({ cycleId: issue.cycleId })
				.from(issue)
				.where(eq(issue.id, ids.issue));
			expect(source?.state).toBe("active");
			expect(persistedIssue?.cycleId).toBe(ids.source);
			expect(await db.select().from(issueActivity)).toHaveLength(0);
		}
	});

	test("rejects completion without a matching durable completion job", async () => {
		const settings = await seedSettings();
		await seedSource();
		await seedPlannedIssue();
		const input = completionInput(settings);
		await db.insert(cycleScheduleJob).values({
			id: input.jobId,
			workspaceId: input.workspaceId,
			teamId: input.teamId,
			cycleId: input.cycleId,
			jobType: "send_cycle_reminder",
			scheduledBoundary: input.scheduledBoundary,
			eventRevisionAt: input.eventRevisionAt,
			availableAt: input.now,
		});
		expect(await completeScheduledCycle(input)).toEqual({
			status: "invalid_job_identity",
		});
		const [source] = await db
			.select({ state: cycle.state })
			.from(cycle)
			.where(eq(cycle.id, ids.source));
		expect(source?.state).toBe("active");
		expect(await db.select().from(issueActivity)).toHaveLength(0);
	});

	test("honors grace across a non-UTC daylight-saving fallback", async () => {
		const dstStart = new Date("2026-10-25T05:30:00.000Z");
		const dstEnd = new Date("2026-11-01T05:30:00.000Z");
		await db
			.update(workspace)
			.set({ timezone: "America/New_York" })
			.where(eq(workspace.id, ids.workspace));
		const settings = await seedSettings({
			anchorDate: dstStart,
			gracePeriodMinutes: 60,
			defaultRolloverPolicy: "move_to_backlog",
		});
		await db.insert(cycle).values({
			id: ids.source,
			workspaceId: ids.workspace,
			teamId: ids.team,
			name: "DST source",
			sequence: 1,
			state: "active",
			origin: "scheduled",
			scheduledBoundary: dstStart,
			startDate: dstStart,
			endDate: dstEnd,
		});
		const input = {
			workspaceId: ids.workspace,
			teamId: ids.team,
			cycleId: ids.source,
			jobId: "lifecycle-completion-job",
			scheduledBoundary: dstEnd,
			eventRevisionAt: settings.updatedAt,
			now: new Date("2026-11-01T06:29:59.999Z"),
		};
		await seedCompletionJob(settings, input);
		expect(await completeScheduledCycle(input)).toEqual({ status: "not_due" });
		const result = await completeScheduledCycle({
			...input,
			now: new Date("2026-11-01T06:30:00.000Z"),
		});
		expect(result.status).toBe("completed");
	});

	test("leaves source, issues, and activity unchanged when horizon generation conflicts", async () => {
		const settings = await seedSettings();
		await seedSource();
		await seedPlannedIssue();
		await seedCompletionJob(settings);
		await db.insert(cycle).values({
			id: "lifecycle-manual-conflict",
			workspaceId: ids.workspace,
			teamId: ids.team,
			name: "Manual conflict",
			sequence: 2,
			startDate: sourceEnd,
			endDate: new Date("2026-07-22T10:00:00.000Z"),
		});
		const result = await completeScheduledCycle(completionInput(settings));
		expect(result.status).toBe("generation_failed");
		const [source] = await db
			.select()
			.from(cycle)
			.where(eq(cycle.id, ids.source));
		const [persistedIssue] = await db
			.select({ cycleId: issue.cycleId })
			.from(issue)
			.where(eq(issue.id, ids.issue));
		expect(source?.state).toBe("active");
		expect(persistedIssue?.cycleId).toBe(ids.source);
		expect(await db.select().from(issueActivity)).toHaveLength(0);
	});

	test("rolls generated cycles back with completion writes on a database failure", async () => {
		const settings = await seedSettings();
		await seedSource();
		await seedPlannedIssue();
		await seedCompletionJob(settings);
		await db.execute(sql`
			create function lifecycle_activity_failure() returns trigger language plpgsql as $$
			begin
				raise exception 'forced lifecycle activity failure';
			end;
			$$
		`);
		await db.execute(sql`
			create trigger lifecycle_activity_failure_trigger before insert on issue_activity
			for each row execute function lifecycle_activity_failure()
		`);
		try {
			await expect(
				completeScheduledCycle(completionInput(settings)),
			).rejects.toThrow();
		} finally {
			await db.execute(
				sql`drop trigger if exists lifecycle_activity_failure_trigger on issue_activity`,
			);
			await db.execute(
				sql`drop function if exists lifecycle_activity_failure()`,
			);
		}
		const rows = await db
			.select()
			.from(cycle)
			.where(
				and(eq(cycle.workspaceId, ids.workspace), eq(cycle.teamId, ids.team)),
			);
		expect(rows).toHaveLength(1);
		expect(rows[0]?.state).toBe("active");
		const [persistedIssue] = await db
			.select({ cycleId: issue.cycleId })
			.from(issue)
			.where(eq(issue.id, ids.issue));
		expect(persistedIssue?.cycleId).toBe(ids.source);
		expect(await db.select().from(issueActivity)).toHaveLength(0);
	});

	test("concurrent workers complete one lifecycle job exactly once", async () => {
		const { CycleWorker } = await import("./worker");
		const settings = await seedSettings();
		await seedSource();
		await seedPlannedIssue();
		await seedCompletionJob(settings);
		await Promise.all([
			new CycleWorker({
				clock: { now: () => sourceEnd },
				automationEnabled: true,
				workerId: "lifecycle-concurrent-one",
				batchSize: 1,
			}).runOnce(),
			new CycleWorker({
				clock: { now: () => sourceEnd },
				automationEnabled: true,
				workerId: "lifecycle-concurrent-two",
				batchSize: 1,
			}).runOnce(),
		]);
		const [job] = await db
			.select()
			.from(cycleScheduleJob)
			.where(eq(cycleScheduleJob.id, "lifecycle-completion-job"));
		expect(job).toMatchObject({ status: "succeeded", outcome: "completed" });
		expect(await db.select().from(issueActivity)).toHaveLength(1);
	});

	test("worker crash after domain commit converges without duplicate activity", async () => {
		const { CycleWorker, DEFAULT_LEASE_MS } = await import("./worker");
		const settings = await seedSettings();
		await seedSource();
		await seedPlannedIssue();
		await seedCompletionJob(settings);
		await db
			.update(cycleScheduleJob)
			.set({ maxAttempts: 1 })
			.where(eq(cycleScheduleJob.id, "lifecycle-completion-job"));
		const first = new CycleWorker({
			clock: { now: () => sourceEnd },
			automationEnabled: true,
			workerId: "lifecycle-crash-before-ack",
			batchSize: 1,
			maxAttempts: 1,
			onBeforeLifecycleAcknowledgement: (jobId) => {
				if (jobId === "lifecycle-completion-job") {
					throw new Error("simulated crash before lifecycle acknowledgement");
				}
			},
		});
		await expect(first.runOnce()).rejects.toThrow(
			"simulated crash before lifecycle acknowledgement",
		);
		const [afterCrash] = await db
			.select()
			.from(cycleScheduleJob)
			.where(eq(cycleScheduleJob.id, "lifecycle-completion-job"));
		expect(afterCrash).toMatchObject({ status: "started", attempts: 1 });
		expect(await db.select().from(issueActivity)).toHaveLength(1);

		const recoveryTime = new Date(sourceEnd.getTime() + DEFAULT_LEASE_MS);
		await new CycleWorker({
			clock: { now: () => recoveryTime },
			automationEnabled: true,
			workerId: "lifecycle-crash-recovery",
			batchSize: 1,
			maxAttempts: 1,
		}).runOnce();
		const [recovered] = await db
			.select()
			.from(cycleScheduleJob)
			.where(eq(cycleScheduleJob.id, "lifecycle-completion-job"));
		expect(recovered).toMatchObject({
			status: "succeeded",
			outcome: "already_completed",
			attempts: 1,
		});
		expect(await db.select().from(issueActivity)).toHaveLength(1);
	});

	test("serializes concurrent completion and converges after the commit", async () => {
		const settings = await seedSettings();
		await seedSource();
		await seedPlannedIssue();
		await seedCompletionJob(settings);
		const results = await Promise.all([
			completeScheduledCycle(completionInput(settings)),
			completeScheduledCycle(completionInput(settings)),
		]);
		expect(results.map((result) => result.status).sort()).toEqual([
			"already_completed",
			"completed",
		]);
		expect(await db.select().from(issueActivity)).toHaveLength(1);
	});
});
