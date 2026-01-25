import tailwindcss from "@tailwindcss/vite";
import { devtools } from "@tanstack/devtools-vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { nitro } from "nitro/vite";
import { defineConfig } from "vite";
import viteTsConfigPaths from "vite-tsconfig-paths";
import { env } from "./src/env";

const config = defineConfig({
	plugins: [
		devtools(),
		nitro({
			preset: env.BUILD_NITRO_PRESET,
		}),
		// this is the plugin that enables path aliases
		viteTsConfigPaths({
			projects: [
				"./tsconfig.json",
				"../../packages/ui/tsconfig.json",
				"../../packages/blocks/tsconfig.json",
				"../../packages/api/tsconfig.json",
			],
		}),
		tailwindcss(),
		tanstackStart(),
		viteReact(),
	],
	ssr: {
		external: [
			"@opentelemetry/api",
			"@opentelemetry/sdk-node",
			"@opentelemetry/resources",
			"@opentelemetry/instrumentation",
			"@opentelemetry/sdk-trace-node",
			"@opentelemetry/sdk-logs",
			"@opentelemetry/semantic-conventions",
			"@opentelemetry/exporter-trace-otlp-proto",
			"@opentelemetry/exporter-logs-otlp-http",
			"@opentelemetry/exporter-trace-otlp-grpc",
			"@opentelemetry/exporter-logs-otlp-grpc",
			"@opentelemetry/instrumentation-http",
			"@opentelemetry/instrumentation-pg",
			"@opentelemetry/instrumentation-pino",
			"@prisma/client",
			"pino",
			"pino-pretty",
			"pg",
		],
	},
});

export default config;
