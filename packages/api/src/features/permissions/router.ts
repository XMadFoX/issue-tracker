import { ORPCError } from "@orpc/server";
import { db } from "db";
import {
	permissionsCatalog,
	roleDefinitions,
	rolePermissions,
} from "db/features/abac/abac.schema";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { authedRouter } from "../../context";
import { isAllowed } from "../../lib/abac";
import {
	buildRolePermWhere,
	detectPermissionCycle,
	sanitizeAttributes,
} from "../../lib/permissions-helpers";

// TODO: implement type-safe errors using the .errors() method on the routes

/**
 * Assigns a permission to a role in a workspace.
 * @throws ORPCError if unauthorized, role not found, permission not found, or cycle detected
 */
export const create = authedRouter
	.input(
		z.object({
			roleId: z.string(),
			workspaceId: z.string(),
			permissionId: z.string(),
			effect: z.enum(["allow", "deny"]),
			constraintId: z.string().optional(),
			attributes: z
				.record(z.string(), z.unknown())
				.optional()
				.transform((val) => sanitizeAttributes(val || {})),
		}),
	)
	.handler(async ({ context, input }) => {
		const allowed = await isAllowed({
			userId: context.auth.session.userId,
			workspaceId: input.workspaceId,
			permissionKey: "role:manage_permissions",
		});
		if (!allowed) {
			throw new ORPCError("FORBIDDEN", {
				message: "Unauthorized",
			});
		}

		// Validate role exists in the workspace
		const [role] = await db
			.select({ id: roleDefinitions.id })
			.from(roleDefinitions)
			.where(
				and(
					eq(roleDefinitions.id, input.roleId),
					eq(roleDefinitions.workspaceId, input.workspaceId),
				),
			);
		if (!role) {
			throw new ORPCError("BAD_REQUEST", {
				message: "Role not found in workspace",
			});
		}

		// Validate permission exists
		const [perm] = await db
			.select({ id: permissionsCatalog.id })
			.from(permissionsCatalog)
			.where(eq(permissionsCatalog.id, input.permissionId));
		if (!perm) {
			throw new ORPCError("BAD_REQUEST", { message: "Permission not found" });
		}

		// Check for cycle
		if (
			await detectPermissionCycle(
				input.roleId,
				input.workspaceId,
				input.permissionId,
			)
		) {
			throw new ORPCError("FORBIDDEN", {
				message: "Would create permission cycle",
			});
		}

		// Check if already assigned
		const existingQuery = await db
			.select()
			.from(rolePermissions)
			.where(
				buildRolePermWhere(
					input.roleId,
					input.permissionId,
					input.constraintId,
				),
			);
		if (existingQuery.length > 0) {
			throw new ORPCError("BAD_REQUEST", {
				message: "Permission already assigned to role",
			});
		}

		const [created] = await db
			.insert(rolePermissions)
			.values({
				roleId: input.roleId,
				permissionId: input.permissionId,
				effect: input.effect,
				constraintId: input.constraintId || null,
				attributes: input.attributes || {},
			})
			.returning();

		return created;
	});

/**
 * Lists permissions for a role in a workspace with pagination.
 * @throws ORPCError if unauthorized or role not found
 */
export const list = authedRouter
	.input(
		z.object({
			roleId: z.string(),
			workspaceId: z.string(),
			limit: z.number().min(1).max(100).default(50),
			offset: z.number().min(0).default(0),
		}),
	)
	.handler(async ({ context, input }) => {
		const allowed = await isAllowed({
			userId: context.auth.session.userId,
			workspaceId: input.workspaceId,
			permissionKey: "role:read",
		});
		if (!allowed) {
			throw new ORPCError("FORBIDDEN", {
				message: "Unauthorized",
			});
		}

		// Validate role
		const [role] = await db
			.select({ id: roleDefinitions.id })
			.from(roleDefinitions)
			.where(
				and(
					eq(roleDefinitions.id, input.roleId),
					eq(roleDefinitions.workspaceId, input.workspaceId),
				),
			);
		if (!role) {
			throw new ORPCError("BAD_REQUEST", { message: "Role not found" });
		}

		const perms = await db
			.select()
			.from(rolePermissions)
			.innerJoin(
				permissionsCatalog,
				eq(rolePermissions.permissionId, permissionsCatalog.id),
			)
			.where(eq(rolePermissions.roleId, input.roleId))
			.limit(input.limit)
			.offset(input.offset);

		return perms;
	});

/**
 * Retrieves a specific role permission.
 * @throws ORPCError if unauthorized or not found
 */
export const get = authedRouter
	.input(
		z.object({
			roleId: z.string(),
			workspaceId: z.string(),
			permissionId: z.string(),
			constraintId: z.string().optional(),
		}),
	)
	.handler(async ({ context, input }) => {
		const allowed = await isAllowed({
			userId: context.auth.session.userId,
			workspaceId: input.workspaceId,
			permissionKey: "role:read",
		});
		if (!allowed) {
			throw new ORPCError("FORBIDDEN", {
				message: "Unauthorized",
			});
		}

		// Validate role
		const [role] = await db
			.select({ id: roleDefinitions.id })
			.from(roleDefinitions)
			.where(
				and(
					eq(roleDefinitions.id, input.roleId),
					eq(roleDefinitions.workspaceId, input.workspaceId),
				),
			);
		if (!role) {
			throw new ORPCError("BAD_REQUEST", { message: "Role not found" });
		}

		const [joined] = await db
			.select()
			.from(rolePermissions)
			.innerJoin(
				permissionsCatalog,
				eq(rolePermissions.permissionId, permissionsCatalog.id),
			)
			.where(
				buildRolePermWhere(
					input.roleId,
					input.permissionId,
					input.constraintId,
				),
			);

		if (!joined) {
			throw new ORPCError("NOT_FOUND", {
				message: "Role permission not found",
			});
		}

		return joined;
	});

export const rolePermissionsRouter = {
	create,
	list,
	get,
};
