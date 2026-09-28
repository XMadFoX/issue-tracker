import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { defineConfig } from "vitest/config";

const dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(dirname, "../../.env") });

export default defineConfig({
	test: {
		testTimeout: 30000,
		hookTimeout: 30000,
		fileParallelism: false,
		include: ["tests/**/*.spec.ts"],
	},
});
