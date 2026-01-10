import { drizzle } from "drizzle-orm/node-postgres";
import { drizzle as drizzleHttp } from "drizzle-orm/pg-proxy";
import { env } from "./env";
import * as schema from "./schema";

function customColMapper(value: unknown) {
	if (typeof value === "string") {
		if (value.match(/\d{4}-[01]\d-[0-3]\dT.+Z/)?.input) {
			return new Date(value);
		}
	}
	return value;
}

const pino = require("pino");

const logger = pino({ level: "debug" });

function createDb() {
	if (env.ENV_TYPE === "serverless") {
		const serverlessEnv = env; // ts hack to get correct types inside of callback

		return drizzleHttp(
			async (sql, params, method) => {
				try {
					const url = serverlessEnv.PG_PROXY_URL;
					logger.debug(
						{
							url,
							sql,
							params,
							method,
						},
						"fetching from pg proxy",
					);
					const res = await fetch(url, {
						body: JSON.stringify({ sql, params, method }),
						method: "POST",
						headers: {
							"Content-Type": "application/json",
							Authorization: `Bearer ${serverlessEnv.AUTH_TOKEN}`,
						},
					});
					const text = await res.text();
					logger.debug({ text }, "raw response from pg proxy server");
					const body = JSON.parse(text);
					logger.debug({ body }, "parsed json response from pg proxy server");
					const { rows: rowsRaw } = body as { rows: unknown[][] };
					const rows = rowsRaw.map(customColMapper);
					logger.debug(
						{
							sql,
							params,
							method,
							rows,
						},
						"fetched from pg proxy",
					);

					return { rows: rows };
				} catch (e: unknown) {
					console.error("Error from pg proxy server: ", e);
					return { rows: [] };
				}
			},
			{ schema },
		);
	} else {
		logger.info("Initializing stateful database connection");
		return drizzle({
			connection: {
				connectionString: env.DATABASE_URL,
			},
			schema,
		});
	}
}

const db = createDb();

export { db };
export type DB = typeof db;
export { schema };
