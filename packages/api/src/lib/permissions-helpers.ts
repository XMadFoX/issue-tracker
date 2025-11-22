import { db } from "db";
import {
	permissionsCatalog,
	roleDefinitions,
	rolePermissions,
} from "db/features/abac/abac.schema";
import { workspaceMembership } from "db/features/tracker/tracker.schema";
import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";

const DEFAULT_MAX_DEPTH = 2;
const DEFAULT_MAX_ARRAY_LENGTH = 10;

// Schema for sanitized attributes
const attributesSchema = z.record(z.string(), z.unknown());

/**
 * Sanitizes attributes by stripping functions, limiting depth and array sizes to prevent abuse.
 * Ensures safe handling of untrusted input for permissions or ABAC contexts.
 * @param attrs - Input attributes to sanitize
 * @param maxDepth - Maximum recursion depth (default: 2)
 * @param maxArrayLength - Maximum array length (default: 10)
 * @returns Sanitized record with primitives, limited objects, and arrays
 */
export function sanitizeAttributes(
	attrs: Record<string, unknown> | undefined,
	maxDepth: number = DEFAULT_MAX_DEPTH,
	maxArrayLength: number = DEFAULT_MAX_ARRAY_LENGTH,
): Record<string, unknown> {
	attrs = attrs || {};
	const sanitized: Record<string, unknown> = {};
	const visited = new WeakSet<object>();

	for (const [key, value] of Object.entries(attrs)) {
		if (typeof value === "function") continue; // Strip functions
		// Limit depth: only primitive or simple objects/arrays
		if (typeof value === "object" && value !== null) {
			if (Array.isArray(value)) {
				const limitedArray =
					value.length > maxArrayLength
						? value.slice(0, maxArrayLength)
						: value;
				sanitized[key] = limitedArray.map((v) =>
					sanitizeValue(v, maxDepth, maxArrayLength, visited),
				);
			} else {
				// Recursive sanitization for objects
				sanitized[key] = sanitizeValue(
					value,
					maxDepth,
					maxArrayLength,
					visited,
				);
			}
		} else {
			sanitized[key] = value;
		}
	}

	return attributesSchema.parse(sanitized);
}

/**
 * Recursively sanitizes a value with depth limits and cycle detection.
 * @param value - Value to sanitize
 * @param depth - Remaining depth allowance
 * @param maxArrayLength - Maximum array length
 * @param visited - Set of visited objects to detect cycles
 * @returns Sanitized value
 */
function sanitizeValue(
	value: unknown,
	depth: number,
	maxArrayLength: number,
	visited: WeakSet<object>,
): unknown {
	if (depth <= 0 || typeof value !== "object" || value === null) return value;
	if (visited.has(value as object)) return null; // Break cycle
	visited.add(value as object);

	if (Array.isArray(value)) {
		const limitedArray =
			value.length > maxArrayLength ? value.slice(0, maxArrayLength) : value;
		return limitedArray.map((v) =>
			sanitizeValue(v, depth - 1, maxArrayLength, visited),
		);
	}

	const obj = Object.create(null); // Prevent prototype pollution
	for (const [k, v] of Object.entries(value)) {
		if (typeof k === "string") {
			obj[k] = sanitizeValue(v, depth - 1, maxArrayLength, visited);
		}
	}
	return obj;
}

// Helper for building where clauses in role perm ops
export function buildRolePermWhere(
	roleId: string,
	permissionId: string,
	constraintId?: string | null,
) {
	const conditions = [
		eq(rolePermissions.roleId, roleId),
		eq(rolePermissions.permissionId, permissionId),
	];
	if (constraintId) {
		conditions.push(eq(rolePermissions.constraintId, constraintId));
	} else {
		conditions.push(isNull(rolePermissions.constraintId));
	}
	return and(...conditions);
}

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
