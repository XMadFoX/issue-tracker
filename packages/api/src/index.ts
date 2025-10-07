import { OpenAPIHandler } from "@orpc/openapi/fetch";
import { OpenAPIReferencePlugin } from "@orpc/openapi/plugins";
import { CORSPlugin } from "@orpc/server/plugins";
import { ZodToJsonSchemaConverter } from "@orpc/zod";
import { Elysia } from "elysia";
import { router } from "./router";

const handler = new OpenAPIHandler(router, {
	plugins: [
		new CORSPlugin(),
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

const port = process.env.PORT ?? 3000;
new Elysia()
	.all(
		"/rpc*",
		async ({ request }: { request: Request }) => {
			const { response } = await handler.handle(request, {
				prefix: "/rpc",
				context: {
					headers: request.headers,
				},
			});

			return response ?? new Response("Not Found", { status: 404 });
		},
		{
			parse: "none", // Disable Elysia body parser to prevent "body already used" error
		},
	)
	.listen(port);

console.log(`🦊 Elysia is running at http://localhost:${port}`);
