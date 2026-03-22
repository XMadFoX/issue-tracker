import { createId } from "@paralleldrive/cuid2";
import type { db } from "db";
import {
	permissionsCatalog,
	roleDefinitions,
	rolePermissions,
} from "db/features/abac/abac.schema";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { permissionCatalogEntries } from "../permissions/catalog";

type DbTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
type DbExecutor = typeof db | DbTransaction;

export const BUILT_IN_WORKSPACE_ROLE_NAMES = {
	admin: "admin",
	member: "member",
} as const;

export const BUILT_IN_TEAM_ROLE_NAMES = {
	lead: "lead",
	member: "member",
} as const;

const WORKSPACE_MEMBER_PERMISSION_KEYS = [
	"workspace:read",
	"issue_priority:read",
	"issue_status:read",
	"issue_status_group:read",
] as const;

const TEAM_MEMBER_PERMISSION_KEYS = [
	"team:read",
	"team:read_members",
	"issue:read",
	"issue:create",
	"issue:update",
	"label:read",
] as const;

const TEAM_LEAD_PERMISSION_KEYS = [
	...TEAM_MEMBER_PERMISSION_KEYS,
	"team:manage_members",
	"label:create",
	"label:update",
	"label:delete",
	"issue:delete",
	"issue_priority:create",
	"issue_priority:update",
	"issue_priority:delete",
	"issue_priority:reorder",
	"issue_status:create",
	"issue_status:update",
	"issue_status:delete",
	"issue_status:reorder",
	"issue_status_group:create",
	"issue_status_group:update",
	"issue_status_group:delete",
	"issue_status_group:reorder",
] as const;

async function getRoleByNameInsensitive({
	executor,
	workspaceId,
	name,
	teamId,
}: {
	executor: DbExecutor;
	workspaceId: string;
	name: string;
	teamId?: string | null;
}) {
	const [role] = await executor
		.select({
			id: roleDefinitions.id,
			name: roleDefinitions.name,
		})
		.from(roleDefinitions)
		.where(
			and(
				eq(roleDefinitions.workspaceId, workspaceId),
				eq(sql<string>`lower(${roleDefinitions.name})`, name),
				teamId
					? eq(roleDefinitions.teamId, teamId)
					: isNull(roleDefinitions.teamId),
			),
		);

	return role ?? null;
}

async function acquireSeedLock(executor: DbExecutor, key: string) {
	await executor.execute(sql`select pg_advisory_xact_lock(hashtext(${key}))`);
}

async function ensureRolePermissions({
	executor,
	roleId,
	permissionKeys,
}: {
	executor: DbExecutor;
	roleId: string;
	permissionKeys: readonly string[];
}) {
	if (permissionKeys.length === 0) {
		return;
	}

	const permissions = await executor
		.select({
			id: permissionsCatalog.id,
			key: permissionsCatalog.key,
		})
		.from(permissionsCatalog)
		.where(inArray(permissionsCatalog.key, [...permissionKeys]));

	const permissionIdsByKey = new Map(
		permissions.map((permission) => [permission.key, permission.id]),
	);

	for (const permissionKey of permissionKeys) {
		const permissionId = permissionIdsByKey.get(permissionKey);

		if (!permissionId) {
			throw new Error(`Missing permission catalog entry for ${permissionKey}`);
		}

		const [existingPermission] = await executor
			.select({
				roleId: rolePermissions.roleId,
			})
			.from(rolePermissions)
			.where(
				and(
					eq(rolePermissions.roleId, roleId),
					eq(rolePermissions.permissionId, permissionId),
					isNull(rolePermissions.constraintId),
				),
			);

		if (existingPermission) {
			continue;
		}

		await executor.insert(rolePermissions).values({
			roleId,
			permissionId,
			effect: "allow",
			constraintId: null,
			attributes: {},
		});
	}
}

export async function ensurePermissionCatalog(executor: DbExecutor) {
	for (const permission of permissionCatalogEntries) {
		await executor
			.insert(permissionsCatalog)
			.values({
				id: createId(),
				...permission,
			})
			.onConflictDoNothing?.();
	}
}

export async function ensureWorkspaceBuiltInRoles({
	executor,
	workspaceId,
	createdBy,
}: {
	executor: DbExecutor;
	workspaceId: string;
	createdBy: string;
}) {
	await acquireSeedLock(executor, `workspace-built-in-roles:${workspaceId}`);
	await ensurePermissionCatalog(executor);

	let adminRole = await getRoleByNameInsensitive({
		executor,
		workspaceId,
		name: BUILT_IN_WORKSPACE_ROLE_NAMES.admin,
	});

	if (!adminRole) {
		const [createdRole] = await executor
			.insert(roleDefinitions)
			.values({
				id: createId(),
				workspaceId,
				scopeLevel: "workspace",
				teamId: null,
				name: BUILT_IN_WORKSPACE_ROLE_NAMES.admin,
				createdBy,
				attributes: {},
			})
			.returning({
				id: roleDefinitions.id,
				name: roleDefinitions.name,
			});

		if (!createdRole) {
			throw new Error("Failed to create workspace admin role");
		}

		adminRole = createdRole;
	}

	await ensureRolePermissions({
		executor,
		roleId: adminRole.id,
		permissionKeys: ["*"],
	});

	let memberRole = await getRoleByNameInsensitive({
		executor,
		workspaceId,
		name: BUILT_IN_WORKSPACE_ROLE_NAMES.member,
	});

	if (!memberRole) {
		const [createdRole] = await executor
			.insert(roleDefinitions)
			.values({
				id: createId(),
				workspaceId,
				scopeLevel: "workspace",
				teamId: null,
				name: BUILT_IN_WORKSPACE_ROLE_NAMES.member,
				createdBy,
				attributes: {},
			})
			.returning({
				id: roleDefinitions.id,
				name: roleDefinitions.name,
			});

		if (!createdRole) {
			throw new Error("Failed to create workspace member role");
		}

		memberRole = createdRole;
	}

	await ensureRolePermissions({
		executor,
		roleId: memberRole.id,
		permissionKeys: WORKSPACE_MEMBER_PERMISSION_KEYS,
	});

	return {
		adminRoleId: adminRole.id,
		memberRoleId: memberRole.id,
	};
}

export async function ensureTeamBuiltInRoles({
	executor,
	workspaceId,
	teamId,
	createdBy,
}: {
	executor: DbExecutor;
	workspaceId: string;
	teamId: string;
	createdBy: string;
}) {
	await acquireSeedLock(executor, `team-built-in-roles:${teamId}`);
	await ensurePermissionCatalog(executor);

	let leadRole = await getRoleByNameInsensitive({
		executor,
		workspaceId,
		name: BUILT_IN_TEAM_ROLE_NAMES.lead,
		teamId,
	});

	if (!leadRole) {
		const [createdRole] = await executor
			.insert(roleDefinitions)
			.values({
				id: createId(),
				workspaceId,
				scopeLevel: "team",
				teamId,
				name: BUILT_IN_TEAM_ROLE_NAMES.lead,
				createdBy,
				attributes: {},
			})
			.returning({
				id: roleDefinitions.id,
				name: roleDefinitions.name,
			});

		if (!createdRole) {
			throw new Error("Failed to create team lead role");
		}

		leadRole = createdRole;
	}

	await ensureRolePermissions({
		executor,
		roleId: leadRole.id,
		permissionKeys: TEAM_LEAD_PERMISSION_KEYS,
	});

	let memberRole = await getRoleByNameInsensitive({
		executor,
		workspaceId,
		name: BUILT_IN_TEAM_ROLE_NAMES.member,
		teamId,
	});

	if (!memberRole) {
		const [createdRole] = await executor
			.insert(roleDefinitions)
			.values({
				id: createId(),
				workspaceId,
				scopeLevel: "team",
				teamId,
				name: BUILT_IN_TEAM_ROLE_NAMES.member,
				createdBy,
				attributes: {},
			})
			.returning({
				id: roleDefinitions.id,
				name: roleDefinitions.name,
			});

		if (!createdRole) {
			throw new Error("Failed to create team member role");
		}

		memberRole = createdRole;
	}

	await ensureRolePermissions({
		executor,
		roleId: memberRole.id,
		permissionKeys: TEAM_MEMBER_PERMISSION_KEYS,
	});

	return {
		leadRoleId: leadRole.id,
		memberRoleId: memberRole.id,
	};
}
