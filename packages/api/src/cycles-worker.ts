import { closeDb, env as databaseEnv } from "db";
import { env } from "./env";
import type { CycleWorker, WorkerJobEvent } from "./features/cycles/worker";
import { initOtel, shutdownOtel } from "./otel-instrumentation";

const LOGGABLE_JOB_OUTCOMES = new Set([
	"created",
	"already_satisfied",
	"disabled",
	"anchor_required",
	"team_not_found",
	"settings_missing",
	"invalid_timezone",
	"manual_cycle_conflict",
	"scheduled_cycle_conflict",
	"horizon_unreachable",
	"obsolete_settings",
	"obsolete_cycle_state",
	"no_recipients",
	"started",
	"already_started",
	"blocked",
	"completed",
	"already_completed",
	"not_found",
	"not_due",
	"invalid_provenance",
	"invalid_job_identity",
	"generation_failed",
	"no_rollover_target",
	"completion_failed",
	"transient_error",
]);

export function cycleWorkerJobLogContext(event: WorkerJobEvent) {
	return {
		phase: event.phase,
		jobType: event.jobType,
		attempt: event.attempt,
		outcome: event.outcome
			? LOGGABLE_JOB_OUTCOMES.has(event.outcome)
				? event.outcome
				: "unknown"
			: undefined,
	};
}

export function cycleWorkerRunErrorContext(_error: unknown) {
	return { error: "Cycle worker run failed" };
}

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
		onJobEvent: (event) =>
			cycleWorkerLogger.info(
				"cycle worker job",
				cycleWorkerJobLogContext(event),
			),
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
				cycleWorkerLogger.error(
					"cycle worker run failed",
					cycleWorkerRunErrorContext(error),
				);
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
