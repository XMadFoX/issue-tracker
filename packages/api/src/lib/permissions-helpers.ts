import { db } from "db";
import {
	entityAttributes,
	permissionsCatalog,
	policyConstraints,
	roleAssignments,
	roleDefinitions,
	rolePermissions,
} from "db/features/abac/abac.schema";
import {
	team,
	teamMembership,
	workspaceMembership,
} from "db/features/tracker/tracker.schema";
import { and, eq, inArray, isNotNull, isNull } from "drizzle-orm";
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

function mapEntityAttributes(rows: Array<{ key: string; value: unknown }>) {
	const attributes: Record<string, unknown> = {};
	for (const row of rows) {
		attributes[row.key] = row.value;
	}
	return attributes;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toAttributes(value: unknown) {
	return isRecord(value) ? value : {};
}

function predicateAllows(
	predicateJson: unknown,
	subjectAttributes: Record<string, unknown>,
) {
	if (predicateJson == null) return true;
	if (!isRecord(predicateJson)) return false;
	if (predicateJson.always === true) return true;

	const subject = predicateJson.subject;
	if (!isRecord(subject)) return false;

	const attributeEquals = subject.attribute_equals;
	if (!isRecord(attributeEquals)) return false;

	return Object.entries(attributeEquals).every(
		([key, value]) => subjectAttributes[key] === value,
	);
}

function permissionMatchesKey(
	permission: {
		key: string | null;
		resourceType: string | null;
		action: string | null;
	},
	permissionKey: string,
) {
	const [reqResource, reqAction] = permissionKey.split(":");
	if (!reqResource || !reqAction) return false;

	const matchesByKey = (() => {
		if (!permission.key) return false;
		if (permission.key === permissionKey) return true;
		if (permission.key === "*") return true;
		if (!permission.key.includes(":")) return false;

		const [resource, action] = permission.key.split(":");
		if (resource === "*" && action === "*") return true;
		if (resource === "*" && action === reqAction) return true;
		if (resource === reqResource && action === "*") return true;
		return resource === reqResource && action === reqAction;
	})();

	const matchesByColumns = (() => {
		if (!permission.resourceType || !permission.action) return false;
		if (permission.resourceType === "*" && permission.action === "*")
			return true;
		if (permission.resourceType === "*" && permission.action === reqAction)
			return true;
		if (permission.resourceType === reqResource && permission.action === "*")
			return true;
		return (
			permission.resourceType === reqResource && permission.action === reqAction
		);
	})();

	return matchesByKey || matchesByColumns;
}

export async function getReadableTeamIdsForPermission({
	userId,
	workspaceId,
	permissionKey,
}: {
	userId: string;
	workspaceId: string;
	permissionKey: string;
}) {
	const workspaceTeams = await db
		.select({ id: team.id })
		.from(team)
		.where(eq(team.workspaceId, workspaceId));

	const workspaceTeamIds = workspaceTeams.map(
		(workspaceTeam) => workspaceTeam.id,
	);
	if (workspaceTeamIds.length === 0) return [];

	const [workspaceMembershipRow] = await db
		.select({
			roleId: workspaceMembership.roleId,
			attributes: workspaceMembership.attributes,
		})
		.from(workspaceMembership)
		.where(
			and(
				eq(workspaceMembership.userId, userId),
				eq(workspaceMembership.workspaceId, workspaceId),
				eq(workspaceMembership.status, "active"),
			),
		)
		.limit(1);

	const teamMembershipRows = await db
		.select({
			teamId: teamMembership.teamId,
			roleId: teamMembership.roleId,
			attributes: teamMembership.attributes,
		})
		.from(teamMembership)
		.innerJoin(team, eq(teamMembership.teamId, team.id))
		.where(
			and(
				eq(teamMembership.userId, userId),
				eq(team.workspaceId, workspaceId),
				eq(teamMembership.status, "active"),
			),
		);

	const teamAssignmentRows = await db
		.select({
			teamId: roleAssignments.teamId,
			roleId: roleAssignments.roleId,
			attributes: roleAssignments.attributes,
		})
		.from(roleAssignments)
		.where(
			and(
				eq(roleAssignments.userId, userId),
				eq(roleAssignments.workspaceId, workspaceId),
				isNotNull(roleAssignments.teamId),
			),
		);

	const roleIdsByTeamId = new Map<string, Set<string>>();
	const teamMembershipAttributesByTeamId = new Map<
		string,
		Record<string, unknown>
	>();
	const assignmentAttributesByTeamId = new Map<
		string,
		Record<string, unknown>
	>();

	for (const teamId of workspaceTeamIds) {
		const roleIds = new Set<string>();
		if (workspaceMembershipRow?.roleId)
			roleIds.add(workspaceMembershipRow.roleId);
		roleIdsByTeamId.set(teamId, roleIds);
	}

	for (const membership of teamMembershipRows) {
		roleIdsByTeamId.get(membership.teamId)?.add(membership.roleId);
		teamMembershipAttributesByTeamId.set(
			membership.teamId,
			toAttributes(membership.attributes),
		);
	}

	for (const assignment of teamAssignmentRows) {
		if (!assignment.teamId) continue;

		roleIdsByTeamId.get(assignment.teamId)?.add(assignment.roleId);
		assignmentAttributesByTeamId.set(assignment.teamId, {
			...(assignmentAttributesByTeamId.get(assignment.teamId) ?? {}),
			...toAttributes(assignment.attributes),
		});
	}

	const roleIds = Array.from(
		new Set(
			Array.from(roleIdsByTeamId.values()).flatMap((teamRoleIds) =>
				Array.from(teamRoleIds),
			),
		),
	);
	if (roleIds.length === 0) return [];

	const permissionRows = await db
		.select({
			roleId: rolePermissions.roleId,
			effect: rolePermissions.effect,
			key: permissionsCatalog.key,
			resourceType: permissionsCatalog.resourceType,
			action: permissionsCatalog.action,
			predicateJson: policyConstraints.predicateJson,
		})
		.from(rolePermissions)
		.where(inArray(rolePermissions.roleId, roleIds))
		.leftJoin(
			permissionsCatalog,
			eq(rolePermissions.permissionId, permissionsCatalog.id),
		)
		.leftJoin(
			policyConstraints,
			eq(rolePermissions.constraintId, policyConstraints.id),
		);

	const matchingPermissions = permissionRows.filter((permission) =>
		permissionMatchesKey(permission, permissionKey),
	);
	if (matchingPermissions.length === 0) return [];

	const hasConstrainedPermissions = matchingPermissions.some(
		(permission) => permission.predicateJson != null,
	);
	const attributeRows = hasConstrainedPermissions
		? await db
				.select({
					entityType: entityAttributes.entityType,
					entityId: entityAttributes.entityId,
					key: entityAttributes.key,
					value: entityAttributes.value,
				})
				.from(entityAttributes)
				.where(
					and(
						inArray(entityAttributes.entityType, ["user", "workspace", "team"]),
						inArray(entityAttributes.entityId, [
							userId,
							workspaceId,
							...workspaceTeamIds,
						]),
					),
				)
		: [];

	const userAttributes = mapEntityAttributes(
		attributeRows.filter(
			(row) => row.entityType === "user" && row.entityId === userId,
		),
	);
	const workspaceAttributes = mapEntityAttributes(
		attributeRows.filter(
			(row) => row.entityType === "workspace" && row.entityId === workspaceId,
		),
	);
	const teamAttributesByTeamId = new Map<string, Record<string, unknown>>();
	for (const teamId of workspaceTeamIds) {
		teamAttributesByTeamId.set(
			teamId,
			mapEntityAttributes(
				attributeRows.filter(
					(row) => row.entityType === "team" && row.entityId === teamId,
				),
			),
		);
	}

	const readableTeamIds: Array<string> = [];
	for (const teamId of workspaceTeamIds) {
		const teamRoleIds = roleIdsByTeamId.get(teamId);
		if (!teamRoleIds || teamRoleIds.size === 0) continue;

		const subjectAttributes = {
			...toAttributes(workspaceMembershipRow?.attributes),
			...(teamMembershipAttributesByTeamId.get(teamId) ?? {}),
			...(assignmentAttributesByTeamId.get(teamId) ?? {}),
			...userAttributes,
			...workspaceAttributes,
			...(teamAttributesByTeamId.get(teamId) ?? {}),
		};

		let hasAllow = false;
		let hasDeny = false;

		for (const permission of matchingPermissions) {
			if (!teamRoleIds.has(permission.roleId)) continue;
			if (!predicateAllows(permission.predicateJson, subjectAttributes))
				continue;

			if (permission.effect === "deny") {
				hasDeny = true;
				break;
			}

			if (permission.effect === "allow") {
				hasAllow = true;
			}
		}

		if (hasAllow && !hasDeny) readableTeamIds.push(teamId);
	}

	return readableTeamIds;
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
