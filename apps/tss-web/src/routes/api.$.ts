import { createFileRoute } from "@tanstack/react-router";
import { env } from "../env";

let cachedApp: any;

const handle = async ({ request }: { request: Request }) => {
	if (!env.HOST_API) {
		return new Response("Not Found", { status: 404 });
	}

	if (!cachedApp) {
		const { Elysia, prism } = await import("@prism/api");
		cachedApp = new Elysia().use(prism);
	}

	return cachedApp.fetch(request);
};

export const Route = createFileRoute("/api/$")({
	server: {
		handlers: {
			GET: handle,
			POST: handle,
			PUT: handle,
			DELETE: handle,
			PATCH: handle,
			OPTIONS: handle,
			HEAD: handle,
		},
	},
});
