import type {
	Attributes,
	Counter,
	Histogram,
	UpDownCounter,
} from "@opentelemetry/api";
import { metrics } from "@opentelemetry/api";

const meter = metrics.getMeter("prism-tracker-cycle-worker");
const counters = new Map<string, Counter>();
const histograms = new Map<string, Histogram>();
let activeLeases: UpDownCounter | undefined;
let dbReadiness: UpDownCounter | undefined;
let dbReadyState = false;

export type LifecycleMetricJobType =
	| "start_scheduled_cycle"
	| "complete_scheduled_cycle";

const LIFECYCLE_METRIC_OUTCOMES = new Set([
	"started",
	"already_started",
	"blocked",
	"completed",
	"already_completed",
	"not_found",
	"not_due",
	"obsolete_settings",
	"obsolete_cycle_state",
	"invalid_provenance",
	"invalid_job_identity",
	"generation_failed",
	"no_rollover_target",
	"completion_failed",
	"transient_error",
]);

export function lifecycleMetricAttributes(
	jobType: LifecycleMetricJobType,
	outcome?: string,
): Attributes {
	return {
		"job.type": jobType,
		...(outcome
			? {
					"job.outcome": LIFECYCLE_METRIC_OUTCOMES.has(outcome)
						? outcome
						: "other",
				}
			: {}),
	};
}

function counter(name: string, description: string): Counter {
	const existing = counters.get(name);
	if (existing) return existing;
	const created = meter.createCounter(name, { description, unit: "{job}" });
	counters.set(name, created);
	return created;
}

function histogram(name: string, description: string): Histogram {
	const existing = histograms.get(name);
	if (existing) return existing;
	const created = meter.createHistogram(name, { description, unit: "ms" });
	histograms.set(name, created);
	return created;
}

function leasesGauge(): UpDownCounter {
	activeLeases ??= meter.createUpDownCounter("cycles.worker.active_leases", {
		description: "Number of currently claimed cycle jobs",
		unit: "{lease}",
	});
	return activeLeases;
}

export function recordWorkerJobEvent(
	event:
		| "enqueued"
		| "claimed"
		| "succeeded"
		| "skipped_disabled"
		| "blocked"
		| "requeued"
		| "retried"
		| "failed"
		| "lease_recovered",
	attributes: Attributes = {},
): void {
	counter(`cycles.worker.jobs.${event}`, `Cycle worker jobs ${event}`).add(
		1,
		attributes,
	);
}

export function recordWorkerGenerationOutcome(
	outcome: "created" | "already_satisfied" | "conflict",
	attributes: Attributes = {},
): void {
	counter(
		`cycles.worker.generation.${outcome}`,
		`Cycle generation ${outcome} outcomes`,
	).add(1, attributes);
}

export function recordWorkerLatency(
	name: "poll" | "claim" | "process" | "queue_lag" | "oldest_queued_age",
	milliseconds: number,
	attributes: Attributes = {},
): void {
	histogram(
		`cycles.worker.${name}.duration`,
		`Cycle worker ${name} duration`,
	).record(milliseconds, attributes);
}

export function addWorkerActiveLease(delta: number): void {
	leasesGauge().add(delta);
}

export function setWorkerDbReady(ready: boolean): void {
	if (ready === dbReadyState) return;
	dbReadiness ??= meter.createUpDownCounter("cycles.worker.db_ready", {
		description: "Whether the cycle worker can reach PostgreSQL",
		unit: "{state}",
	});
	dbReadiness.add(ready ? 1 : -1);
	dbReadyState = ready;
}
