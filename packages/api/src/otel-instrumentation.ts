import { opentelemetry } from "@elysiajs/opentelemetry";
import { context, propagation, trace } from "@opentelemetry/api";
import { OTLPLogExporter } from "@opentelemetry/exporter-logs-otlp-grpc";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-grpc";
import { PgInstrumentation } from "@opentelemetry/instrumentation-pg";
import { PinoInstrumentation } from "@opentelemetry/instrumentation-pino";
import { BatchLogRecordProcessor } from "@opentelemetry/sdk-logs";
import { BatchSpanProcessor } from "@opentelemetry/sdk-trace-node";
import { ORPCInstrumentation } from "@orpc/otel";
import { setGlobalOtelConfig } from "@orpc/shared";

setGlobalOtelConfig({
	tracer: trace.getTracer("@orpc/shared"),
	trace,
	context,
	propagation,
});

export const instrumentation = opentelemetry({
	BatchSpanProcessor,
	spanProcessor: new BatchSpanProcessor(new OTLPTraceExporter()),
	logRecordProcessors: [new BatchLogRecordProcessor(new OTLPLogExporter())],
	instrumentations: [
		new ORPCInstrumentation(),
		new PinoInstrumentation({}),
		new PgInstrumentation(),
	],
});
