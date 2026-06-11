import { opentelemetry } from "@elysiajs/opentelemetry";
import { context, propagation, trace } from "@opentelemetry/api";
import { OTLPLogExporter } from "@opentelemetry/exporter-logs-otlp-grpc";
import { OTLPMetricExporter } from "@opentelemetry/exporter-metrics-otlp-grpc";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-grpc";
import { PgInstrumentation } from "@opentelemetry/instrumentation-pg";
import { BatchLogRecordProcessor } from "@opentelemetry/sdk-logs";
import { PeriodicExportingMetricReader } from "@opentelemetry/sdk-metrics";
import { NodeSDK } from "@opentelemetry/sdk-node";
import { BatchSpanProcessor } from "@opentelemetry/sdk-trace-node";
import { ORPCInstrumentation } from "@orpc/otel";
import { setGlobalOtelConfig } from "@orpc/shared";
import { env } from "./env";
import { registerRuntimeMetrics } from "./metrics";

let sdk: NodeSDK | undefined;

const createSdk = () => {
	const url = env.OTEL_EXPORTER_OTLP_ENDPOINT;

	return new NodeSDK({
		serviceName: "prism-tracker-api",
		spanProcessors: [new BatchSpanProcessor(new OTLPTraceExporter({ url }))],
		logRecordProcessors: [
			new BatchLogRecordProcessor(new OTLPLogExporter({ url })),
		],
		metricReader: new PeriodicExportingMetricReader({
			exporter: new OTLPMetricExporter({ url }),
		}),
		instrumentations: [new ORPCInstrumentation(), new PgInstrumentation()],
	});
};

export const initOtel = () => {
	if (sdk) {
		return;
	}

	setGlobalOtelConfig({
		tracer: trace.getTracer("@orpc/shared"),
		trace,
		context,
		propagation,
	});

	sdk = createSdk();
	sdk.start();
	registerRuntimeMetrics();
};

export const shutdownOtel = async () => {
	if (!sdk) {
		return;
	}

	await sdk.shutdown();
	sdk = undefined;
};

// elysias gonna attach to existing otel sdk instance started by initOtel
export const instrumentation = opentelemetry();
