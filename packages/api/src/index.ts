import { Elysia } from "elysia";
import { env } from "./env";
import { closeNatsConnection } from "./features/issues/publisher";
import { logger } from "./logger";
import { initOtel, shutdownOtel } from "./otel-instrumentation";

initOtel();

const { prism } = await import("./app");
const { ensureApiInit } = await import("./init");
const { router } = await import("./router");

const startApiInit = () => {
	logger.info("Running API init");
	void ensureApiInit()
		.then(() => {
			logger.info("API init done");
		})
		.catch((error: unknown) => {
			logger.error("API init failed: {error}", { error });
		});
};

startApiInit();

export { Elysia, prism, router };

const port = env.PORT;
export const ElysiaApp = new Elysia().use(prism).onStop(async () => {
	await closeNatsConnection();
	logger.info("NATS connection closed");
	await shutdownOtel();
	logger.info("OpenTelemetry SDK shut down");
});

// Only listen if this is the main module (standalone mode)
if (import.meta.main) {
	ElysiaApp.listen(port);
	logger.info(`🦊 Elysia is running at http://localhost:${port}`);
}
