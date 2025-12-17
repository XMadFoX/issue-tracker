import { drizzle } from "drizzle-orm/node-postgres";
import { env } from "./env";
import * as schema from "./schema";

export let db: ReturnType<typeof drizzle<typeof schema>>;

function init(url?: string) {
	db = drizzle({
		connection: {
			connectionString: url ?? env.DATABASE_URL,
		},
		schema,
	});
}

init();

export type DB = typeof db;
export { schema, init };
