import { OpenAPIHandler } from "@orpc/openapi/fetch";
import { OpenAPIReferencePlugin } from "@orpc/openapi/plugins";
import type { Context } from "@orpc/server";
import { CORSPlugin, ResponseHeadersPlugin } from "@orpc/server/plugins";
import { ZodToJsonSchemaConverter } from "@orpc/zod";
import { Elysia } from "elysia";
import { auth } from "./lib/auth";
import { router } from "./router";

const handler = new OpenAPIHandler(router, {
	plugins: [
		new CORSPlugin(),
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

const betterAuthView = (context: Context) => {
	const BETTER_AUTH_ACCEPT_METHODS = ["POST", "GET"];
	// validate request method
	if (BETTER_AUTH_ACCEPT_METHODS.includes(context.request.method)) {
		return auth.handler(context.request);
	} else {
		context.error(405);
	}
};

const port = process.env.PORT ?? 3000;
new Elysia()
	.all(
		"/rpc*",
		async ({ request }: { request: Request }) => {
			const { response } = await handler.handle(request, {
				prefix: "/rpc",
				context: {
					headers: request.headers,
					session: await auth.api.getSession({ headers: request.headers }),
				},
			});

			return response ?? new Response("Not Found", { status: 404 });
		},
		{
			parse: "none", // Disable Elysia body parser to prevent "body already used" error
		},
	)
	.all("/api/auth/*", betterAuthView)
	.listen(port);

console.log(`🦊 Elysia is running at http://localhost:${port}`);
