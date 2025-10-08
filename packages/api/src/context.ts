import { ORPCError, os } from "@orpc/server";
import type { ResponseHeadersPluginContext } from "@orpc/server/plugins";
import type { Session } from "better-auth";

interface ORPCContext extends ResponseHeadersPluginContext {
	session: Session;
	headers: Headers;
}

export const base = os.$context<ORPCContext>();

export const authMiddleware = base.middleware(async ({ context, next }) => {
	if (!context.session) {
		throw new ORPCError("UNAUTHORIZED");
	}

	return await next();
});

export const authedRouter = base.use(authMiddleware);
