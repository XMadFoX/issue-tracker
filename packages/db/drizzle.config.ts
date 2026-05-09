import "dotenv/config";
import { defineConfig } from "drizzle-kit";
import { env } from "./src/env";

if (env.ENV_TYPE !== "server" || !env.DATABASE_URL)
	throw new Error("Drizzle cli works only with statefull connection");

export default defineConfig({
	out: "./drizzle",
	schema: "./src/schema.ts",
	dialect: "postgresql",
	dbCredentials: {
		url: env.DATABASE_URL,
	},
});
