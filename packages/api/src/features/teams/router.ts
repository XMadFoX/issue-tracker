import { ORPCError } from "@orpc/server";
import { createId } from "@paralleldrive/cuid2";
import { db } from "db";
import {
	team,
	teamMembership,
	workspace,
} from "db/features/tracker/tracker.schema";
import { and, eq } from "drizzle-orm";
import { omit } from "remeda";
import { authedRouter } from "../../context";
import { isAllowed } from "../../lib/abac";
import {
	teamCreateSchema,
	teamDeleteSchema,
	teamListSchema,
	teamUpdateSchema,
} from "./schema";

export const listUserTeams = authedRouter.handler(async ({ context }) => {
	const userTeams = await db
		.select({ team })
		.from(team)
		.innerJoin(teamMembership, eq(team.id, teamMembership.teamId))
		.where(eq(teamMembership.userId, context.auth.session.userId));

	return userTeams.map((item) => item.team);
});

export const listUserTeamsByWorkspace = authedRouter
	.input(teamListSchema)
	.handler(async ({ context, input }) => {
		const [list] = await db
			.select({ team })
			.from(team)
			.innerJoin(teamMembership, eq(team.id, teamMembership.teamId))
			.innerJoin(workspace, eq(team.workspaceId, workspace.id))
			.where(
				and(
					eq(teamMembership.userId, context.auth.session.userId),
					eq(workspace.id, input.id),
				),
			);

		return list;
	});

export const listByWorkspace = authedRouter
	.input(teamListSchema)
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

		const list = await db
			.select({ team })
			.from(team)
			.innerJoin(workspace, eq(team.workspaceId, workspace.id))
			.where(eq(workspace.id, input.id));

		return list.map((t) => t.team);
	});

export const create = authedRouter
	.input(teamCreateSchema)
	.handler(async ({ context, input }) => {
		const allowed = await isAllowed({
			userId: context.auth.session.userId,
			workspaceId: input.workspaceId,
			permissionKey: "team:create",
		});
		if (!allowed) {
			throw new ORPCError("Unauthorized to create team in this workspace");
		}

		const [createdTeam] = await db
			.insert(team)
			.values({
				id: createId(),
				...input,
			})
			.returning({ id: team.id });

		if (!createdTeam) {
			throw new ORPCError("Failed to create team");
		}

		return createdTeam;
	});

const commonErrors = { UNAUTHORIZED: {} };
const unauthorizedMessage = (action: "update" | "delete") =>
	`You don't have permission to ${action} this team or the team doesn't exist`;

const update = authedRouter
	.input(teamUpdateSchema)
	.errors(commonErrors)
	.handler(async ({ context, input, errors }) => {
		const allowed = await isAllowed({
			userId: context.auth.session.userId,
			workspaceId: input.workspaceId,
			permissionKey: "team:update",
		});
		if (!allowed)
			throw errors.UNAUTHORIZED({
				message: unauthorizedMessage("update"),
			});

		const [existingTeam] = await db
			.select({ workspaceId: team.workspaceId })
			.from(team)
			.where(eq(team.id, input.id));

		if (!existingTeam) {
			throw new ORPCError("Team not found");
		}

		const values = omit(input, ["id", "workspaceId"]);
		return await db.update(team).set(values).where(eq(team.id, input.id));
	});

const deleteTeam = authedRouter
	.input(teamDeleteSchema)
	.errors(commonErrors)
	.handler(async ({ context, input, errors }) => {
		const allowed = await isAllowed({
			userId: context.auth.session.userId,
			workspaceId: input.workspaceId,
			permissionKey: "team:delete",
		});

		const [existingTeam] = await db
			.select({ workspaceId: team.workspaceId })
			.from(team)
			.where(eq(team.id, input.id));

		if (!existingTeam) {
			throw new ORPCError("Team not found");
		}

		if (!allowed)
			throw errors.UNAUTHORIZED({
				message: unauthorizedMessage("delete"),
			});

		return await db.delete(team).where(eq(team.id, input.id));
	});

export const teamRouter = {
	listUserTeams,
	listUserTeamsByWorkspace,
	listByWorkspace,
	create,
	update,
	delete: deleteTeam,
};
