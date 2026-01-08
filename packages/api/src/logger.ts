// NOTE: import is not working correctly with otel patching, logs are not send when using esm imports
const pino = require("pino");
const logger = pino({
	transport: {
		target: "pino-pretty",
	},
});

export { logger };
