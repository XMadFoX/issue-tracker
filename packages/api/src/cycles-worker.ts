import { closeDb, env as databaseEnv } from "db";
import { redactErrorSummary } from "./cycles-worker-errors";
import { env } from "./env";
import type { CycleWorker } from "./features/cycles/worker";
import { initOtel, shutdownOtel } from "./otel-instrumentation";

export async function runCycleWorker(): Promise<void> {
	if (
		process.env.ENV_TYPE === "serverless" ||
		databaseEnv.ENV_TYPE !== "server"
	) {
		throw new Error(
			"Cycle worker requires a direct stateful PostgreSQL connection",
		);
	}

	initOtel();
	const [
		{ CycleWorker, workerHealthResponse, workerReadinessResponse },
		{ cycleWorkerLogger },
	] = await Promise.all([
		import("./features/cycles/worker"),
		import("./cycles-worker-logger"),
	]);
	const worker: CycleWorker = new CycleWorker({
		onJobEvent: (event) => cycleWorkerLogger.info("cycle worker job", event),
	});
	const once = process.argv.includes("--once");
	let stopping = false;
	let healthServer: { stop: () => void } | undefined;
	const stop = (): void => {
		if (stopping) return;
		stopping = true;
		worker.stop();
		healthServer?.stop();
		cycleWorkerLogger.info("cycle worker stopping");
	};

	try {
		healthServer = Bun.serve({
			port: env.CYCLES_WORKER_HEALTH_PORT,
			fetch(request) {
				const path = new URL(request.url).pathname;
				if (path === "/healthz") return workerHealthResponse(worker);
				if (path === "/readyz") return workerReadinessResponse(worker);
				return new Response("Not found", { status: 404 });
			},
		});
		process.on("SIGTERM", stop);
		process.on("SIGINT", stop);

		while (!stopping) {
			if (once) {
				await worker.runOnce();
				break;
			}
			const startedAt = performance.now();
			try {
				const result = await worker.runOnce();
				cycleWorkerLogger.info("cycle worker run completed", {
					enqueued: result.enqueue.enqueued,
					claimed: result.claimed,
					acknowledged: result.acknowledged,
					durationMs: Math.round(performance.now() - startedAt),
				});
			} catch (error: unknown) {
				cycleWorkerLogger.error("cycle worker run failed", {
					error: redactErrorSummary(error),
				});
			}
			if (!stopping) await Bun.sleep(env.CYCLES_WORKER_POLL_INTERVAL_MS);
		}
	} finally {
		stop();
		await closeDb();
		await shutdownOtel();
	}
}

if (import.meta.main) {
	await runCycleWorker();
}
