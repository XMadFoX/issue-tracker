import type { roleCreateSchema } from "@prism/api/src/features/roles/schema";
import type z from "zod";

export type SubmitResult = { success: true } | { error: unknown };

export type WorkspaceRole = {
	id: string;
	name: string;
	description: string | null;
	scopeLevel: "workspace" | "team";
	teamId: string | null;
};

export type PermissionCatalogEntry = {
	id: string;
	key: string;
	resourceType: string;
	action: string;
	description: string | null;
};

export type RolePermissionAssignment = {
	roleId: string;
	permissionId: string;
	key: string;
	resourceType: string;
	action: string;
	description: string | null;
	effect: "allow" | "deny";
	constraintId: string | null;
};

export type CreateWorkspaceRoleInput = z.input<typeof roleCreateSchema>;
