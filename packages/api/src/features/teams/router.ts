import { ORPCError } from "@orpc/server";
import { createId } from "@paralleldrive/cuid2";
import { db } from "db";
import {
	team,
	teamMembership,
	workspace,
	workspaceMembership,
} from "db/features/tracker/tracker.schema";
import { and, eq } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { authedRouter } from "../../context";
import { isAllowed } from "../../lib/abac";
import { workspaceInsertSchema } from "../workspaces/router";

const teamInsertSchema = createInsertSchema(team);

export const listUserTeams = authedRouter.handler(async ({ context }) => {
	const userTeams = await db
		.select({ team })
		.from(team)
		.innerJoin(workspace, eq(team.workspaceId, workspace.id))
		.innerJoin(
			workspaceMembership,
			eq(workspace.id, workspaceMembership.workspaceId),
		)
		.where(eq(workspaceMembership.userId, context.auth.session.userId));

	return userTeams.map((item) => item.team);
});

export const listUserTeamsByWorkspace = authedRouter
	.input(workspaceInsertSchema.pick({ id: true }))
	.handler(async ({ context, input }) => {
		const [list] = await db
			.select({ team })
			.from(team)
			.innerJoin(workspace, eq(team.workspaceId, workspace.id))
			.innerJoin(
				workspaceMembership,
				eq(workspace.id, workspaceMembership.workspaceId),
			)
			.where(
				and(
					eq(workspaceMembership.userId, context.auth.session.userId),
					eq(workspace.id, input.id),
				),
			);

		return list;
	});

export const listByWorkspace = authedRouter
	.input(workspaceInsertSchema.pick({ id: true }))
	.handler(async ({ context, input }) => {
		const allowed = await isAllowed({
			userId: context.auth.session.userId,
			workspaceId: input.id,
			permissionKey: "workspace:read",
		});
		if (!allowed) {
			throw new ORPCError("Unauthorized to read workspace");
		}
		if (!allowed) {
			throw new ORPCError("Unauthorized to read workspace");
		}

		const [list] = await db
			.select({ team })
			.from(team)
			.innerJoin(workspace, eq(team.workspaceId, workspace.id))
			.where(eq(workspace.id, input.id));

		return list;
	});

export const teamRouter = {
	listUserTeams,
	listUserTeamsByWorkspace,
	listByWorkspace,
};
