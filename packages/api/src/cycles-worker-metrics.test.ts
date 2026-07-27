import {
	afterAll,
	beforeAll,
	describe,
	expect,
	setDefaultTimeout,
	test,
} from "bun:test";
import { metrics } from "@opentelemetry/api";
import {
	AggregationTemporality,
	DataPointType,
	InMemoryMetricExporter,
	MeterProvider,
	PeriodicExportingMetricReader,
} from "@opentelemetry/sdk-metrics";
import { createId } from "@paralleldrive/cuid2";
import setupDb from "./utils/prepare-tests";

setDefaultTimeout(30_000);

const exporter = new InMemoryMetricExporter(AggregationTemporality.CUMULATIVE);
const reader = new PeriodicExportingMetricReader({
	exporter,
	exportIntervalMillis: 10,
});
const provider = new MeterProvider({ readers: [reader] });
metrics.setGlobalMeterProvider(provider);

let teardown: Awaited<ReturnType<typeof setupDb>>;
const workspaceId = createId();
const teamId = createId();
const now = new Date("2026-07-15T10:00:00.000Z");

const exportedMetrics = () =>
	exporter
		.getMetrics()
		.flatMap((resource) => resource.scopeMetrics)
		.flatMap((scope) => scope.metrics);

const metricValue = (name: string): number | undefined => {
	const metric = exportedMetrics().findLast(
		(candidate) => candidate.descriptor.name === name,
	);
	if (
		!metric ||
		(metric.dataPointType !== DataPointType.SUM &&
			metric.dataPointType !== DataPointType.GAUGE)
	)
		return undefined;
	return metric.dataPoints[0]?.value;
};

beforeAll(async () => {
	teardown = await setupDb();
	const { db } = await import("db");
	const { team, workspace } = await import(
		"db/features/tracker/tracker.schema"
	);
	const { cycleScheduleJob } = await import(
		"db/features/tracker/cycle-schedule-jobs.schema"
	);
	await db.insert(workspace).values({
		id: workspaceId,
		name: "Metric Workspace",
		slug: `metrics-${workspaceId}`,
		timezone: "UTC",
	});
	await db.insert(team).values({
		id: teamId,
		workspaceId,
		name: "Metric Team",
		key: `M${teamId.slice(0, 3)}`,
		privacy: "public",
	});
	await db.insert(cycleScheduleJob).values({
		id: createId(),
		workspaceId,
		teamId,
		jobType: "generate_planned_cycles",
		scheduledBoundary: now,
		availableAt: now,
	});
});

afterAll(async () => {
	await teardown?.();
	await provider.shutdown();
});

describe("cycle worker metric sink", () => {
	test("exports job outcomes, queue age, readiness, and active leases", async () => {
		const { CycleWorker } = await import("./features/cycles/worker");
		let current = now;
		let attempts = 0;
		const worker = new CycleWorker({
			clock: { now: () => current },
			automationEnabled: true,
			workerId: "metric-sink-worker",
			maxAttempts: 2,
			generateHorizon: async () => {
				attempts += 1;
				if (attempts === 1) throw new Error("temporary failure");
				return {
					status: "manual_cycle_conflict",
					cycleId: "manual-cycle",
					scheduledBoundary: now,
				};
			},
		});
		await worker.runOnce();
		current = new Date(now.getTime() + 60_000);
		await worker.runOnce();
		expect(worker.getHealth().activeLeases).toBe(0);
		await provider.forceFlush();

		// The first transient failure is requeued; the typed conflict is terminal.
		expect(metricValue("cycles.worker.jobs.retried")).toBe(1);
		expect(metricValue("cycles.worker.jobs.failed")).toBe(1);
		expect(metricValue("cycles.worker.generation.conflict")).toBe(1);
		expect(metricValue("cycles.worker.active_leases")).toBe(0);
		expect(metricValue("cycles.worker.db_ready")).toBe(1);

		const { setWorkerDbReady } = await import("./cycles-worker-metrics");
		setWorkerDbReady(false);
		await provider.forceFlush();
		expect(metricValue("cycles.worker.db_ready")).toBe(0);
		setWorkerDbReady(true);
	});
});
