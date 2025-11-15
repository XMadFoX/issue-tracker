import { ORPCError } from "@orpc/server";
import { createId } from "@paralleldrive/cuid2";
import { db } from "db";
import {
	roleAssignments,
	roleDefinitions,
	roleScopeLevelEnum,
} from "db/features/abac/abac.schema";
import { team } from "db/features/tracker/tracker.schema";
import { and, count, eq, isNull, type SQL } from "drizzle-orm";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { omit } from "remeda";
import { z } from "zod/v4";
import { authedRouter } from "../../context";
import { isAllowed } from "../../lib/abac";
import { teamInsertSchema } from "../teams/router";

export const roleScopeLevelEnumSchema = createSelectSchema(roleScopeLevelEnum);
export const roleInsertSchema = createInsertSchema(roleDefinitions);

export const roleCreateSchema = roleInsertSchema
	.omit({
		id: true,
		createdBy: true,
	})
	.extend({
		teamId: teamInsertSchema.shape.id.optional(),
		scopeLevel: roleScopeLevelEnumSchema.optional(),
	});

export const roleListSchema = roleInsertSchema
	.pick({
		workspaceId: true,
	})
	.extend({
		teamId: z.string().optional(),
	});

export const roleGetSchema = roleInsertSchema
	.pick({
		id: true,
		workspaceId: true,
	})
	.extend({
		teamId: z.string().optional(),
	});

export const roleUpdateSchema = roleInsertSchema
	.partial()
	.required({ id: true, workspaceId: true })
	.extend({
		teamId: z.string().optional(),
	});

export const roleDeleteSchema = roleInsertSchema
	.pick({
		id: true,
		workspaceId: true,
	})
	.extend({
		teamId: z.string().optional(),
	});

export const create = authedRouter
	.input(roleCreateSchema)
	.handler(async ({ context, input }) => {
		const { teamId, scopeLevel, ...rest } = input;
		if (teamId && scopeLevel !== "team") {
			throw new ORPCError("teamId can only be provided for team-scoped roles");
		}
		if (scopeLevel === "team" && !teamId) {
			throw new ORPCError("teamId is required for team-scoped roles");
		}

		const allowed = await isAllowed({
			userId: context.auth.session.userId,
			workspaceId: input.workspaceId,
			teamId: teamId || undefined,
			permissionKey: "role:create",
		});
		if (!allowed) {
			throw new ORPCError("Unauthorized to create role in this workspace/team");
		}

		// Validate team exists in workspace if teamId provided
		if (teamId) {
			const [selectedTeam] = await db
				.select({ workspaceId: team.workspaceId })
				.from(team)
				.where(eq(team.id, teamId));
			if (!selectedTeam || selectedTeam.workspaceId !== input.workspaceId) {
				throw new ORPCError("Invalid team for this workspace");
			}
		}

		const whereClause = and(
			eq(roleDefinitions.workspaceId, input.workspaceId),
			eq(roleDefinitions.name, input.name),
			scopeLevel === "team" && teamId
				? eq(roleDefinitions.teamId, teamId)
				: isNull(roleDefinitions.teamId),
		);
		const [existingCount] = await db
			.select({ count: count() })
			.from(roleDefinitions)
			.where(whereClause);

		if (Number(existingCount?.count) > 0) {
			throw new ORPCError(
				"Role with this name already exists in the workspace/team",
			);
		}

		const [createdRole] = await db
			.insert(roleDefinitions)
			.values({
				id: createId(),
				createdBy: context.auth.session.userId,
				teamId: teamId || null,
				scopeLevel: scopeLevel || "workspace",
				...rest,
			})
			.returning({ id: roleDefinitions.id, name: roleDefinitions.name });

		if (!createdRole) {
			throw new ORPCError("Failed to create role");
		}

		return createdRole;
	});

export const list = authedRouter
	.input(roleListSchema)
	.handler(async ({ context, input }) => {
		const { teamId } = input;
		const allowed = await isAllowed({
			userId: context.auth.session.userId,
			workspaceId: input.workspaceId,
			teamId: teamId || undefined,
			permissionKey: "role:read",
		});
		if (!allowed) {
			throw new ORPCError("Unauthorized to read roles in this workspace/team");
		}

		const whereClause: SQL[] = [];
		if (teamId) {
			whereClause.push(eq(roleDefinitions.teamId, teamId));
			whereClause.push(eq(roleDefinitions.workspaceId, input.workspaceId));
		} else {
			whereClause.push(isNull(roleDefinitions.teamId));
			whereClause.push(eq(roleDefinitions.workspaceId, input.workspaceId));
		}

		const roles = await db
			.select()
			.from(roleDefinitions)
			.where(and(...whereClause));

		return roles;
	});

export const get = authedRouter
	.input(roleGetSchema)
	.handler(async ({ context, input }) => {
		const { teamId } = input;
		const allowed = await isAllowed({
			userId: context.auth.session.userId,
			workspaceId: input.workspaceId,
			teamId: teamId || undefined,
			permissionKey: "role:read",
		});
		if (!allowed) {
			throw new ORPCError("Unauthorized to read roles in this workspace/team");
		}

		const whereRole = eq(roleDefinitions.id, input.id);
		const [role] = await db.select().from(roleDefinitions).where(whereRole);

		if (!role || role.workspaceId !== input.workspaceId) {
			throw new ORPCError("Role not found");
		}

		if (teamId && role.teamId !== teamId) {
			throw new ORPCError("Role not found in specified team");
		}

		return role;
	});

const commonErrors = { UNAUTHORIZED: {} };
const unauthorizedMessage = (action: "update" | "delete") =>
	`You don't have permission to ${action} this role or the role doesn't exist`;

const update = authedRouter
	.input(roleUpdateSchema)
	.errors(commonErrors)
	.handler(async ({ context, input, errors }) => {
		const { teamId } = input;
		const allowed = await isAllowed({
			userId: context.auth.session.userId,
			workspaceId: input.workspaceId,
			teamId: teamId || undefined,
			permissionKey: "role:update",
		});
		if (!allowed)
			throw errors.UNAUTHORIZED({
				message: unauthorizedMessage("update"),
			});

		const whereRole = eq(roleDefinitions.id, input.id);
		const [existingRole] = await db
			.select({
				workspaceId: roleDefinitions.workspaceId,
				teamId: roleDefinitions.teamId,
			})
			.from(roleDefinitions)
			.where(whereRole);

		if (!existingRole || existingRole.workspaceId !== input.workspaceId) {
			throw new ORPCError("Role not found");
		}

		if (teamId && existingRole.teamId !== teamId) {
			throw new ORPCError("Cannot update role across teams");
		}

		const values = omit(input, ["id", "workspaceId", "teamId"]);
		const [updated] = await db
			.update(roleDefinitions)
			.set(values)
			.where(whereRole)
			.returning({ id: roleDefinitions.id });

		return updated;
	});

const deleteRole = authedRouter
	.input(roleDeleteSchema)
	.errors(commonErrors)
	.handler(async ({ context, input, errors }) => {
		const { teamId } = input;
		const allowed = await isAllowed({
			userId: context.auth.session.userId,
			workspaceId: input.workspaceId,
			teamId: teamId || undefined,
			permissionKey: "role:delete",
		});
		if (!allowed)
			throw errors.UNAUTHORIZED({
				message: unauthorizedMessage("delete"),
			});

		const whereRole = eq(roleDefinitions.id, input.id);
		const [existingRole] = await db
			.select({
				workspaceId: roleDefinitions.workspaceId,
				teamId: roleDefinitions.teamId,
			})
			.from(roleDefinitions)
			.where(whereRole);

		if (!existingRole || existingRole.workspaceId !== input.workspaceId) {
			throw new ORPCError("Role not found");
		}

		if (teamId && existingRole.teamId !== teamId) {
			throw new ORPCError("Cannot delete role across teams");
		}

		// Check if role is in use
		const [assignmentsCount] = await db
			.select({ count: count() })
			.from(roleAssignments)
			.where(eq(roleAssignments.roleId, input.id));

		if (Number(assignmentsCount?.count) > 0) {
			throw new ORPCError("Cannot delete role that is assigned to users");
		}

		await db.delete(roleDefinitions).where(whereRole);

		return { success: true };
	});

export const roleRouter = {
	create,
	list,
	get,
	update,
	delete: deleteRole,
};
