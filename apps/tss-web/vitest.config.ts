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
	],
	resolve: {
		dedupe: ["react", "react-dom"],
	},
});
