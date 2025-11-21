import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

export const env = createEnv({
	server: {
		DATABASE_URL: z.string().url(),
		PORT: z.coerce.number().optional().default(4000),
	},
	runtimeEnv: process.env,
});
