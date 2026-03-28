import type { Inputs, Outputs } from "@prism/api/src/router";

export type SubmitResult = { success: true } | { error: unknown };

type ArrayItem<T> = T extends readonly (infer Item)[] ? Item : never;

type RoleListItem = ArrayItem<Outputs["role"]["list"]>;
type PermissionCatalogListItem = ArrayItem<
	Outputs["role"]["permissions"]["catalog"]
>;
type RolePermissionListItem = ArrayItem<Outputs["role"]["permissions"]["list"]>;

type RolePermissionFromRow<Row> = Row extends {
	rolePermissions: infer RolePermission;
}
	? RolePermission
	: Row extends {
				role_permissions: infer RolePermission;
			}
		? RolePermission
		: never;

type PermissionCatalogFromRow<Row> = Row extends {
	permissionsCatalog: infer PermissionCatalog;
}
	? PermissionCatalog
	: Row extends {
				permissions_catalog: infer PermissionCatalog;
			}
		? PermissionCatalog
		: never;

export type WorkspaceRole = Pick<
	RoleListItem,
	"id" | "name" | "description" | "scopeLevel" | "teamId"
>;

export type PermissionCatalogEntry = Pick<
	PermissionCatalogListItem,
	"id" | "key" | "resourceType" | "action" | "description"
>;

export type RolePermissionAssignment =
	RolePermissionFromRow<RolePermissionListItem> &
		PermissionCatalogFromRow<RolePermissionListItem>;

export type CreateWorkspaceRoleInput = Inputs["role"]["create"];
