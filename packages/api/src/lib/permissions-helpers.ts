import { db } from "db";
import {
	permissionsCatalog,
	roleDefinitions,
	rolePermissions,
} from "db/features/abac/abac.schema";
import { workspaceMembership } from "db/features/tracker/tracker.schema";
import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod/v4";
// TODO: cover with tests
// ! high severity
/**
 * Detects if assigning a new permission to a role would create a cycle in the permission management graph.
 * Assumes flat management within a workspace: any role with "role:manage_permissions" can manage permissions for any other role.
 * In flat management without hierarchy, indirect cycles are possible if multiple roles have manage_permissions (mutual management).
 * For simplicity, we prevent multiple managing roles to avoid cycles; only one role per workspace can have it.
 * If hierarchy is introduced (e.g., via role.attributes), extend with proper graph traversal.
 * @param roleId - The ID of the role receiving the new permission
 * @param workspaceId - The workspace scope
 * @param newPermissionId - The ID of the permission being assigned
 * @returns true if a cycle would be created
 */
export async function detectPermissionCycle(
	roleId: string,
	workspaceId: string,
	newPermissionId: string,
): Promise<boolean> {
	// Fetch the new permission key
	const [perm] = await db
		.select({ key: permissionsCatalog.key })
		.from(permissionsCatalog)
		.where(eq(permissionsCatalog.id, newPermissionId));

	if (perm?.key !== "role:manage_permissions") {
		return false; // Only manage_permissions can create cycles
	}

	// Check for self-assignment (direct cycle, prevented by unique constraint but verify)
	const existingSelf = await db
		.select()
		.from(rolePermissions)
		.innerJoin(
			permissionsCatalog,
			eq(rolePermissions.permissionId, permissionsCatalog.id),
		)
		.innerJoin(roleDefinitions, eq(rolePermissions.roleId, roleDefinitions.id))
		.where(
			and(
				eq(rolePermissions.roleId, roleId),
				eq(permissionsCatalog.key, "role:manage_permissions"),
				eq(roleDefinitions.workspaceId, workspaceId),
			),
		);

	if (existingSelf.length > 0) {
		return true; // Already has it: self-cycle
	}

	// In flat management, check if there are already managing roles in the workspace
	// If yes, adding another would create mutual management cycle (A manages B, B manages A)
	const managingRoles = await db
		.selectDistinct({ roleId: rolePermissions.roleId })
		.from(rolePermissions)
		.innerJoin(
			permissionsCatalog,
			eq(rolePermissions.permissionId, permissionsCatalog.id),
		)
		.innerJoin(roleDefinitions, eq(rolePermissions.roleId, roleDefinitions.id))
		.where(
			and(
				eq(permissionsCatalog.key, "role:manage_permissions"),
				eq(roleDefinitions.workspaceId, workspaceId),
			),
		);

	if (managingRoles.length > 0) {
		return true; // Cycle: new role can manage existing managing roles, and vice versa
	}

	// No existing managing roles: safe to add as the first one
	return false;
}
