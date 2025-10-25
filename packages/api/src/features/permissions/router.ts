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
		isAllowed({
			userId: context.auth.session.userId,
			workspaceId: input.workspaceId,
			permissionKey: "role:manage_permissions",
		});

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
