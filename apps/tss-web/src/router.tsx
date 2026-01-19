import {
	type RouterAdapter,
	RouterAdapterProvider,
} from "@prism/blocks/src/router/adapter";
import { createRouter, Link } from "@tanstack/react-router";
import { setupRouterSsrQueryIntegration } from "@tanstack/react-router-ssr-query";
import type { ReactNode } from "react";
import * as TanstackQuery from "./integrations/tanstack-query/root-provider";

// Import the generated route tree
import { routeTree } from "./routeTree.gen";

// Create a new router instance
export const getRouter = () => {
	const rqContext = TanstackQuery.getContext();

	let router: ReturnType<typeof createRouter> | null = null;

	const adapter: RouterAdapter = {
		Link,
		navigate: (to) => {
			if (router === null) {
				throw new Error("Router is not initialized");
			}

			router.navigate({ to });
		},
	};

	router = createRouter({
		routeTree,
		context: { ...rqContext },
		defaultPreload: "intent",
		Wrap: (props: { children: ReactNode }) => {
			return (
				<RouterAdapterProvider value={adapter}>
					<TanstackQuery.Provider {...rqContext}>
						{props.children}
					</TanstackQuery.Provider>
				</RouterAdapterProvider>
			);
		},
	});

	setupRouterSsrQueryIntegration({
		router,
		queryClient: rqContext.queryClient,
	});

	return router;
};
