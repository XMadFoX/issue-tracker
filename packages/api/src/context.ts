import { ORPCError, os } from "@orpc/server";
import type { ResponseHeadersPluginContext } from "@orpc/server/plugins";
import type { auth } from "./lib/auth";

type AuthBase = Awaited<ReturnType<typeof auth.api.getSession>>;

interface ORPCContext extends ResponseHeadersPluginContext {
	auth: AuthBase;
	headers: Headers;
}

export const base = os.$context<ORPCContext>();

export const authMiddleware = base.middleware(async ({ context, next }) => {
	if (!context.auth) {
		throw new ORPCError("UNAUTHORIZED");
	}

	return await next({
		context: { auth: context.auth },
	});
});

export const authedRouter = base.use(authMiddleware);
