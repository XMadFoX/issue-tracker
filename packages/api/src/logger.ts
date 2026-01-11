import { createRequire } from "node:module";

// NOTE: import is not working correctly with otel patching, logs are not send when using esm imports
// createRequire hack is used to fix require not found in vite
const require = createRequire(import.meta.url);
const pino = require("pino");

const logger = pino({
	transport: {
		target: "pino-pretty",
	},
});

export { logger };
