import { describe, expect, test } from "bun:test";
import {
	CycleWorker,
	isDirectPostgresWorker,
	isWorkerReady,
	workerHealthResponse,
	workerReadinessResponse,
} from "./worker";

const now = new Date("2026-07-15T10:00:00.000Z");

describe("cycle worker runtime health", () => {
	test("readiness requires the effective automation gate and fresh poll", () => {
		const fresh = new Date(now.getTime() - 30_000);
		const health = {
			dbReady: true,
			lastSuccessfulPollAt: fresh,
			lastSuccessfulClaimAt: fresh,
			activeLeases: 0,
			stopping: false,
		};
		expect(isWorkerReady(health, false, now)).toBe(false);
		expect(isWorkerReady({ ...health, dbReady: false }, true, now)).toBe(false);
		expect(isWorkerReady({ ...health, stopping: true }, true, now)).toBe(false);
		expect(
			isWorkerReady(
				{ ...health, lastSuccessfulPollAt: new Date(now.getTime() - 121_000) },
				true,
				now,
			),
		).toBe(false);
		expect(isWorkerReady(health, true, now)).toBe(true);
	});

	test("health is liveness and readiness reports disabled/stopping states", async () => {
		const worker = new CycleWorker({ automationEnabled: false });
		expect(workerHealthResponse(worker).status).toBe(200);
		expect(workerReadinessResponse(worker).status).toBe(503);
		worker.stop();
		expect(workerReadinessResponse(worker).status).toBe(503);
	});

	test("worker runtime boundary accepts only direct PostgreSQL mode", () => {
		const previous = process.env.ENV_TYPE;
		process.env.ENV_TYPE = "server";
		expect(isDirectPostgresWorker()).toBe(true);
		process.env.ENV_TYPE = "serverless";
		expect(isDirectPostgresWorker()).toBe(false);
		if (previous === undefined) delete process.env.ENV_TYPE;
		else process.env.ENV_TYPE = previous;
	});
});
