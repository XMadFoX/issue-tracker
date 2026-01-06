import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import type { RouterClient } from "@orpc/server";
import { createTanstackQueryUtils } from "@orpc/tanstack-query";
import type { router } from "@prism/api";
import { createClientOnlyFn } from "@tanstack/react-start";
import { env } from "src/env";

const getORPCClient = createClientOnlyFn((): RouterClient<typeof router> => {
	const link = new RPCLink({
		url: `${env.VITE_API_URL}/rpc`,
		fetch: (request, init) => {
			return globalThis.fetch(request, {
				...init,
				credentials: "include", // Include cookies for cross-origin requests
			});
		},
	});
	return createORPCClient(link);
});

export const client: RouterClient<typeof router> = getORPCClient();

export const orpc = createTanstackQueryUtils(client);
