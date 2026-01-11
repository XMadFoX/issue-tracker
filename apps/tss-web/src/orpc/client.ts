import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
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
});

export const client: RouterClient<typeof router> = createORPCClient(link);

export const orpc = createTanstackQueryUtils(client);
