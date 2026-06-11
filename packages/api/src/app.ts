import { cors } from "@elysiajs/cors";
import { record } from "@elysiajs/opentelemetry";
import { OpenAPIHandler } from "@orpc/openapi/fetch";
import { OpenAPIReferencePlugin } from "@orpc/openapi/plugins";
import { ORPCError, onError } from "@orpc/server";
import { RPCHandler } from "@orpc/server/fetch";
import { ResponseHeadersPlugin } from "@orpc/server/plugins";
import { ZodToJsonSchemaConverter } from "@orpc/zod";
import { checkDbReachable } from "db";
import { type Context, Elysia } from "elysia";
import { StatusMap } from "elysia/utils";
import { env } from "./env";
import { checkNatsReachable } from "./features/issues/publisher";
import { isApiInitCompleted } from "./init";
import { auth } from "./lib/auth";
import { logger } from "./logger";
import { addHttpActiveRequest, recordHttpRequest } from "./metrics";
import { instrumentation } from "./otel-instrumentation";
import { router } from "./router";

const openApiHandler = new OpenAPIHandler(router, {
	plugins: [
		new ResponseHeadersPlugin(),
		new OpenAPIReferencePlugin({
			docsProvider: "scalar",
			schemaConverters: [new ZodToJsonSchemaConverter()],
			specGenerateOptions: {
				info: {
					title: "ORPC Playground",
					version: "0.0.0",
				},
			},
		}),
	],
});

const isClientErrorStatus = (status: number) => {
	return status >= 400 && status < 500;
};

const logRpcError = (error: unknown) => {
	if (error instanceof ORPCError) {
		const properties = {
			error,
			code: error.code,
			status: error.status,
			defined: error.defined,
			data: error.data,
		};

		if (error.defined && isClientErrorStatus(error.status)) {
			logger.debug(
				"RPC request failed with defined client error: {error}",
				properties,
			);
			return;
		}

		if (isClientErrorStatus(error.status)) {
			logger.warning(
				"RPC request failed with undefined client error: {error}",
				properties,
			);
			return;
		}

		logger.error("RPC request failed: {error}", properties);
		return;
	}

	if (error instanceof Error) {
		logger.error("RPC request failed: {error}", { error });
		return;
	}

	logger.error("RPC request failed with non-Error throwable: {thrown}", {
		thrown: error,
	});
};

const rpcHandler = new RPCHandler(router, {
	plugins: [new ResponseHeadersPlugin()],
	interceptors: [
		onError((error) => {
			logRpcError(error);
		}),
	],
});

const HTTP_STATUS_CODES: Readonly<Record<string, number>> = StatusMap;

const requestStartTimes = new WeakMap<Request, number>();

const normalizeRoute = (path: string) => {
	if (path === "/livez" || path === "/api/livez") return "/livez";
	if (
		path === "/healthz" ||
		path === "/readyz" ||
		path === "/api/healthz" ||
		path === "/api/readyz"
	) {
		return "/readyz";
	}
	if (path.startsWith("/api/auth/")) return "/api/auth/*";
	if (path.startsWith("/api/rpc")) return "/api/rpc*";
	if (path.startsWith("/rpc")) return "/rpc*";
	if (path.startsWith("/api")) return "/api*";
	return "unknown";
};

const getStatusCode = (status: number | string | undefined) => {
	if (typeof status === "number") {
		return status;
	}
	if (typeof status === "string") {
		return HTTP_STATUS_CODES[status];
	}
	return undefined;
};

const getResponseStatus = (
	status: number | string | undefined,
	response: unknown,
) => {
	if (response instanceof Response) {
		return response.status;
	}
	return getStatusCode(status) ?? 200;
};

const hasNumericStatus = (value: unknown): value is { status: number } => {
	return (
		typeof value === "object" &&
		value !== null &&
		"status" in value &&
		typeof value.status === "number"
	);
};

const getErrorResponseStatus = (
	status: number | string | undefined,
	error: unknown,
) => {
	const statusCode = getStatusCode(status);
	if (statusCode !== undefined) {
		return statusCode;
	}
	if (hasNumericStatus(error)) {
		return error.status;
	}
	return 500;
};

const startRequestMetrics = (request: Request) => {
	requestStartTimes.set(request, performance.now());
	addHttpActiveRequest(1, { "http.request.method": request.method });
};

const finishRequestMetrics = ({
	request,
	path,
	status,
}: {
	request: Request;
	path: string;
	status: number;
}) => {
	const start = requestStartTimes.get(request);
	if (start === undefined) {
		return;
	}

	requestStartTimes.delete(request);
	addHttpActiveRequest(-1, { "http.request.method": request.method });

	const attributes = {
		"http.request.method": request.method,
		"http.route": normalizeRoute(path),
		"http.response.status_code": status,
	};

	recordHttpRequest(performance.now() - start, status, attributes);
};

const betterAuthView = (context: Context) => {
	const BETTER_AUTH_ACCEPT_METHODS = ["POST", "GET"];
	if (BETTER_AUTH_ACCEPT_METHODS.includes(context.request.method)) {
		return auth.handler(context.request);
	}
	return context.status(405);
};

type HealthStatus = "ok" | "unavailable";

type HealthBody = {
	status: HealthStatus;
	checks?: {
		init: boolean;
		db: boolean;
		nats: boolean;
	};
};

const healthResponse = (status: number, body: HealthBody) => {
	return new Response(JSON.stringify(body), {
		status,
		headers: { "Content-Type": "application/json" },
	});
};

const livez = () => {
	return healthResponse(200, { status: "ok" });
};

const READINESS_CHECK_TIMEOUT_MS = 2_000;

const withTimeout = async (check: () => Promise<void>, label: string) => {
	let timeout: ReturnType<typeof setTimeout> | undefined;

	try {
		await Promise.race([
			check(),
			new Promise<never>((_, reject) => {
				timeout = setTimeout(() => {
					reject(
						new Error(
							`${label} readiness check timed out after ${READINESS_CHECK_TIMEOUT_MS}ms`,
						),
					);
				}, READINESS_CHECK_TIMEOUT_MS);
			}),
		]);
	} finally {
		if (timeout) {
			clearTimeout(timeout);
		}
	}
};

const checkReachable = async (label: string, check: () => Promise<void>) => {
	try {
		await withTimeout(check, label);
		return true;
	} catch (error) {
		logger.warning("Readiness check failed: {error}", { error });
		return false;
	}
};

const readyz = async () => {
	const init = isApiInitCompleted();
	const [db, nats] = await Promise.all([
		checkReachable("db", checkDbReachable),
		checkReachable("nats", checkNatsReachable),
	]);
	const checks = { init, db, nats };

	if (init && db && nats) {
		return healthResponse(200, { status: "ok", checks });
	}

	return healthResponse(503, { status: "unavailable", checks });
};

const handleRpc = async ({
	request,
	path,
}: {
	request: Request;
	path: string;
}) => {
	const session = await record("getSession", async () => {
		return await auth.api.getSession({ headers: request.headers });
	});

	const prefix = path.startsWith("/api") ? "/api/rpc" : "/rpc";

	const { response } = await rpcHandler.handle(request, {
		prefix,
		context: {
			headers: request.headers,
			auth: session,
		},
	});

	return response ?? new Response("Not Found", { status: 404 });
};

export const prism = new Elysia({ name: "prism" })
	.use(instrumentation)
	.use(cors({ origin: env.CORS_ORIGINS }))
	.onRequest(({ request }) => {
		startRequestMetrics(request);
	})
	.onAfterHandle(({ request, path, response, set }) => {
		finishRequestMetrics({
			request,
			path,
			status: getResponseStatus(set.status, response),
		});
	})
	.onError(({ request, path, set, error }) => {
		finishRequestMetrics({
			request,
			path,
			status: getErrorResponseStatus(set.status, error),
		});
	})
	.get("/livez", livez)
	.get("/healthz", readyz)
	.get("/readyz", readyz)
	.group("/api", (api) => {
		return api
			.get("/livez", livez)
			.get("/healthz", readyz)
			.get("/readyz", readyz);
	})
	.all("/api/auth/*", betterAuthView)
	.all("/rpc*", handleRpc, { parse: "none" })
	.all("/api/rpc*", handleRpc, { parse: "none" })
	.all(
		"/api*",
		async ({ request }) => {
			const session = await auth.api.getSession({ headers: request.headers });
			const { response } = await openApiHandler.handle(request, {
				prefix: "/api",
				context: {
					headers: request.headers,
					auth: session,
				},
			});

			return response ?? new Response("Not Found", { status: 404 });
		},
		{ parse: "none" },
	);
