import path from "node:path";
import { $ } from "bun";
import { migrate } from "drizzle-orm/node-postgres/migrator";

export default async function setupDb() {
	console.info("[setupDb] compose up");
	await $`docker compose -f ../../compose.test.yaml up -d --force-recreate --wait`;
	const url = "postgres://postgres:postgres@localhost:6432/issue_tracker";
	process.env.DATABASE_URL = url;
	process.env.ENV_TYPE = "server";

	console.log("[setupDb] connecting to db");
	const { db } = await import("db");

	// run migrations
	console.log("[setupDb] running migrations");
	const folder = path.join(__dirname, "../../../db/drizzle");
	await migrate(db, { migrationsFolder: folder });
	console.log("[setupDb] migrations done");

	return async () => {
		console.log("[setupDb] tearing down");

		await $`docker compose -f ../../compose.test.yaml down`;
	};
}
