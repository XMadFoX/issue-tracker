import tailwindcss from "@tailwindcss/vite";
import { devtools } from "@tanstack/devtools-vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { nitro } from "nitro/vite";
import { defineConfig } from "vite";
import viteTsConfigPaths from "vite-tsconfig-paths";
import { env } from "./src/env";

const externals = ["pg"];

const config = defineConfig({
	resolve: {
		dedupe: ["@platejs/core", "platejs"],
		external: externals,
	},
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
		external: externals,
	},
});

export default config;
