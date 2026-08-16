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
import { and, count, eq, sql } from "drizzle-orm";
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
		const startedJobTypes: string[] = [];
		const onJobEvent = (event: { phase: string; jobType: string }) => {
			if (event.phase === "started") startedJobTypes.push(event.jobType);
		};
		const [first, second] = await Promise.all([
			new CycleWorker({
				clock,
				automationEnabled: true,
				workerId: "run-one",
				onJobEvent,
			}).runOnce(),
			new CycleWorker({
				clock,
				automationEnabled: true,
				workerId: "run-two",
				onJobEvent,
			}).runOnce(),
		]);
		expect(
			startedJobTypes.filter(
				(jobType) => jobType === "generate_planned_cycles",
			),
		).toHaveLength(1);
		expect(first.acknowledged + second.acknowledged).toBe(
			first.claimed + second.claimed,
		);
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

	test("reclaims stale leases without consuming another attempt", async () => {
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
		expect(claimed[0]?.attempts).toBe(1);
		expect(claimed[0]?.claimToken).not.toBe("old-token");
	});

	test("final-attempt lease recovery terminalizes a subsequent failure without overflow", async () => {
		const { CycleWorker } = await import("./worker");
		await db.insert(cycleScheduleJob).values({
			id: createId(),
			workspaceId: ids.workspace,
			teamId: ids.team,
			jobType: "generate_planned_cycles",
			scheduledBoundary: now,
			status: "started",
			attempts: 2,
			maxAttempts: 2,
			availableAt: now,
			leaseExpiresAt: now,
			workerId: "expired-final-worker",
			claimToken: "expired-final-token",
			startedAt: new Date(now.getTime() - 1),
		});

		await new CycleWorker({
			clock,
			automationEnabled: true,
			workerId: "final-recovery-worker",
			maxAttempts: 1,
			generateHorizon: async () => {
				throw new Error("failure after final lease recovery");
			},
		}).runOnce();

		const [job] = await db.select().from(cycleScheduleJob);
		expect(job).toMatchObject({ status: "failed", attempts: 2 });
		expect(job?.leaseExpiresAt).toBeNull();
		expect(job?.claimToken).toBeNull();
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

	test("kill switch leaves generation and lifecycle work untouched", async () => {
		const { CycleWorker, enqueueGenerationJobs } = await import("./worker");
		await enqueueGenerationJobs({ clock });
		const [settings] = await db.select().from(teamCycleSettings);
		if (!settings) throw new Error("settings missing");
		const activeCycleId = createId();
		const plannedCycleId = createId();
		await db.insert(cycle).values([
			{
				id: activeCycleId,
				workspaceId: ids.workspace,
				teamId: ids.team,
				name: "Disabled active cycle",
				sequence: 1,
				state: "active",
				origin: "scheduled",
				scheduledBoundary: new Date(now.getTime() - 7 * 86_400_000),
				startDate: new Date(now.getTime() - 7 * 86_400_000),
				endDate: now,
			},
			{
				id: plannedCycleId,
				workspaceId: ids.workspace,
				teamId: ids.team,
				name: "Disabled planned cycle",
				sequence: 2,
				state: "planned",
				origin: "scheduled",
				scheduledBoundary: now,
				startDate: now,
				endDate: new Date(now.getTime() + 7 * 86_400_000),
			},
		]);
		await db.insert(cycleScheduleJob).values([
			{
				id: createId(),
				workspaceId: ids.workspace,
				teamId: ids.team,
				cycleId: activeCycleId,
				jobType: "complete_scheduled_cycle",
				scheduledBoundary: now,
				eventRevisionAt: settings.updatedAt,
				availableAt: now,
			},
			{
				id: createId(),
				workspaceId: ids.workspace,
				teamId: ids.team,
				cycleId: plannedCycleId,
				jobType: "start_scheduled_cycle",
				scheduledBoundary: now,
				eventRevisionAt: settings.updatedAt,
				availableAt: now,
			},
		]);

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
		expect(queued).toHaveLength(3);
		expect(queued.every((job) => job.attempts === 0)).toBeTrue();
		const states = await db
			.select({ id: cycle.id, state: cycle.state })
			.from(cycle);
		expect(states.find((row) => row.id === activeCycleId)?.state).toBe(
			"active",
		);
		expect(states.find((row) => row.id === plannedCycleId)?.state).toBe(
			"planned",
		);
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
			maxAttempts: 1,
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
			clock: { now: () => new Date(now.getTime() + 5 * 60 * 1000) },
			automationEnabled: true,
			workerId: "recovery-after-commit",
			maxAttempts: 1,
		});
		await recovered.runOnce();
		const [recoveredJob] = await db
			.select()
			.from(cycleScheduleJob)
			.where(eq(cycleScheduleJob.jobType, "generate_planned_cycles"));
		expect(recoveredJob).toMatchObject({ status: "succeeded", attempts: 1 });
		const recoveredCycles = (await db.select().from(cycle)).filter(
			(row) => row.origin === "scheduled",
		);
		expect(recoveredCycles).toHaveLength(3);
		expect(
			new Set(
				recoveredCycles.map((row) => row.scheduledBoundary?.toISOString()),
			).size,
		).toBe(recoveredCycles.length);
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
				if (calls === 1) {
					throw new Error(
						"job=cjldummy team=ctdummy user=550e8400-e29b-41d4-a716-446655440000 unexpected private failure",
					);
				}
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
		const rows = await db.select().from(cycleScheduleJob);
		expect(rows.map((row) => row.status).sort()).toEqual([
			"queued",
			"succeeded",
		]);
		const [queued] = rows.filter((row) => row.status === "queued");
		expect(queued?.lastErrorCode).toBe("TRANSIENT_RUNTIME_ERROR");
		expect(queued?.outcome).toBe("transient_error");
		expect(queued?.lastErrorSummary).toBe("Cycle generation failed");
		expect(JSON.stringify(queued)).not.toContain("cjldummy");
		expect(JSON.stringify(queued)).not.toContain("ctdummy");
		expect(JSON.stringify(queued)).not.toContain("550e8400");
		expect(JSON.stringify(queued)).not.toContain("private failure");
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

	test("enforces blocked lifecycle state and per-cycle event identity", async () => {
		const cycleId = createId();
		const boundary = new Date(now.getTime() + 86_400_000);
		const [settings] = await db
			.select({ updatedAt: teamCycleSettings.updatedAt })
			.from(teamCycleSettings)
			.where(eq(teamCycleSettings.teamId, ids.team));
		if (!settings) throw new Error("settings missing");
		await db.insert(cycle).values({
			id: cycleId,
			workspaceId: ids.workspace,
			teamId: ids.team,
			name: "Blocked lifecycle cycle",
			sequence: 1,
			state: "planned",
			origin: "scheduled",
			scheduledBoundary: boundary,
			startDate: boundary,
			endDate: new Date(boundary.getTime() + 86_400_000),
		});
		const base = {
			workspaceId: ids.workspace,
			teamId: ids.team,
			cycleId,
			eventRevisionAt: settings.updatedAt,
			availableAt: now,
		};
		await db.insert(cycleScheduleJob).values({
			...base,
			id: createId(),
			jobType: "start_scheduled_cycle",
			scheduledBoundary: boundary,
			status: "blocked",
			attempts: 0,
			startedAt: now,
		});

		const invalidBlockedRows: Array<{
			jobType: "start_scheduled_cycle" | "complete_scheduled_cycle";
			scheduledBoundary: Date;
			leaseExpiresAt?: Date;
			workerId?: string;
			claimToken?: string;
			startedAt?: Date | null;
			finishedAt?: Date;
		}> = [
			{
				jobType: "complete_scheduled_cycle",
				scheduledBoundary: new Date(boundary.getTime() + 1),
			},
			{
				jobType: "start_scheduled_cycle",
				scheduledBoundary: new Date(boundary.getTime() + 2),
				leaseExpiresAt: new Date(now.getTime() + 60_000),
			},
			{
				jobType: "start_scheduled_cycle",
				scheduledBoundary: new Date(boundary.getTime() + 3),
				workerId: "blocked-worker",
			},
			{
				jobType: "start_scheduled_cycle",
				scheduledBoundary: new Date(boundary.getTime() + 4),
				claimToken: "blocked-token",
			},
			{
				jobType: "start_scheduled_cycle",
				scheduledBoundary: new Date(boundary.getTime() + 5),
				startedAt: null,
			},
			{
				jobType: "start_scheduled_cycle",
				scheduledBoundary: new Date(boundary.getTime() + 6),
				finishedAt: now,
			},
		];
		for (const invalid of invalidBlockedRows) {
			await expectRejected(() =>
				db.insert(cycleScheduleJob).values({
					...base,
					id: createId(),
					status: "blocked",
					attempts: 0,
					startedAt: now,
					...invalid,
				}),
			);
		}

		const duplicateBoundary = new Date(boundary.getTime() + 10);
		await db.insert(cycleScheduleJob).values({
			...base,
			id: createId(),
			jobType: "start_scheduled_cycle",
			scheduledBoundary: duplicateBoundary,
		});
		await expectRejected(() =>
			db.insert(cycleScheduleJob).values({
				...base,
				id: createId(),
				jobType: "start_scheduled_cycle",
				scheduledBoundary: duplicateBoundary,
			}),
		);
	});

	test("claims notification events only at the exact due instant", async () => {
		const { claimGenerationJobs } = await import("./worker");
		const notificationCycleId = createId();
		const dueAt = new Date(now.getTime() + 60_000);
		const [settings] = await db
			.select({ updatedAt: teamCycleSettings.updatedAt })
			.from(teamCycleSettings)
			.where(eq(teamCycleSettings.teamId, ids.team));
		if (!settings) throw new Error("settings missing");
		await db.insert(cycle).values({
			id: notificationCycleId,
			workspaceId: ids.workspace,
			teamId: ids.team,
			name: "Notification cycle",
			sequence: 1,
			state: "active",
			origin: "scheduled",
			scheduledBoundary: new Date(now.getTime() + 86_400_000),
			startDate: now,
			endDate: new Date(now.getTime() + 86_400_000),
		});
		await db.insert(cycleScheduleJob).values({
			id: createId(),
			workspaceId: ids.workspace,
			teamId: ids.team,
			cycleId: notificationCycleId,
			jobType: "send_cycle_reminder",
			scheduledBoundary: new Date(now.getTime() + 86_400_000),
			eventRevisionAt: settings.updatedAt,
			availableAt: dueAt,
		});
		const early = await claimGenerationJobs({
			config: {
				workerId: "early-notification",
				clock: { now: () => new Date(dueAt.getTime() - 1) },
			},
		});
		expect(early).toHaveLength(0);
		const due = await claimGenerationJobs({
			config: { workerId: "due-notification", clock: { now: () => dueAt } },
		});
		expect(due).toHaveLength(1);
		expect(due[0]?.jobType).toBe("send_cycle_reminder");
	});

	test("notification workers do not duplicate a claimed poll and preserve retry backoff", async () => {
		const { CycleWorker, claimGenerationJobs } = await import("./worker");
		const notificationCycleId = createId();
		const [settings] = await db
			.select({ updatedAt: teamCycleSettings.updatedAt })
			.from(teamCycleSettings)
			.where(eq(teamCycleSettings.teamId, ids.team));
		if (!settings) throw new Error("settings missing");
		const boundary = new Date(now.getTime() + 86_400_000);
		await db.insert(cycle).values({
			id: notificationCycleId,
			workspaceId: ids.workspace,
			teamId: ids.team,
			name: "Retry notification cycle",
			sequence: 1,
			state: "active",
			origin: "scheduled",
			scheduledBoundary: boundary,
			startDate: now,
			endDate: boundary,
		});
		await db.insert(cycleScheduleJob).values({
			id: createId(),
			workspaceId: ids.workspace,
			teamId: ids.team,
			cycleId: notificationCycleId,
			jobType: "send_cycle_reminder",
			scheduledBoundary: boundary,
			eventRevisionAt: settings.updatedAt,
			availableAt: now,
			maxAttempts: 2,
		});
		const [first, second] = await Promise.all([
			claimGenerationJobs({
				config: { workerId: "notification-one", clock, batchSize: 1 },
			}),
			claimGenerationJobs({
				config: { workerId: "notification-two", clock, batchSize: 1 },
			}),
		]);
		expect(first.length + second.length).toBe(1);
		// The existing claim is intentionally still leased; recover it after the
		// lease expires and prove the persisted summary is redacted and requeued.
		const recovered = new CycleWorker({
			clock: { now: () => new Date(now.getTime() + 5 * 60_000 + 1) },
			automationEnabled: true,
			workerId: "notification-retry-recovery",
			batchSize: 1,
			maxAttempts: 2,
			processNotification: async () => {
				throw new Error("notification backend secret token");
			},
		});
		await recovered.runOnce();
		const rows = await db.select().from(cycleScheduleJob);
		const row = rows.find(
			(candidate) =>
				candidate.cycleId === notificationCycleId &&
				candidate.jobType === "send_cycle_reminder",
		);
		if (!row) throw new Error("notification job missing");
		expect(row.status).toBe("queued");
		expect(row.lastErrorSummary).not.toContain("secret token");
		expect(row.availableAt.getTime()).toBe(
			now.getTime() + 5 * 60_000 + 1 + 60_000,
		);
	});

	test("blocks a due start without consuming attempts and recovers after manual completion", async () => {
		const { CycleWorker } = await import("./worker");
		const sourceId = createId();
		const blockerId = createId();
		await db.insert(cycle).values([
			{
				id: blockerId,
				workspaceId: ids.workspace,
				teamId: ids.team,
				name: "Active blocker",
				sequence: 1,
				state: "active",
				startDate: new Date(now.getTime() - 7 * 86_400_000),
				endDate: now,
			},
			{
				id: sourceId,
				workspaceId: ids.workspace,
				teamId: ids.team,
				name: "Due scheduled cycle",
				sequence: 2,
				state: "planned",
				origin: "scheduled",
				scheduledBoundary: now,
				startDate: now,
				endDate: new Date(now.getTime() + 7 * 86_400_000),
			},
		]);
		await new CycleWorker({
			clock,
			automationEnabled: true,
			workerId: "blocked-start",
		}).runOnce();
		let [job] = await db
			.select()
			.from(cycleScheduleJob)
			.where(
				and(
					eq(cycleScheduleJob.cycleId, sourceId),
					eq(cycleScheduleJob.jobType, "start_scheduled_cycle"),
				),
			);
		expect(job).toMatchObject({
			jobType: "start_scheduled_cycle",
			status: "blocked",
			attempts: 0,
		});

		await db
			.update(cycle)
			.set({ state: "completed" })
			.where(eq(cycle.id, blockerId));
		await new CycleWorker({
			clock,
			automationEnabled: true,
			workerId: "recovered-start",
		}).runOnce();
		[job] = await db
			.select()
			.from(cycleScheduleJob)
			.where(
				and(
					eq(cycleScheduleJob.cycleId, sourceId),
					eq(cycleScheduleJob.jobType, "start_scheduled_cycle"),
				),
			);
		expect(job).toMatchObject({ status: "succeeded", outcome: "started" });
		const [startedCycle] = await db
			.select({ state: cycle.state })
			.from(cycle)
			.where(eq(cycle.id, sourceId));
		expect(startedCycle?.state).toBe("active");
	});

	test("processes same-boundary completion before the next scheduled start", async () => {
		const { CycleWorker } = await import("./worker");
		const sourceId = createId();
		const targetId = createId();
		const sourceStart = new Date(now.getTime() - 7 * 86_400_000);
		await db.insert(cycle).values([
			{
				id: sourceId,
				workspaceId: ids.workspace,
				teamId: ids.team,
				name: "Ending source",
				sequence: 1,
				state: "active",
				origin: "scheduled",
				scheduledBoundary: sourceStart,
				startDate: sourceStart,
				endDate: now,
			},
			{
				id: targetId,
				workspaceId: ids.workspace,
				teamId: ids.team,
				name: "Starting target",
				sequence: 2,
				state: "planned",
				origin: "scheduled",
				scheduledBoundary: now,
				startDate: now,
				endDate: new Date(now.getTime() + 7 * 86_400_000),
			},
		]);
		await new CycleWorker({
			clock,
			automationEnabled: true,
			workerId: "ordered-lifecycle",
		}).runOnce();
		const states = await db
			.select({ id: cycle.id, state: cycle.state })
			.from(cycle);
		expect(states.find((row) => row.id === sourceId)?.state).toBe("completed");
		expect(states.find((row) => row.id === targetId)?.state).toBe("active");
		const lifecycleJobs = (await db.select().from(cycleScheduleJob)).filter(
			(row) => row.cycleId === sourceId || row.cycleId === targetId,
		);
		expect(
			lifecycleJobs.find((row) => row.jobType === "complete_scheduled_cycle"),
		).toMatchObject({ status: "succeeded", outcome: "completed" });
		expect(
			lifecycleJobs.find((row) => row.jobType === "start_scheduled_cycle"),
		).toMatchObject({ status: "succeeded", outcome: "started" });
	});

	test("retries and exhausts transient lifecycle failures", async () => {
		const { CycleWorker } = await import("./worker");
		const sourceId = createId();
		await db.insert(cycle).values({
			id: sourceId,
			workspaceId: ids.workspace,
			teamId: ids.team,
			name: "Failing start",
			sequence: 1,
			state: "planned",
			origin: "scheduled",
			scheduledBoundary: now,
			startDate: now,
			endDate: new Date(now.getTime() + 7 * 86_400_000),
		});
		const failingStart = async () => {
			throw new Error("private lifecycle failure");
		};
		await new CycleWorker({
			clock,
			automationEnabled: true,
			workerId: "lifecycle-failure-one",
			maxAttempts: 2,
			processStartLifecycle: failingStart,
		}).runOnce();
		let [job] = await db
			.select()
			.from(cycleScheduleJob)
			.where(
				and(
					eq(cycleScheduleJob.cycleId, sourceId),
					eq(cycleScheduleJob.jobType, "start_scheduled_cycle"),
				),
			);
		expect(job).toMatchObject({ status: "queued", attempts: 1 });
		expect(job?.lastErrorSummary).not.toContain("private lifecycle failure");
		const retryClock = {
			now: () => new Date(now.getTime() + 60_000),
		};
		await new CycleWorker({
			clock: retryClock,
			automationEnabled: true,
			workerId: "lifecycle-failure-two",
			maxAttempts: 2,
			processStartLifecycle: failingStart,
		}).runOnce();
		[job] = await db
			.select()
			.from(cycleScheduleJob)
			.where(
				and(
					eq(cycleScheduleJob.cycleId, sourceId),
					eq(cycleScheduleJob.jobType, "start_scheduled_cycle"),
				),
			);
		expect(job).toMatchObject({ status: "failed", attempts: 2 });
	});

	test("publishes every affected issue after automatic completion", async () => {
		const { CycleWorker } = await import("./worker");
		const sourceId = createId();
		const sourceStart = new Date(now.getTime() - 7 * 86_400_000);
		await db.insert(cycle).values({
			id: sourceId,
			workspaceId: ids.workspace,
			teamId: ids.team,
			name: "Published completion source",
			sequence: 1,
			state: "active",
			origin: "scheduled",
			scheduledBoundary: sourceStart,
			startDate: sourceStart,
			endDate: now,
		});
		const [source] = await db
			.select()
			.from(cycle)
			.where(eq(cycle.id, sourceId));
		if (!source) throw new Error("source missing");
		const published: string[] = [];
		await new CycleWorker({
			clock,
			automationEnabled: true,
			workerId: "publication-success",
			processCompleteLifecycle: async () => ({
				status: "completed",
				completion: {
					ok: true,
					affectedIssueIds: ["affected-one", "affected-two"],
					counts: {
						canceled: 0,
						carriedOver: 2,
						completed: 0,
						returnedToBacklog: 0,
					},
					destinationCycleId: null,
					source: { ...source, state: "completed" },
					target: null,
				},
			}),
			publishIssueUpdate: async (issueId) => {
				published.push(issueId);
			},
		}).runOnce();
		expect(published).toEqual(["affected-one", "affected-two"]);
	});

	test("acknowledges completion before best-effort publication", async () => {
		const { CycleWorker } = await import("./worker");
		const sourceId = createId();
		const sourceStart = new Date(now.getTime() - 7 * 86_400_000);
		await db.insert(cycle).values({
			id: sourceId,
			workspaceId: ids.workspace,
			teamId: ids.team,
			name: "Publishing source",
			sequence: 1,
			state: "active",
			origin: "scheduled",
			scheduledBoundary: sourceStart,
			startDate: sourceStart,
			endDate: now,
		});
		const [source] = await db
			.select()
			.from(cycle)
			.where(eq(cycle.id, sourceId));
		if (!source) throw new Error("source missing");
		await new CycleWorker({
			clock,
			automationEnabled: true,
			workerId: "publication-failure",
			processCompleteLifecycle: async () => ({
				status: "completed",
				completion: {
					ok: true,
					affectedIssueIds: ["missing-issue"],
					counts: {
						canceled: 0,
						carriedOver: 0,
						completed: 0,
						returnedToBacklog: 0,
					},
					destinationCycleId: null,
					source: { ...source, state: "completed" },
					target: null,
				},
			}),
			publishIssueUpdate: async () => {
				throw new Error("publisher unavailable");
			},
		}).runOnce();
		const [job] = await db
			.select()
			.from(cycleScheduleJob)
			.where(eq(cycleScheduleJob.cycleId, sourceId));
		expect(job).toMatchObject({ status: "succeeded", outcome: "completed" });
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
