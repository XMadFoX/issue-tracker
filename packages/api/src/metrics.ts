import type {
	Attributes,
	Counter,
	Histogram,
	UpDownCounter,
} from "@opentelemetry/api";
import { metrics } from "@opentelemetry/api";

const getMeter = () => metrics.getMeter("prism-tracker-api");

let httpRequestCount: Counter | undefined;
let httpRequestDuration: Histogram | undefined;
let httpRequestErrors: Counter | undefined;
let httpActiveRequests: UpDownCounter | undefined;
let natsPublishCount: Counter | undefined;
let natsPublishDuration: Histogram | undefined;
let natsPublishBytes: Histogram | undefined;
let natsPublishErrors: Counter | undefined;
let natsActiveSubscriptions: UpDownCounter | undefined;
let natsReceivedMessages: Counter | undefined;
let natsParseErrors: Counter | undefined;
let natsConnectionAttempts: Counter | undefined;
let natsConnectionErrors: Counter | undefined;
let runtimeMetricsRegistered = false;

const getHttpRequestCount = () => {
	httpRequestCount ??= getMeter().createCounter("http.server.request.count", {
		description: "Number of HTTP requests received",
		unit: "{request}",
	});
	return httpRequestCount;
};

const getHttpRequestDuration = () => {
	httpRequestDuration ??= getMeter().createHistogram(
		"http.server.request.duration",
		{
			description: "HTTP request duration",
			unit: "ms",
		},
	);
	return httpRequestDuration;
};

const getHttpRequestErrors = () => {
	httpRequestErrors ??= getMeter().createCounter("http.server.request.errors", {
		description: "Number of HTTP requests that completed with an error status",
		unit: "{error}",
	});
	return httpRequestErrors;
};

const getHttpActiveRequests = () => {
	httpActiveRequests ??= getMeter().createUpDownCounter(
		"http.server.active_requests",
		{
			description: "Number of active HTTP requests",
			unit: "{request}",
		},
	);
	return httpActiveRequests;
};

const getNatsPublishCount = () => {
	natsPublishCount ??= getMeter().createCounter(
		"messaging.nats.publish.count",
		{
			description: "Number of NATS messages published",
			unit: "{message}",
		},
	);
	return natsPublishCount;
};

const getNatsPublishDuration = () => {
	natsPublishDuration ??= getMeter().createHistogram(
		"messaging.nats.publish.duration",
		{
			description: "NATS publish duration",
			unit: "ms",
		},
	);
	return natsPublishDuration;
};

const getNatsPublishBytes = () => {
	natsPublishBytes ??= getMeter().createHistogram(
		"messaging.nats.publish.message.size",
		{
			description: "Serialized NATS publish payload size",
			unit: "By",
		},
	);
	return natsPublishBytes;
};

const getNatsPublishErrors = () => {
	natsPublishErrors ??= getMeter().createCounter(
		"messaging.nats.publish.errors",
		{
			description: "Number of failed NATS publishes",
			unit: "{error}",
		},
	);
	return natsPublishErrors;
};

const getNatsActiveSubscriptions = () => {
	natsActiveSubscriptions ??= getMeter().createUpDownCounter(
		"messaging.nats.subscriptions.active",
		{
			description: "Number of active NATS subscriptions",
			unit: "{subscription}",
		},
	);
	return natsActiveSubscriptions;
};

const getNatsReceivedMessages = () => {
	natsReceivedMessages ??= getMeter().createCounter(
		"messaging.nats.receive.count",
		{
			description: "Number of NATS messages received",
			unit: "{message}",
		},
	);
	return natsReceivedMessages;
};

const getNatsParseErrors = () => {
	natsParseErrors ??= getMeter().createCounter(
		"messaging.nats.receive.parse_errors",
		{
			description: "Number of NATS messages that failed JSON parsing",
			unit: "{error}",
		},
	);
	return natsParseErrors;
};

const getNatsConnectionAttempts = () => {
	natsConnectionAttempts ??= getMeter().createCounter(
		"messaging.nats.connection.attempts",
		{
			description: "Number of NATS connection attempts",
			unit: "{attempt}",
		},
	);
	return natsConnectionAttempts;
};

const getNatsConnectionErrors = () => {
	natsConnectionErrors ??= getMeter().createCounter(
		"messaging.nats.connection.errors",
		{
			description: "Number of failed NATS connection attempts",
			unit: "{error}",
		},
	);
	return natsConnectionErrors;
};

export const addHttpActiveRequest = (delta: number, attributes: Attributes) => {
	getHttpActiveRequests().add(delta, attributes);
};

export const recordHttpRequest = (
	durationMs: number,
	status: number,
	attributes: Attributes,
) => {
	getHttpRequestCount().add(1, attributes);
	getHttpRequestDuration().record(durationMs, attributes);

	if (status >= 500) {
		getHttpRequestErrors().add(1, attributes);
	}
};

export const recordNatsConnectionAttempt = () => {
	getNatsConnectionAttempts().add(1, { "messaging.system": "nats" });
};

export const recordNatsConnectionError = () => {
	getNatsConnectionErrors().add(1, { "messaging.system": "nats" });
};

export const recordNatsPublish = (
	durationMs: number,
	payloadBytes: number,
	attributes: Attributes,
) => {
	getNatsPublishCount().add(1, attributes);
	getNatsPublishBytes().record(payloadBytes, attributes);
	getNatsPublishDuration().record(durationMs, attributes);
};

export const recordNatsPublishError = (
	durationMs: number,
	attributes: Attributes,
) => {
	getNatsPublishErrors().add(1, attributes);
	getNatsPublishDuration().record(durationMs, attributes);
};

export const addNatsActiveSubscription = (
	delta: number,
	attributes: Attributes,
) => {
	getNatsActiveSubscriptions().add(delta, attributes);
};

export const recordNatsReceivedMessage = (attributes: Attributes) => {
	getNatsReceivedMessages().add(1, attributes);
};

export const recordNatsParseError = (attributes: Attributes) => {
	getNatsParseErrors().add(1, attributes);
};

export const registerRuntimeMetrics = () => {
	if (runtimeMetricsRegistered) {
		return;
	}

	runtimeMetricsRegistered = true;
	let eventLoopDelayMs = 0;

	const measureEventLoopDelay = () => {
		const start = performance.now();
		setTimeout(() => {
			eventLoopDelayMs = Math.max(0, performance.now() - start);
			measureEventLoopDelay();
		}, 0).unref?.();
	};

	measureEventLoopDelay();

	const meter = getMeter();
	const runtimeMemoryRss = meter.createObservableGauge(
		"process.runtime.memory.rss",
		{
			description: "Resident set size memory used by the process",
			unit: "By",
		},
	);
	const runtimeMemoryHeapUsed = meter.createObservableGauge(
		"process.runtime.memory.heap.used",
		{
			description: "Heap memory used by the process",
			unit: "By",
		},
	);
	const runtimeMemoryHeapTotal = meter.createObservableGauge(
		"process.runtime.memory.heap.total",
		{
			description: "Total heap memory allocated by the process",
			unit: "By",
		},
	);
	const runtimeEventLoopDelay = meter.createObservableGauge(
		"process.runtime.event_loop.delay",
		{
			description: "Observed event loop delay",
			unit: "ms",
		},
	);
	const runtimeUptime = meter.createObservableGauge("process.uptime", {
		description: "Process uptime",
		unit: "s",
	});
	const runtimeCpuUser = meter.createObservableGauge("process.cpu.time.user", {
		description: "User CPU time used by the process",
		unit: "s",
	});
	const runtimeCpuSystem = meter.createObservableGauge(
		"process.cpu.time.system",
		{
			description: "System CPU time used by the process",
			unit: "s",
		},
	);

	meter.addBatchObservableCallback(
		(observerResult) => {
			const memory = process.memoryUsage();
			const cpu = process.cpuUsage();

			observerResult.observe(runtimeMemoryRss, memory.rss);
			observerResult.observe(runtimeMemoryHeapUsed, memory.heapUsed);
			observerResult.observe(runtimeMemoryHeapTotal, memory.heapTotal);
			observerResult.observe(runtimeEventLoopDelay, eventLoopDelayMs);
			observerResult.observe(runtimeUptime, process.uptime());
			observerResult.observe(runtimeCpuUser, cpu.user / 1_000_000);
			observerResult.observe(runtimeCpuSystem, cpu.system / 1_000_000);
		},
		[
			runtimeMemoryRss,
			runtimeMemoryHeapUsed,
			runtimeMemoryHeapTotal,
			runtimeEventLoopDelay,
			runtimeUptime,
			runtimeCpuUser,
			runtimeCpuSystem,
		],
	);
};
