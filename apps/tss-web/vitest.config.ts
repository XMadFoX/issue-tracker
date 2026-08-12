import tailwindcss from "@tailwindcss/vite";
import viteReact from "@vitejs/plugin-react";
import viteTsConfigPaths from "vite-tsconfig-paths";
import { defineConfig } from "vitest/config";

export default defineConfig({
	plugins: [
		viteTsConfigPaths({
			projects: [
				"./tsconfig.json",
				"../../packages/ui/tsconfig.json",
				"../../packages/blocks/tsconfig.json",
				"../../packages/api/tsconfig.json",
			],
		}),
		tailwindcss(),
		viteReact(),
	],
	test: {
		environment: "jsdom",
		include: [
			"src/**/*.{test,spec}.{ts,tsx}",
			"tests/unit/**/*.{test,spec}.{ts,tsx}",
		],
		passWithNoTests: true,
		reporters: [
			"default",
			["allure-vitest/reporter", { resultsDir: "allure-results" }],
		],
		setupFiles: ["./tests/unit/setup.ts", "allure-vitest/setup"],
	},
});
