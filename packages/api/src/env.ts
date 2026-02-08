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
		OPENAI_ENDPOINT: z.string().default("http://localhost:11434/v1"),
		OPENAI_API_KEY: z.string().default(""),
		EMBEDDING_MODEL: z.string().default("qwen3-embedding:4b"),
	},
	runtimeEnv: process.env,
});
