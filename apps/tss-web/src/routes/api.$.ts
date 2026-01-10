import { Elysia, prism } from "@prism/api";
import { createFileRoute } from "@tanstack/react-router";

const app = new Elysia().use(prism);

const handle = ({ request }: { request: Request }) => app.fetch(request);

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
