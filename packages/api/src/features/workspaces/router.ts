import { db } from "db";
import {
	workspace,
	workspaceMembership,
} from "db/features/tracker/tracker.schema";
import { eq } from "drizzle-orm";
import { authedRouter } from "../../context";

export const list = authedRouter.handler(async ({ context }) => {
	const userWorkspaces = await db
		.select({ workspace })
		.from(workspaceMembership)
		.leftJoin(workspace, eq(workspaceMembership.workspaceId, workspace.id))
		.where(eq(workspaceMembership.userId, context.auth.session.userId));

	return userWorkspaces.map((item) => item);
});

export const workspaceRouter = {
	list,
};
