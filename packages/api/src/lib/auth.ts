import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db } from "db";
import { env } from "../env";

export const auth = betterAuth({
	trustedOrigins: env.CORS_ORIGINS,
	emailAndPassword: {
		enabled: true,
	},
	database: drizzleAdapter(db, {
		provider: "pg",
	}),
});
