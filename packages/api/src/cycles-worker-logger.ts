import { configure, getConsoleSink, getLogger } from "@logtape/logtape";
import { getOpenTelemetrySink } from "@logtape/otel";
import { prettyFormatter } from "@logtape/pretty";
import { env } from "./env";

await configure({
	sinks: {
		otel: getOpenTelemetrySink({
			serviceName: "prism-tracker-cycle-worker",
			otlpExporterConfig: { url: env.OTEL_EXPORTER_OTLP_ENDPOINT },
		}),
		console: getConsoleSink({ formatter: prettyFormatter }),
	},
	loggers: [
		{
			category: [],
			sinks: ["otel", "console"],
			lowestLevel: env.LOG_LEVEL,
		},
	],
});

export const cycleWorkerLogger = getLogger(["prism-tracker", "cycle-worker"]);
