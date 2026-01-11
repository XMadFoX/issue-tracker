import { cors } from "@elysiajs/cors";
import { record } from "@elysiajs/opentelemetry";
import { OpenAPIHandler } from "@orpc/openapi/fetch";
import { OpenAPIReferencePlugin } from "@orpc/openapi/plugins";
import { RPCHandler } from "@orpc/server/fetch";
import { ResponseHeadersPlugin } from "@orpc/server/plugins";
import { ZodToJsonSchemaConverter } from "@orpc/zod";
import { type Context, Elysia } from "elysia";
import { env } from "./env";
import { auth } from "./lib/auth";
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

const rpcHandler = new RPCHandler(router, {
	plugins: [new ResponseHeadersPlugin()],
});

const betterAuthView = (context: Context) => {
	const BETTER_AUTH_ACCEPT_METHODS = ["POST", "GET"];
	if (BETTER_AUTH_ACCEPT_METHODS.includes(context.request.method)) {
		return auth.handler(context.request);
	}
	return context.status(405);
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
