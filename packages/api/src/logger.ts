import { configure, getConsoleSink } from "@logtape/logtape";
import { getOpenTelemetrySink } from "@logtape/otel";
import { prettyFormatter } from "@logtape/pretty";

await configure({
	sinks: {
		otel: getOpenTelemetrySink({
			serviceName: "prism-tracker-api",
			otlpExporterConfig: {
				url: env.OTEL_EXPORTER_OTLP_ENDPOINT,
			},
		}),
		console: getConsoleSink({ formatter: prettyFormatter }),
	},
	loggers: [
		{ category: [], sinks: ["otel", "console"], lowestLevel: env.LOG_LEVEL },
	],
});

import { getLogger } from "@logtape/logtape";
import { env } from "./env";

const logger = getLogger(["prism-tracker", "api"]);

export { logger };
