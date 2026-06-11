import { getLogger } from "@logtape/logtape";
import { sql } from "drizzle-orm";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { drizzle as drizzleHttp } from "drizzle-orm/pg-proxy";
import { Pool } from "pg";
import { env } from "./env";
import { observeDbPool, recordDbProxyQuery } from "./metrics";
import { relations } from "./relations";
import * as schema from "./schema";

function customColMapper(value: unknown) {
	if (typeof value === "string") {
		if (value.match(/\d{4}-[01]\d-[0-3]\dT.+Z/)?.input) {
			return new Date(value);
		}
	}
	return value;
}

function getProxyResponseRows(body: unknown) {
	if (typeof body !== "object" || body === null || !("rows" in body)) {
		return null;
	}
	if (!Array.isArray(body.rows)) {
		return null;
	}
	return body.rows;
}

const logger = getLogger(["prism-tracker", "db"]);

function createDb() {
	if (env.ENV_TYPE === "serverless") {
		const serverlessEnv = env; // ts hack to get correct types inside of callback

		return drizzleHttp(
			async (sql, params, method) => {
				const start = performance.now();
				let status: "ok" | "error" = "ok";

				try {
					const url = serverlessEnv.PG_PROXY_URL;
					logger.debug("fetching from pg proxy", {
						url,
						sql,
						params,
						method,
					});
					const res = await fetch(url, {
						body: JSON.stringify({ sql, params, method }),
						method: "POST",
						headers: {
							"Content-Type": "application/json",
							Authorization: `Bearer ${serverlessEnv.AUTH_TOKEN}`,
						},
					});
					const text = await res.text();
					if (!res.ok) {
						logger.error("pg proxy request failed", {
							status: res.status,
							body: text,
						});
						throw new Error(
							`pg proxy request failed with status ${res.status}`,
						);
					}
					logger.debug("raw response from pg proxy server", { text });
					const body: unknown = JSON.parse(text);
					logger.debug("parsed json response from pg proxy server", { body });
					const rowsRaw = getProxyResponseRows(body);
					if (!rowsRaw) {
						throw new Error("pg proxy response did not include rows");
					}
					const rows = rowsRaw.map(customColMapper);
					logger.debug("fetched from pg proxy", {
						sql,
						params,
						method,
						rows,
					});

					return { rows: rows };
				} catch (error: unknown) {
					status = "error";
					logger.error("Error from pg proxy server: {error}", { error });
					throw error;
				} finally {
					recordDbProxyQuery(method, performance.now() - start, status);
				}
			},
			{ relations },
		);
	} else {
		logger.info("Initializing stateful database connection");
		const pool = new Pool({ connectionString: env.DATABASE_URL });
		observeDbPool(pool);

		return drizzle({
			client: pool,
			relations,
		});
	}
}

// inferred type of PgRemoteDatabase is wrong, breaks types of returning(X) which API is actually returning properly
const db = createDb() as NodePgDatabase<typeof relations>;

export async function checkDbReachable(): Promise<void> {
	await db.execute(sql`select 1`);
}

export { db };
export type DB = typeof db;
export { schema };
