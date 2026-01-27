import { Elysia } from "elysia";
import { prism } from "./app";
import { env } from "./env";
import { closeNatsConnection } from "./features/issues/publisher";
import { logger } from "./logger";
import { router } from "./router";

export { router, prism, Elysia };

const port = env.PORT;
export const ElysiaApp = new Elysia().use(prism).onStop(async () => {
	await closeNatsConnection();
	logger.info("NATS connection closed");
});

// Only listen if this is the main module (standalone mode)
if (import.meta.main) {
	ElysiaApp.listen(port);
	logger.info(`🦊 Elysia is running at http://localhost:${port}`);
}
