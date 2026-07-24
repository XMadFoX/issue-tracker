import {
	afterAll,
	beforeAll,
	beforeEach,
	describe,
	expect,
	setDefaultTimeout,
	test,
} from "bun:test";
import { createId } from "@paralleldrive/cuid2";
import { count, eq, sql } from "drizzle-orm";
import setupDb from "../../utils/prepare-tests";
import type { PlannedCycleHorizonResult } from "./generation";

const ids = { workspace: createId(), team: createId() };
const now = new Date("2026-07-15T10:00:00.000Z");
let db: typeof import("db").db;
let cycle: typeof import("db/features/tracker/cycles.schema").cycle;
let cycleScheduleJob: typeof import("db/features/tracker/cycle-schedule-jobs.schema").cycleScheduleJob;
let teamCycleSettings: typeof import("db/features/tracker/team-cycle-settings.schema").teamCycleSettings;
let team: typeof import("db/features/tracker/tracker.schema").team;
let workspace: typeof import("db/features/tracker/tracker.schema").workspace;
let teardown: Awaited<ReturnType<typeof setupDb>>;

const clock = { now: () => now };

async function expectRejected(action: () => Promise<unknown>): Promise<void> {
	let rejected = false;
	try {
		await action();
	} catch {
		rejected = true;
	}
	expect(rejected).toBeTrue();
}

setDefaultTimeout(30_000);

beforeAll(async () => {
	teardown = await setupDb();
	({ db } = await import("db"));
	({ cycle } = await import("db/features/tracker/cycles.schema"));
	({ cycleScheduleJob } = await import(
		"db/features/tracker/cycle-schedule-jobs.schema"
	));
	({ teamCycleSettings } = await import(
		"db/features/tracker/team-cycle-settings.schema"
	));
	({ team, workspace } = await import("db/features/tracker/tracker.schema"));
}, 300_000);

afterAll(async () => {
	if (teardown) await teardown();
}, 60_000);

beforeEach(async () => {
	await db.execute(sql`truncate table team, workspace cascade`);
	await db.insert(workspace).values({
		id: ids.workspace,
		name: "Worker Workspace",
		slug: `worker-${ids.workspace}`,
		timezone: "UTC",
	});
	await db.insert(team).values({
		id: ids.team,
		workspaceId: ids.workspace,
		name: "Worker Team",
		key: `W${ids.team.slice(0, 3)}`,
		privacy: "public",
	});
	await db.insert(teamCycleSettings).values({
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
	});
});

describe("durable cycle worker", () => {
	test("deduplicates enqueue and creates one current horizon", async () => {
		const { CycleWorker, enqueueGenerationJobs } = await import("./worker");
		expect(await enqueueGenerationJobs({ clock })).toEqual({
			enqueued: 1,
			skipped: 0,
		});
		expect(await enqueueGenerationJobs({ clock })).toEqual({
			enqueued: 0,
			skipped: 1,
		});

		const result = await new CycleWorker({
			clock,
			automationEnabled: true,
			workerId: "worker-test",
		}).runOnce();
		expect(result.claimed).toBe(1);
		expect(result.acknowledged).toBe(1);
		const rows = await db
			.select({ count: count() })
			.from(cycle)
			.where(eq(cycle.origin, "scheduled"));
		expect(rows[0]?.count).toBe(2);
	});

	test("two complete workers execute one queued generation", async () => {
		const { CycleWorker } = await import("./worker");
		const [first, second] = await Promise.all([
			new CycleWorker({
				clock,
				automationEnabled: true,
				workerId: "run-one",
			}).runOnce(),
			new CycleWorker({
				clock,
				automationEnabled: true,
				workerId: "run-two",
			}).runOnce(),
		]);
		expect(first.claimed + second.claimed).toBe(1);
		expect(first.acknowledged + second.acknowledged).toBe(1);
		expect(
			(await db.select().from(cycle).where(eq(cycle.origin, "scheduled")))
				.length,
		).toBe(2);
	});

	test("SKIP LOCKED gives one of two workers the job", async () => {
		const { enqueueGenerationJobs, claimGenerationJobs } = await import(
			"./worker"
		);
		await enqueueGenerationJobs({ clock });
		const [first, second] = await Promise.all([
			claimGenerationJobs({
				config: { workerId: "one", clock, batchSize: 1 },
			}),
			claimGenerationJobs({
				config: { workerId: "two", clock, batchSize: 1 },
			}),
		]);
		expect(first.length + second.length).toBe(1);
	});

	test("disabled settings acknowledge a queued job without writing cycles", async () => {
		const { CycleWorker } = await import("./worker");
		await db
			.update(teamCycleSettings)
			.set({ cadenceEnabled: false })
			.where(eq(teamCycleSettings.teamId, ids.team));
		await db.insert(cycleScheduleJob).values({
			id: createId(),
			workspaceId: ids.workspace,
			teamId: ids.team,
			jobType: "generate_planned_cycles",
			scheduledBoundary: now,
			availableAt: now,
		});

		const result = await new CycleWorker({
			clock,
			automationEnabled: true,
			workerId: "disabled-test",
		}).runOnce();
		expect(result.acknowledged).toBe(1);
		const rows = await db
			.select({
				status: cycleScheduleJob.status,
				outcome: cycleScheduleJob.outcome,
			})
			.from(cycleScheduleJob);
		expect(rows[0]).toMatchObject({ status: "succeeded", outcome: "disabled" });
	});

	test("reclaims stale leases with a new token", async () => {
		const { claimGenerationJobs } = await import("./worker");
		await db.insert(cycleScheduleJob).values({
			id: createId(),
			workspaceId: ids.workspace,
			teamId: ids.team,
			jobType: "generate_planned_cycles",
			scheduledBoundary: now,
			status: "started",
			attempts: 1,
			availableAt: now,
			leaseExpiresAt: new Date(now.getTime() - 1),
			workerId: "old-worker",
			claimToken: "old-token",
			startedAt: new Date(now.getTime() - 1),
		});
		const claimed = await claimGenerationJobs({
			config: { workerId: "new-worker", clock, batchSize: 1 },
		});
		expect(claimed).toHaveLength(1);
		expect(claimed[0]?.attempts).toBe(2);
		expect(claimed[0]?.claimToken).not.toBe("old-token");
	});

	test("retries transient failures and persists terminal typed conflicts", async () => {
		const { CycleWorker } = await import("./worker");
		let current = now;
		const retryClock = { now: () => current };
		const transientWorker = new CycleWorker({
			clock: retryClock,
			automationEnabled: true,
			workerId: "retry-test",
			maxAttempts: 2,
			generateHorizon: async () => {
				throw new Error("database temporarily unavailable");
			},
		});
		await transientWorker.runOnce();
		const queued = await db
			.select()
			.from(cycleScheduleJob)
			.where(eq(cycleScheduleJob.status, "queued"));
		expect(queued[0]?.attempts).toBe(1);
		current = new Date(now.getTime() + 60_000);
		await transientWorker.runOnce();
		const failed = await db
			.select()
			.from(cycleScheduleJob)
			.where(eq(cycleScheduleJob.status, "failed"));
		expect(failed[0]?.attempts).toBe(2);
		const retryJob = failed[0];
		if (!retryJob) throw new Error("retry job was not persisted");
		await db
			.update(cycleScheduleJob)
			.set({
				status: "queued",
				attempts: 0,
				availableAt: now,
				finishedAt: null,
			})
			.where(eq(cycleScheduleJob.id, retryJob.id));

		const conflictWorker = new CycleWorker({
			clock,
			automationEnabled: true,
			workerId: "conflict-test",
			generateHorizon: async () => ({
				status: "manual_cycle_conflict",
				cycleId: "conflicting-cycle",
				scheduledBoundary: now,
			}),
		});
		await conflictWorker.runOnce();
		const terminal = await db
			.select()
			.from(cycleScheduleJob)
			.where(eq(cycleScheduleJob.status, "failed"));
		expect(
			terminal.some((job) => job.outcome === "manual_cycle_conflict"),
		).toBe(true);
	});

	test("kill switch leaves queued work untouched", async () => {
		const { CycleWorker, enqueueGenerationJobs } = await import("./worker");
		await enqueueGenerationJobs({ clock });
		const result = await new CycleWorker({
			clock,
			automationEnabled: false,
			workerId: "disabled-worker",
		}).runOnce();
		expect(result.claimed).toBe(0);
		const queued = await db
			.select()
			.from(cycleScheduleJob)
			.where(eq(cycleScheduleJob.status, "queued"));
		expect(queued).toHaveLength(1);
	});

	test("database enforces ownership, uniqueness, state, bounds, and cascades", async () => {
		const secondWorkspace = createId();
		const secondTeam = createId();
		await db.insert(workspace).values({
			id: secondWorkspace,
			name: "Second Workspace",
			slug: `second-${secondWorkspace}`,
			timezone: "UTC",
		});
		await db.insert(team).values({
			id: secondTeam,
			workspaceId: secondWorkspace,
			name: "Second Team",
			key: `S${secondTeam.slice(0, 3)}`,
			privacy: "public",
		});

		const baseJob = {
			id: createId(),
			workspaceId: ids.workspace,
			teamId: ids.team,
			jobType: "generate_planned_cycles" as const,
			scheduledBoundary: new Date(now.getTime() + 86_400_000),
		};
		await expectRejected(() =>
			db.insert(cycleScheduleJob).values({
				...baseJob,
				workspaceId: secondWorkspace,
			}),
		);
		await db.insert(cycleScheduleJob).values(baseJob);
		await expectRejected(() =>
			db.insert(cycleScheduleJob).values({ ...baseJob, id: createId() }),
		);
		await expectRejected(() =>
			db.insert(cycleScheduleJob).values({
				...baseJob,
				id: createId(),
				scheduledBoundary: new Date(now.getTime() + 172_800_000),
				attempts: -1,
			}),
		);
		await expectRejected(() =>
			db.insert(cycleScheduleJob).values({
				...baseJob,
				id: createId(),
				scheduledBoundary: new Date(now.getTime() + 259_200_000),
				attempts: 9,
			}),
		);
		await expectRejected(() =>
			db.insert(cycleScheduleJob).values({
				...baseJob,
				id: createId(),
				scheduledBoundary: new Date(now.getTime() + 345_600_000),
				status: "started",
			}),
		);
		const startedFields = {
			leaseExpiresAt: new Date(now.getTime() + 60_000),
			workerId: "worker",
			claimToken: "token",
			startedAt: now,
			attempts: 1,
		};
		await expectRejected(() =>
			db.insert(cycleScheduleJob).values({
				...baseJob,
				id: createId(),
				scheduledBoundary: new Date(now.getTime() + 380_000_000),
				status: "started",
				...startedFields,
				leaseExpiresAt: null,
			}),
		);
		await expectRejected(() =>
			db.insert(cycleScheduleJob).values({
				...baseJob,
				id: createId(),
				scheduledBoundary: new Date(now.getTime() + 381_000_000),
				status: "started",
				...startedFields,
				workerId: null,
			}),
		);
		await expectRejected(() =>
			db.insert(cycleScheduleJob).values({
				...baseJob,
				id: createId(),
				scheduledBoundary: new Date(now.getTime() + 382_000_000),
				status: "started",
				...startedFields,
				claimToken: null,
			}),
		);
		await expectRejected(() =>
			db.insert(cycleScheduleJob).values({
				...baseJob,
				id: createId(),
				scheduledBoundary: new Date(now.getTime() + 383_000_000),
				status: "started",
				...startedFields,
				startedAt: null,
			}),
		);
		await expectRejected(() =>
			db.insert(cycleScheduleJob).values({
				...baseJob,
				id: createId(),
				scheduledBoundary: new Date(now.getTime() + 384_000_000),
				maxAttempts: 0,
			}),
		);
		await expectRejected(() =>
			db.insert(cycleScheduleJob).values({
				...baseJob,
				id: createId(),
				scheduledBoundary: new Date(now.getTime() + 432_000_000),
				status: "queued",
				workerId: "claimed",
			}),
		);
		await expectRejected(() =>
			db.insert(cycleScheduleJob).values({
				...baseJob,
				id: createId(),
				scheduledBoundary: new Date(now.getTime() + 433_000_000),
				status: "queued",
				leaseExpiresAt: now,
			}),
		);
		await expectRejected(() =>
			db.insert(cycleScheduleJob).values({
				...baseJob,
				id: createId(),
				scheduledBoundary: new Date(now.getTime() + 434_000_000),
				status: "queued",
				claimToken: "claimed",
			}),
		);
		await expectRejected(() =>
			db.insert(cycleScheduleJob).values({
				...baseJob,
				id: createId(),
				scheduledBoundary: new Date(now.getTime() + 435_000_000),
				status: "queued",
				finishedAt: now,
			}),
		);
		await expectRejected(() =>
			db.insert(cycleScheduleJob).values({
				...baseJob,
				id: createId(),
				scheduledBoundary: new Date(now.getTime() + 518_400_000),
				status: "succeeded",
				finishedAt: now,
				claimToken: "late-claim",
			}),
		);
		await expectRejected(() =>
			db.insert(cycleScheduleJob).values({
				...baseJob,
				id: createId(),
				scheduledBoundary: new Date(now.getTime() + 519_400_000),
				status: "failed",
				finishedAt: now,
				leaseExpiresAt: now,
			}),
		);
		await expectRejected(() =>
			db.insert(cycleScheduleJob).values({
				...baseJob,
				id: createId(),
				scheduledBoundary: new Date(now.getTime() + 520_400_000),
				status: "succeeded",
				finishedAt: now,
				workerId: "late-worker",
			}),
		);

		const cascadeTeam = createId();
		await db.insert(team).values({
			id: cascadeTeam,
			workspaceId: ids.workspace,
			name: "Cascade Team",
			key: `C${cascadeTeam.slice(0, 3)}`,
			privacy: "public",
		});
		await db.insert(cycleScheduleJob).values({
			...baseJob,
			id: createId(),
			teamId: cascadeTeam,
			scheduledBoundary: new Date(now.getTime() + 604_800_000),
		});
		await db.delete(team).where(eq(team.id, cascadeTeam));
		expect(
			await db
				.select()
				.from(cycleScheduleJob)
				.where(eq(cycleScheduleJob.teamId, cascadeTeam)),
		).toHaveLength(0);
		await db.delete(workspace).where(eq(workspace.id, ids.workspace));
		expect(
			await db
				.select()
				.from(cycleScheduleJob)
				.where(eq(cycleScheduleJob.teamId, ids.team)),
		).toHaveLength(0);
	});

	test("concurrent enqueue pollers deduplicate on the natural key", async () => {
		const { enqueueGenerationJobs } = await import("./worker");
		const results = await Promise.all(
			Array.from({ length: 4 }, () => enqueueGenerationJobs({ clock })),
		);
		expect(results.reduce((total, result) => total + result.enqueued, 0)).toBe(
			1,
		);
		expect(results.reduce((total, result) => total + result.skipped, 0)).toBe(
			3,
		);
		expect(await db.select().from(cycleScheduleJob)).toHaveLength(1);
	});

	test("a real stale worker acknowledgement cannot change a reclaimed lease", async () => {
		const { CycleWorker } = await import("./worker");
		await db
			.update(teamCycleSettings)
			.set({ cadenceEnabled: false })
			.where(eq(teamCycleSettings.teamId, ids.team));
		const jobId = createId();
		await db.insert(cycleScheduleJob).values({
			id: jobId,
			workspaceId: ids.workspace,
			teamId: ids.team,
			jobType: "generate_planned_cycles",
			scheduledBoundary: now,
			availableAt: now,
		});

		let releaseOldWorker!: () => void;
		const oldWorkerGeneration = new Promise<void>((resolve) => {
			releaseOldWorker = resolve;
		});
		let oldWorkerClaimed!: () => void;
		const oldWorkerClaim = new Promise<void>((resolve) => {
			oldWorkerClaimed = resolve;
		});
		const oldWorker = new CycleWorker({
			clock,
			automationEnabled: true,
			workerId: "old-worker",
			leaseMs: 1_000,
			generateHorizon: async () => {
				await oldWorkerGeneration;
				return { status: "created", created: [], scheduledBoundaries: [] };
			},
			onBeforeGeneration: () => oldWorkerClaimed(),
		});
		const oldRun = oldWorker.runOnce();
		await oldWorkerClaim;

		const replacement = new CycleWorker({
			clock: { now: () => new Date(now.getTime() + 2_000) },
			automationEnabled: true,
			workerId: "replacement-worker",
			leaseMs: 1_000,
			generateHorizon: async () => ({
				status: "created",
				created: [],
				scheduledBoundaries: [],
			}),
		});
		const replacementResult = await replacement.runOnce();
		expect(replacementResult.claimed).toBe(1);
		expect(replacementResult.acknowledged).toBe(1);

		releaseOldWorker();
		const oldResult = await oldRun;
		expect(oldResult.claimed).toBe(1);
		expect(oldResult.acknowledged).toBe(0);
		const [row] = await db
			.select()
			.from(cycleScheduleJob)
			.where(eq(cycleScheduleJob.id, jobId));
		expect(row).toMatchObject({
			status: "succeeded",
			workerId: null,
			claimToken: null,
			outcome: "created",
		});
	});

	test("batch event failure releases every active lease and permits stale recovery", async () => {
		const { CycleWorker } = await import("./worker");
		await db.insert(cycleScheduleJob).values([
			{
				id: createId(),
				workspaceId: ids.workspace,
				teamId: ids.team,
				jobType: "generate_planned_cycles",
				scheduledBoundary: now,
				availableAt: now,
			},
			{
				id: createId(),
				workspaceId: ids.workspace,
				teamId: ids.team,
				jobType: "generate_planned_cycles",
				scheduledBoundary: new Date(now.getTime() + 86_400_000),
				availableAt: now,
			},
		]);
		const failing = new CycleWorker({
			clock,
			batchSize: 2,
			automationEnabled: true,
			workerId: "batch-failure",
			onJobEvent: (event) => {
				if (event.phase === "started") throw new Error("event hook failed");
			},
		});
		await expect(failing.runOnce()).rejects.toThrow("event hook failed");
		expect(failing.getHealth().activeLeases).toBe(0);
		const started = await db
			.select()
			.from(cycleScheduleJob)
			.where(eq(cycleScheduleJob.status, "started"));
		expect(started).toHaveLength(2);
		const recoveryClock = {
			now: () => new Date(now.getTime() + 5 * 60_000 + 1),
		};
		const { claimGenerationJobs } = await import("./worker");
		expect(
			await claimGenerationJobs({
				config: { workerId: "recovery", clock: recoveryClock, batchSize: 2 },
			}),
		).toHaveLength(2);
	});

	test("all typed terminal generation outcomes fail without retry metrics", async () => {
		const { CycleWorker } = await import("./worker");
		await db
			.update(teamCycleSettings)
			.set({ cadenceEnabled: false })
			.where(eq(teamCycleSettings.teamId, ids.team));
		const terminalResults: PlannedCycleHorizonResult[] = [
			{ status: "settings_missing" },
			{ status: "invalid_timezone", workspaceTimezone: "Invalid/Timezone" },
			{
				status: "manual_cycle_conflict",
				cycleId: "manual",
				scheduledBoundary: now,
			},
			{
				status: "scheduled_cycle_conflict",
				cycleId: "scheduled",
				scheduledBoundary: now,
			},
			{ status: "horizon_unreachable" },
		];
		await db.insert(cycleScheduleJob).values(
			terminalResults.map((_, index) => ({
				id: createId(),
				workspaceId: ids.workspace,
				teamId: ids.team,
				jobType: "generate_planned_cycles" as const,
				scheduledBoundary: new Date(now.getTime() + index * 86_400_000),
				availableAt: now,
			})),
		);
		let index = 0;
		const worker = new CycleWorker({
			clock,
			batchSize: 1,
			automationEnabled: true,
			workerId: "typed-terminal",
			generateHorizon: async () =>
				terminalResults[index++] ?? { status: "horizon_unreachable" },
		});
		for (const _result of terminalResults) await worker.runOnce();
		const rows = await db.select().from(cycleScheduleJob);
		expect(rows.filter((row) => row.status === "failed")).toHaveLength(5);
		expect(
			rows.filter((row) => row.outcome === "transient_error"),
		).toHaveLength(0);
		expect(worker.getHealth().activeLeases).toBe(0);
	});

	test("retry delay is deterministic and capped", async () => {
		const { retryDelayMs } = await import("./worker");
		expect(retryDelayMs(1)).toBe(60_000);
		expect(retryDelayMs(2)).toBe(120_000);
		expect(retryDelayMs(8)).toBe(60 * 60 * 1_000);
		expect(retryDelayMs(80)).toBe(60 * 60 * 1_000);
	});

	test("a crash before generation leaves a reclaimable lease", async () => {
		const { CycleWorker } = await import("./worker");
		const { enqueueGenerationJobs } = await import("./worker");
		await enqueueGenerationJobs({ clock });
		const crashed = new CycleWorker({
			clock,
			automationEnabled: true,
			workerId: "crashed-before-generation",
			onBeforeGeneration: () => {
				throw new Error("worker crashed");
			},
		});
		await expect(crashed.runOnce()).rejects.toThrow("worker crashed");
		expect(crashed.getHealth().activeLeases).toBe(0);
		const row = (await db.select().from(cycleScheduleJob))[0];
		expect(row).toMatchObject({
			status: "started",
			workerId: "crashed-before-generation",
		});

		const recovered = new CycleWorker({
			clock: { now: () => new Date(now.getTime() + 5 * 60 * 1000 + 1) },
			automationEnabled: true,
			workerId: "recovery-after-crash",
		});
		await recovered.runOnce();
		expect((await db.select().from(cycleScheduleJob))[0]?.status).toBe(
			"succeeded",
		);
		expect(recovered.getHealth().activeLeases).toBe(0);
	});

	test("a crash after generation commit before acknowledgement cannot duplicate cycles", async () => {
		const { CycleWorker } = await import("./worker");
		const { maintainPlannedCycleHorizon } = await import("./generation");
		let crashed = false;
		const worker = new CycleWorker({
			clock,
			automationEnabled: true,
			workerId: "crashed-after-generation",
			generateHorizon: (input) => maintainPlannedCycleHorizon(input),
			onBeforeAcknowledgement: () => {
				if (!crashed) {
					crashed = true;
					throw new Error("acknowledgement process crashed");
				}
			},
		});
		await expect(worker.runOnce()).rejects.toThrow(
			"acknowledgement process crashed",
		);
		expect(
			(await db.select().from(cycle)).filter(
				(row) => row.origin === "scheduled",
			),
		).toHaveLength(2);
		expect((await db.select().from(cycleScheduleJob))[0]?.status).toBe(
			"started",
		);

		const recovered = new CycleWorker({
			clock: { now: () => new Date(now.getTime() + 5 * 60 * 1000 + 1) },
			automationEnabled: true,
			workerId: "recovery-after-commit",
		});
		await recovered.runOnce();
		expect((await db.select().from(cycleScheduleJob))[0]?.status).toBe(
			"succeeded",
		);
		expect(
			(await db.select().from(cycle)).filter(
				(row) => row.origin === "scheduled",
			),
		).toHaveLength(2);
		expect(recovered.getHealth().activeLeases).toBe(0);
	});

	test("a crash during retry finalization is reclaimed without losing the retry", async () => {
		const { CycleWorker } = await import("./worker");
		const failed = new CycleWorker({
			clock,
			automationEnabled: true,
			workerId: "crashed-during-retry-finalization",
			generateHorizon: async () => {
				throw new Error("temporary outage");
			},
			onBeforeFailureAcknowledgement: () => {
				throw new Error("finalizer crashed");
			},
		});
		await expect(failed.runOnce()).rejects.toThrow("finalizer crashed");
		expect((await db.select().from(cycleScheduleJob))[0]?.status).toBe(
			"started",
		);

		const recovered = new CycleWorker({
			clock: { now: () => new Date(now.getTime() + 5 * 60 * 1000 + 1) },
			automationEnabled: true,
			workerId: "retry-finalization-recovery",
			generateHorizon: async () => ({
				status: "already_satisfied",
				scheduledBoundaries: [],
			}),
		});
		await recovered.runOnce();
		expect((await db.select().from(cycleScheduleJob))[0]?.status).toBe(
			"succeeded",
		);
	});

	test("batch processor failures account for every claimed row", async () => {
		const { CycleWorker } = await import("./worker");
		let calls = 0;
		const worker = new CycleWorker({
			clock,
			batchSize: 2,
			automationEnabled: true,
			workerId: "batch-processor-failure",
			generateHorizon: async () => {
				calls += 1;
				if (calls === 1) throw new Error("one job failed");
				return { status: "already_satisfied", scheduledBoundaries: [] };
			},
		});
		await db.insert(cycleScheduleJob).values([
			{
				id: createId(),
				workspaceId: ids.workspace,
				teamId: ids.team,
				jobType: "generate_planned_cycles",
				scheduledBoundary: now,
				availableAt: now,
			},
			{
				id: createId(),
				workspaceId: ids.workspace,
				teamId: ids.team,
				jobType: "generate_planned_cycles",
				scheduledBoundary: new Date(now.getTime() + 86_400_000),
				availableAt: now,
			},
		]);
		const result = await worker.runOnce();
		expect(result).toMatchObject({ claimed: 2, acknowledged: 2 });
		expect(
			(await db.select().from(cycleScheduleJob))
				.map((row) => row.status)
				.sort(),
		).toEqual(["queued", "succeeded"]);
		expect(worker.getHealth().activeLeases).toBe(0);
	});

	test("batch acknowledgement failure releases all leases for stale recovery", async () => {
		const { CycleWorker } = await import("./worker");
		await db.insert(cycleScheduleJob).values([
			{
				id: createId(),
				workspaceId: ids.workspace,
				teamId: ids.team,
				jobType: "generate_planned_cycles",
				scheduledBoundary: now,
				availableAt: now,
			},
			{
				id: createId(),
				workspaceId: ids.workspace,
				teamId: ids.team,
				jobType: "generate_planned_cycles",
				scheduledBoundary: new Date(now.getTime() + 86_400_000),
				availableAt: now,
			},
		]);
		const worker = new CycleWorker({
			clock,
			batchSize: 2,
			automationEnabled: true,
			workerId: "batch-ack-failure",
			onBeforeAcknowledgement: () => {
				throw new Error("ack failed");
			},
			generateHorizon: async () => ({
				status: "already_satisfied",
				scheduledBoundaries: [],
			}),
		});
		await expect(worker.runOnce()).rejects.toThrow("ack failed");
		expect(worker.getHealth().activeLeases).toBe(0);
		const recovery = new CycleWorker({
			clock: { now: () => new Date(now.getTime() + 5 * 60 * 1000 + 1) },
			batchSize: 2,
			automationEnabled: true,
			workerId: "batch-ack-recovery",
			generateHorizon: async () => ({
				status: "already_satisfied",
				scheduledBoundaries: [],
			}),
		});
		const result = await recovery.runOnce();
		expect(result).toMatchObject({ claimed: 2, acknowledged: 2 });
		expect(
			(await db.select().from(cycleScheduleJob)).every(
				(row) => row.status === "succeeded",
			),
		).toBe(true);
		expect(recovery.getHealth().activeLeases).toBe(0);
	});

	test("worker generation races manual generation under the team lock", async () => {
		const { CycleWorker, enqueueGenerationJobs } = await import("./worker");
		const { maintainPlannedCycleHorizon } = await import("./generation");
		await enqueueGenerationJobs({ clock });
		const worker = new CycleWorker({
			clock,
			automationEnabled: true,
			workerId: "worker-manual-race",
			generateHorizon: (input) => maintainPlannedCycleHorizon(input),
		});
		const [workerResult, manualResult] = await Promise.all([
			worker.runOnce(),
			maintainPlannedCycleHorizon({
				workspaceId: ids.workspace,
				teamId: ids.team,
				now,
			}),
		]);
		expect(workerResult.claimed).toBe(1);
		expect(workerResult.acknowledged).toBe(1);
		expect(["created", "already_satisfied"]).toContain(manualResult.status);
		expect(
			(await db.select().from(cycle)).filter(
				(row) => row.origin === "scheduled",
			),
		).toHaveLength(2);
	});

	test("disabling cadence after enqueue is handled at claim time", async () => {
		const { CycleWorker, enqueueGenerationJobs } = await import("./worker");
		await enqueueGenerationJobs({ clock });
		await db
			.update(teamCycleSettings)
			.set({ cadenceEnabled: false })
			.where(eq(teamCycleSettings.teamId, ids.team));
		const result = await new CycleWorker({
			clock,
			automationEnabled: true,
			workerId: "disable-after-enqueue",
		}).runOnce();
		expect(result.acknowledged).toBe(1);
		expect((await db.select().from(cycleScheduleJob))[0]?.outcome).toBe(
			"disabled",
		);
		expect(await db.select().from(cycle)).toHaveLength(0);
	});

	test("a settings change is applied when a queued retry is reclaimed", async () => {
		const { CycleWorker } = await import("./worker");
		let current = now;
		const firstAttempt = new CycleWorker({
			clock: { now: () => current },
			automationEnabled: true,
			workerId: "settings-retry",
			maxAttempts: 3,
			generateHorizon: async () => {
				throw new Error("temporary failure");
			},
		});
		await firstAttempt.runOnce();
		await db
			.update(teamCycleSettings)
			.set({ cadenceDays: 14, planningHorizon: 1 })
			.where(eq(teamCycleSettings.teamId, ids.team));
		current = new Date(now.getTime() + 60_000);
		const retry = new CycleWorker({
			clock: { now: () => current },
			automationEnabled: true,
			workerId: "settings-retry-success",
		});
		await retry.runOnce();
		const generated = (await db.select().from(cycle)).filter(
			(row) => row.origin === "scheduled",
		);
		expect(generated).toHaveLength(1);
		const generatedCycle = generated[0];
		if (!generatedCycle) throw new Error("expected a generated cycle");
		expect(generatedCycle.endDate.getTime()).toBe(
			generatedCycle.startDate.getTime() + 14 * 86_400_000,
		);
		expect((await db.select().from(cycleScheduleJob))[0]?.status).toBe(
			"succeeded",
		);
	});

	test("worker creates only the current horizon, not historical catch-up jobs", async () => {
		const { CycleWorker } = await import("./worker");
		const result = await new CycleWorker({
			clock,
			automationEnabled: true,
			workerId: "no-historical-catch-up",
		}).runOnce();
		expect(result.claimed).toBe(1);
		const generated = (await db.select().from(cycle)).filter(
			(row) => row.origin === "scheduled",
		);
		expect(generated).toHaveLength(2);
		expect(generated.every((row) => row.startDate >= now)).toBe(true);
	});

	test("legal job transitions and every terminal-state invariant are enforced", async () => {
		const base = {
			workspaceId: ids.workspace,
			teamId: ids.team,
			jobType: "generate_planned_cycles" as const,
			availableAt: now,
		};
		const queuedId = createId();
		await db
			.insert(cycleScheduleJob)
			.values({ ...base, id: queuedId, scheduledBoundary: now });
		const started = new Date(now.getTime() + 60_000);
		await db
			.update(cycleScheduleJob)
			.set({
				status: "started",
				attempts: 1,
				leaseExpiresAt: started,
				workerId: "transition-worker",
				claimToken: "transition-token",
				startedAt: now,
			})
			.where(eq(cycleScheduleJob.id, queuedId));
		await db
			.update(cycleScheduleJob)
			.set({
				status: "queued",
				leaseExpiresAt: null,
				workerId: null,
				claimToken: null,
				startedAt: null,
			})
			.where(eq(cycleScheduleJob.id, queuedId));
		await db
			.update(cycleScheduleJob)
			.set({
				status: "started",
				attempts: 1,
				leaseExpiresAt: started,
				workerId: "transition-worker",
				claimToken: "transition-token",
				startedAt: now,
			})
			.where(eq(cycleScheduleJob.id, queuedId));
		await db
			.update(cycleScheduleJob)
			.set({
				status: "succeeded",
				finishedAt: started,
				leaseExpiresAt: null,
				workerId: null,
				claimToken: null,
			})
			.where(eq(cycleScheduleJob.id, queuedId));
		const failedId = createId();
		await db.insert(cycleScheduleJob).values({
			...base,
			id: failedId,
			scheduledBoundary: new Date(now.getTime() + 86_400_000),
		});
		await db
			.update(cycleScheduleJob)
			.set({
				status: "started",
				attempts: 1,
				leaseExpiresAt: started,
				workerId: "transition-worker",
				claimToken: "transition-token",
				startedAt: now,
			})
			.where(eq(cycleScheduleJob.id, failedId));
		await db
			.update(cycleScheduleJob)
			.set({
				status: "failed",
				outcome: "typed_conflict",
				finishedAt: started,
				leaseExpiresAt: null,
				workerId: null,
				claimToken: null,
			})
			.where(eq(cycleScheduleJob.id, failedId));
		await expectRejected(() =>
			db.insert(cycleScheduleJob).values({
				...base,
				id: createId(),
				scheduledBoundary: new Date(now.getTime() + 2 * 86_400_000),
				status: "succeeded",
				finishedAt: null,
			}),
		);
		await expectRejected(() =>
			db.insert(cycleScheduleJob).values({
				...base,
				id: createId(),
				scheduledBoundary: new Date(now.getTime() + 3 * 86_400_000),
				status: "failed",
				finishedAt: null,
			}),
		);
		await expectRejected(() =>
			db.insert(cycleScheduleJob).values({
				...base,
				id: createId(),
				scheduledBoundary: new Date(now.getTime() + 4 * 86_400_000),
				status: "started",
				attempts: 1,
				leaseExpiresAt: started,
				workerId: "w",
				claimToken: "invalid-started",
				startedAt: now,
				finishedAt: started,
			}),
		);
		const rows = await db.select().from(cycleScheduleJob);
		expect(rows.find((row) => row.id === queuedId)?.status).toBe("succeeded");
		expect(rows.find((row) => row.id === failedId)?.status).toBe("failed");
	});

	test("a closed database marks the worker unready without retaining leases", async () => {
		const { closeDb } = await import("db");
		const { CycleWorker } = await import("./worker");
		await closeDb();
		const worker = new CycleWorker({
			automationEnabled: true,
			workerId: "closed-db",
		});
		await expect(worker.runOnce()).rejects.toThrow();
		expect(worker.getHealth()).toMatchObject({
			dbReady: false,
			activeLeases: 0,
		});
	});
});
