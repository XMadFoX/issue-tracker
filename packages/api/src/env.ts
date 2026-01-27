import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

export const env = createEnv({
	server: {
		DATABASE_URL: z.string().url(),
		PORT: z.coerce.number().optional().default(4000),
		NATS_URL: z.string().optional().default("nats://localhost:4222"),
		CORS_ORIGINS: z
			.string()
			.optional()
			.default("http://localhost:3000")
			.transform(
				(val) =>
					val
						.split(",")
						.map((s) => s.trim())
						.filter(Boolean), // remove empty strings
			),
	},
	runtimeEnv: process.env,
});
