import { $ } from "bun";
import { db, init } from "db";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import path from "path";

export default async function setupDb() {
	console.info("[setupDb] compose up");
	await $`docker compose -f ../../compose.test.yaml up -d --force-recreate --wait`;
	const url = "postgres://postgres:postgres@localhost:6432/issue_tracker";
	console.log("[setupDb] connecting to db");
	init(url);

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
