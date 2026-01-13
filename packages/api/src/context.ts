import { ORPCError, os } from "@orpc/server";
import type { ResponseHeadersPluginContext } from "@orpc/server/plugins";
import type { auth } from "./lib/auth";

type AuthBase = Awaited<ReturnType<typeof auth.api.getSession>>;

export interface ORPCContext extends ResponseHeadersPluginContext {
	headers: Headers;
}

export interface AuthedORPCContext extends ORPCContext {
	auth: AuthBase;
}

export const base = os.$context<ORPCContext>();

export const authMiddleware = base
	.$context<AuthedORPCContext>()
	.middleware(async ({ context, next }) => {
		if (!context.auth) {
			throw new ORPCError("UNAUTHORIZED");
		}

		return await next({
			context: { auth: context.auth },
		});
	});

export const authedRouter = base
	.$context<AuthedORPCContext>()
	.use(authMiddleware);
