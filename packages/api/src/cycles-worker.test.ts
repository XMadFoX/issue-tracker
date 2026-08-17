import {
	afterAll,
	beforeAll,
	describe,
	expect,
	setDefaultTimeout,
	test,
} from "bun:test";
import path from "node:path";
import { createId } from "@paralleldrive/cuid2";
import { eq } from "drizzle-orm";
import setupDb from "./utils/prepare-tests";

let teardown: Awaited<ReturnType<typeof setupDb>>;
const workerEntrypoint = path.join(import.meta.dir, "cycles-worker.ts");

setDefaultTimeout(60_000);

beforeAll(async () => {
	teardown = await setupDb();
}, 300_000);

afterAll(async () => {
	await teardown?.();
}, 60_000);

function workerEnv(port: number, overrides: Record<string, string> = {}) {
	return {
		...process.env,
		ENV_TYPE: "server",
		CYCLES_WORKER_HEALTH_PORT: String(port),
		CYCLES_WORKER_POLL_INTERVAL_MS: "50",
		...overrides,
	};
}

async function waitForStatus(
	port: number,
	pathName: "/healthz" | "/readyz",
	status: number,
): Promise<Response> {
	const deadline = Date.now() + 10_000;
	while (Date.now() < deadline) {
		try {
			const response = await fetch(`http://127.0.0.1:${port}${pathName}`);
			if (response.status === status) return response;
		} catch {
			// The entrypoint may still be starting its health server.
		}
		await Bun.sleep(50);
	}
	throw new Error(`worker endpoint ${pathName} did not reach HTTP ${status}`);
}

function spawnWorker(
	port: number,
	overrides: Record<string, string> = {},
	once = false,
) {
	return Bun.spawn(["bun", workerEntrypoint, ...(once ? ["--once"] : [])], {
		cwd: path.join(import.meta.dir, ".."),
		env: workerEnv(port, overrides),
		stdout: "pipe",
		stderr: "pipe",
	});
}

describe("real cycle worker entrypoint", () => {
	test("--once configures standalone logging once and closes its database pool", async () => {
		const port = 42000 + (process.pid % 1000);
		const child = spawnWorker(
			port,
			{ CYCLES_AUTOMATION_ENABLED: "false" },
			true,
		);
		const [exitCode, stderr] = await Promise.all([
			child.exited,
			new Response(child.stderr).text(),
		]);
		expect(stderr).not.toContain("ConfigureError");
		expect(stderr).not.toContain("Already configured");
		expect(exitCode).toBe(0);
	});

	test("SIGTERM and SIGINT drain active work before closing resources", async () => {
		const { db } = await import("db");
		const { cycleScheduleJob } = await import(
			"db/features/tracker/cycle-schedule-jobs.schema"
		);
		const { teamCycleSettings } = await import(
			"db/features/tracker/team-cycle-settings.schema"
		);
		const { team, workspace } = await import(
			"db/features/tracker/tracker.schema"
		);

		const signals: ("SIGTERM" | "SIGINT")[] = ["SIGTERM", "SIGINT"];
		for (const [index, signal] of signals.entries()) {
			const workspaceId = createId();
			const teamId = createId();
			const jobId = createId();
			await db.insert(workspace).values({
				id: workspaceId,
				name: `Signal Workspace ${signal}`,
				slug: `signal-${workspaceId}`,
				timezone: "UTC",
			});
			await db.insert(team).values({
				id: teamId,
				workspaceId,
				name: `Signal Team ${signal}`,
				key: `S${teamId.slice(0, 3)}`,
				privacy: "public",
			});
			await db.insert(teamCycleSettings).values({
				teamId,
				cadenceEnabled: false,
				cadenceDays: 7,
				anchorDate: new Date("2026-07-01T10:00:00.000Z"),
				planningHorizon: 1,
				endBehavior: "automatic",
				gracePeriodMinutes: 0,
				defaultRolloverPolicy: "carry_over",
				reminderLeadMinutes: 60,
				updatedBy: null,
			});
			await db.insert(cycleScheduleJob).values({
				id: jobId,
				workspaceId,
				teamId,
				jobType: "generate_planned_cycles",
				scheduledBoundary: new Date(0),
				availableAt: new Date(0),
			});

			let releaseTeamLock!: () => void;
			const release = new Promise<void>((resolve) => {
				releaseTeamLock = resolve;
			});
			let teamLockAcquired!: () => void;
			const lockAcquired = new Promise<void>((resolve) => {
				teamLockAcquired = resolve;
			});
			const lockTransaction = db.transaction(async (tx) => {
				await tx
					.select({ id: team.id })
					.from(team)
					.where(eq(team.id, teamId))
					.for("update");
				teamLockAcquired();
				await release;
			});
			await lockAcquired;

			const port = 44000 + (process.pid % 1000) + index;
			const child = spawnWorker(port, { CYCLES_AUTOMATION_ENABLED: "true" });
			try {
				const deadline = Date.now() + 10_000;
				while (Date.now() < deadline) {
					const [job] = await db
						.select({ status: cycleScheduleJob.status })
						.from(cycleScheduleJob)
						.where(eq(cycleScheduleJob.id, jobId));
					if (job?.status === "started") break;
					await Bun.sleep(50);
				}
				const [startedJob] = await db
					.select({ status: cycleScheduleJob.status })
					.from(cycleScheduleJob)
					.where(eq(cycleScheduleJob.id, jobId));
				expect(startedJob?.status).toBe("started");

				child.kill(signal);
				const exitedWhileBlocked = await Promise.race([
					child.exited.then(() => true),
					Bun.sleep(100).then(() => false),
				]);
				expect(exitedWhileBlocked).toBe(false);
			} finally {
				releaseTeamLock();
				await lockTransaction;
			}

			expect(await child.exited).toBe(0);
			const [completedJob] = await db
				.select({ status: cycleScheduleJob.status })
				.from(cycleScheduleJob)
				.where(eq(cycleScheduleJob.id, jobId));
			expect(completedJob?.status).toBe("succeeded");
		}
	});

	test("health and readiness endpoints expose ready and database-failed states", async () => {
		const port = 43000 + (process.pid % 1000);
		const child = spawnWorker(port, { CYCLES_AUTOMATION_ENABLED: "true" });
		try {
			const health = await waitForStatus(port, "/healthz", 200);
			expect((await health.json()) as { status: string }).toMatchObject({
				status: "ok",
			});
			const ready = await waitForStatus(port, "/readyz", 200);
			expect((await ready.json()) as { ready: boolean }).toMatchObject({
				ready: true,
			});
		} finally {
			child.kill("SIGTERM");
			await child.exited;
		}

		const failedPort = port + 1;
		const failed = spawnWorker(failedPort, {
			CYCLES_AUTOMATION_ENABLED: "true",
			DATABASE_URL: "postgres://postgres:postgres@127.0.0.1:1/issue_tracker",
		});
		try {
			const failedHealth = await waitForStatus(failedPort, "/healthz", 200);
			expect((await failedHealth.json()) as { status: string }).toMatchObject({
				status: "ok",
			});
			const failedReady = await waitForStatus(failedPort, "/readyz", 503);
			expect((await failedReady.json()) as { ready: boolean }).toMatchObject({
				ready: false,
			});
		} finally {
			failed.kill("SIGINT");
			await failed.exited;
		}
	});
});
