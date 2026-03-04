import { opentelemetry } from "@elysiajs/opentelemetry";
import { context, propagation, trace } from "@opentelemetry/api";
import { OTLPLogExporter } from "@opentelemetry/exporter-logs-otlp-grpc";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-grpc";
import { PgInstrumentation } from "@opentelemetry/instrumentation-pg";
import { BatchLogRecordProcessor } from "@opentelemetry/sdk-logs";
import { BatchSpanProcessor } from "@opentelemetry/sdk-trace-node";
import { ORPCInstrumentation } from "@orpc/otel";
import { setGlobalOtelConfig } from "@orpc/shared";
import { env } from "./env";

setGlobalOtelConfig({
	tracer: trace.getTracer("@orpc/shared"),
	trace,
	context,
	propagation,
});

const url = env.OTEL_EXPORTER_OTLP_ENDPOINT;

export const instrumentation = opentelemetry({
	BatchSpanProcessor,
	spanProcessor: new BatchSpanProcessor(new OTLPTraceExporter({ url })),
	logRecordProcessors: [
		new BatchLogRecordProcessor(new OTLPLogExporter({ url })),
	],
	instrumentations: [new ORPCInstrumentation(), new PgInstrumentation()],
});
