import {
	afterAll,
	beforeAll,
	beforeEach,
	describe,
	expect,
	test,
} from "bun:test";
import { eq, sql } from "drizzle-orm";
import setupDb from "../../utils/prepare-tests";

let db: typeof import("db").db;
let cycleScheduleJob: typeof import("db/features/tracker/cycle-schedule-jobs.schema").cycleScheduleJob;
let cycle: typeof import("db/features/tracker/cycles.schema").cycle;
let teamCycleSettings: typeof import("db/features/tracker/team-cycle-settings.schema").teamCycleSettings;
let team: typeof import("db/features/tracker/tracker.schema").team;
let workspace: typeof import("db/features/tracker/tracker.schema").workspace;
let enqueueLifecycleJobs: typeof import("./lifecycle-jobs").enqueueLifecycleJobs;
let retryLifecycleJob: typeof import("./lifecycle-jobs").retryLifecycleJob;
let teardown: Awaited<ReturnType<typeof setupDb>>;

const ids = {
	workspace: "lifecycle-jobs-workspace",
	team: "lifecycle-jobs-team",
	cycle: "lifecycle-jobs-cycle",
};
const start = new Date("2026-11-01T05:30:00.000Z");
const end = new Date("2026-11-08T06:30:00.000Z");
const now = new Date("2026-11-01T06:00:00.000Z");

beforeAll(async () => {
	teardown = await setupDb();
	({ db } = await import("db"));
	({ cycleScheduleJob } = await import(
		"db/features/tracker/cycle-schedule-jobs.schema"
	));
	({ cycle } = await import("db/features/tracker/cycles.schema"));
	({ teamCycleSettings } = await import(
		"db/features/tracker/team-cycle-settings.schema"
	));
	({ team, workspace } = await import("db/features/tracker/tracker.schema"));
	({ enqueueLifecycleJobs, retryLifecycleJob } = await import(
		"./lifecycle-jobs"
	));
}, 300_000);

afterAll(async () => {
	if (teardown) await teardown();
}, 60_000);

beforeEach(async () => {
	await db.execute(sql`truncate table workspace cascade`);
	await db.insert(workspace).values({
		id: ids.workspace,
		name: "Lifecycle Jobs Workspace",
		slug: "lifecycle-jobs-workspace",
		timezone: "America/New_York",
	});
	await db.insert(team).values({
		id: ids.team,
		workspaceId: ids.workspace,
		name: "Lifecycle Jobs Team",
		key: "LJB",
		privacy: "public",
	});
	await db.insert(teamCycleSettings).values({
		teamId: ids.team,
		cadenceEnabled: true,
		cadenceDays: 7,
		anchorDate: start,
		planningHorizon: 2,
		endBehavior: "automatic",
		gracePeriodMinutes: 60,
		defaultRolloverPolicy: "carry_over",
		reminderLeadMinutes: 60,
		updatedBy: null,
	});
});

async function seedCycle(state: "planned" | "active" = "planned") {
	await db.insert(cycle).values({
		id: ids.cycle,
		workspaceId: ids.workspace,
		teamId: ids.team,
		name: "Lifecycle Jobs Cycle",
		sequence: 1,
		state,
		origin: "scheduled",
		scheduledBoundary: start,
		startDate: start,
		endDate: end,
	});
}

async function jobs() {
	return await db
		.select()
		.from(cycleScheduleJob)
		.where(eq(cycleScheduleJob.cycleId, ids.cycle));
}

describe("cycle lifecycle job reconciliation", () => {
	test("enqueues planned starts idempotently and replaces stale revisions", async () => {
		await seedCycle();
		expect(await enqueueLifecycleJobs({ now })).toEqual({
			enqueued: 1,
			skipped: 0,
		});
		expect(await enqueueLifecycleJobs({ now })).toEqual({
			enqueued: 0,
			skipped: 1,
		});
		const revision = new Date("2026-11-01T07:00:00.000Z");
		await db
			.update(teamCycleSettings)
			.set({ updatedAt: revision })
			.where(eq(teamCycleSettings.teamId, ids.team));
		expect(await enqueueLifecycleJobs({ now })).toEqual({
			enqueued: 1,
			skipped: 0,
		});
		const rows = await jobs();
		expect(rows).toHaveLength(2);
		expect(rows.find((row) => row.status === "succeeded")?.outcome).toBe(
			"obsolete_settings",
		);
		expect(
			rows.find((row) => row.status === "queued")?.eventRevisionAt,
		).toEqual(revision);
	});

	test("uses timezone-aware automatic grace and excludes confirmation mode", async () => {
		await seedCycle("active");
		await enqueueLifecycleJobs({ now });
		const [automatic] = await jobs();
		expect(automatic?.jobType).toBe("complete_scheduled_cycle");
		expect(automatic?.scheduledBoundary).toEqual(end);
		expect(automatic?.availableAt).toEqual(
			new Date("2026-11-08T07:30:00.000Z"),
		);
		await db
			.update(teamCycleSettings)
			.set({
				endBehavior: "confirmation_required",
				updatedAt: new Date("2026-11-01T08:00:00.000Z"),
			})
			.where(eq(teamCycleSettings.teamId, ids.team));
		await enqueueLifecycleJobs({ now });
		const rows = await jobs();
		expect(rows.filter((row) => row.status === "queued")).toHaveLength(0);
		expect(rows[0]?.status).toBe("succeeded");
	});

	test("preserves blocked attempts and requeues only after the blocker clears", async () => {
		await seedCycle();
		const [settings] = await db.select().from(teamCycleSettings);
		if (!settings) throw new Error("settings missing");
		await db.insert(cycle).values({
			id: "lifecycle-jobs-blocker",
			workspaceId: ids.workspace,
			teamId: ids.team,
			name: "Blocker",
			sequence: 2,
			state: "active",
			startDate: new Date("2026-10-25T05:30:00.000Z"),
			endDate: start,
		});
		await db.insert(cycleScheduleJob).values({
			id: "lifecycle-jobs-blocked-job",
			workspaceId: ids.workspace,
			teamId: ids.team,
			cycleId: ids.cycle,
			jobType: "start_scheduled_cycle",
			scheduledBoundary: start,
			eventRevisionAt: settings.updatedAt,
			status: "blocked",
			attempts: 0,
			availableAt: start,
			startedAt: now,
		});
		await enqueueLifecycleJobs({ now });
		expect((await jobs())[0]).toMatchObject({ status: "blocked", attempts: 0 });
		await db
			.update(cycle)
			.set({ state: "completed" })
			.where(eq(cycle.id, "lifecycle-jobs-blocker"));
		await enqueueLifecycleJobs({ now });
		expect((await jobs())[0]).toMatchObject({ status: "queued", attempts: 0 });
	});

	test("retries only failed jobs that still match current policy", async () => {
		await seedCycle();
		await enqueueLifecycleJobs({ now });
		const [job] = await jobs();
		if (!job) throw new Error("job missing");
		await db
			.update(cycleScheduleJob)
			.set({
				status: "failed",
				attempts: 8,
				finishedAt: now,
				outcome: "transient_error",
				lastErrorCode: "TRANSIENT_RUNTIME_ERROR",
				lastErrorSummary: "redacted",
			})
			.where(eq(cycleScheduleJob.id, job.id));
		expect(
			await retryLifecycleJob({
				workspaceId: ids.workspace,
				jobId: job.id,
				now,
			}),
		).toMatchObject({ status: "retried", jobId: job.id });
		expect((await jobs())[0]).toMatchObject({
			status: "queued",
			attempts: 0,
			startedAt: null,
			finishedAt: null,
			lastErrorCode: null,
		});

		await db
			.update(cycleScheduleJob)
			.set({ status: "failed", finishedAt: now })
			.where(eq(cycleScheduleJob.id, job.id));
		await db
			.update(teamCycleSettings)
			.set({ updatedAt: new Date("2026-11-01T09:00:00.000Z") })
			.where(eq(teamCycleSettings.teamId, ids.team));
		expect(
			await retryLifecycleJob({
				workspaceId: ids.workspace,
				jobId: job.id,
				now,
			}),
		).toEqual({ status: "obsolete" });
	});
});
