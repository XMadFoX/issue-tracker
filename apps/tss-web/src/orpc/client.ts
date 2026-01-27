import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import { ClientRetryPlugin } from "@orpc/client/plugins";
import type { RouterClient } from "@orpc/server";
import { createTanstackQueryUtils } from "@orpc/tanstack-query";
import type { router } from "@prism/api";
import { env } from "src/env";

const link = new RPCLink({
	url: `${env.VITE_API_URL}/rpc`,
	fetch: (request, init) => {
		return globalThis.fetch(request, {
			...init,
			credentials: "include", // Include cookies for cross-origin requests
		});
	},
	plugins: [
		new ClientRetryPlugin({
			default: {
				retry: 3,
				shouldRetry: ({ error }) => {
					// Don't retry on 4xx client errors
					if (
						typeof error === "object" &&
						error !== null &&
						"status" in error &&
						typeof error.status === "number" &&
						error.status >= 400 &&
						error.status < 500
					) {
						return false;
					}
					return true;
				},
			},
		}),
	],
});

export const client: RouterClient<typeof router> = createORPCClient(link);

export const orpc = createTanstackQueryUtils(client);
