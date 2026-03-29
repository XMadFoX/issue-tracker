import type { Outputs } from "@prism/api/src/router";
import {
	type PermissionCatalogEntry,
	type RolePermissionAssignment,
	type WorkspaceRole,
	WorkspaceRolesView,
} from "@prism/blocks/src/features/workspace-roles";
import {
	useMutation,
	useQuery,
	useQueryClient,
	useSuspenseQuery,
} from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { orpc } from "src/orpc/client";

export const Route = createFileRoute("/workspace/$slug/settings/roles/")({
	component: RouteComponent,
});

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

function getNestedRecord(
	value: Record<string, unknown>,
	keys: string[],
): Record<string, unknown> | null {
	for (const key of keys) {
		const candidate = value[key];

		if (isRecord(candidate)) {
			return candidate;
		}
	}

	return null;
}

function getString(
	value: Record<string, unknown> | null,
	key: string,
): string | null {
	if (!value) {
		return null;
	}

	const candidate = value[key];

	return typeof candidate === "string" ? candidate : null;
}

function normalizeRoles(
	rows: Outputs["role"]["list"] | undefined,
): WorkspaceRole[] {
	if (!rows) {
		return [];
	}

	return rows.map((role) => ({
		id: role.id,
		name: role.name,
		description: role.description ?? null,
		scopeLevel: role.scopeLevel,
		teamId: role.teamId ?? null,
	}));
}

function normalizePermissionCatalog(
	rows: Outputs["role"]["permissions"]["catalog"] | undefined,
): PermissionCatalogEntry[] {
	if (!rows) {
		return [];
	}

	return rows.map((permission) => ({
		id: permission.id,
		key: permission.key,
		resourceType: permission.resourceType,
		action: permission.action,
		description: permission.description ?? null,
	}));
}

function normalizeAssignedPermissions(
	rows: Outputs["role"]["permissions"]["list"] | undefined,
) {
	if (!rows) {
		return [];
	}

	return rows.flatMap((row): RolePermissionAssignment[] => {
		if (!isRecord(row)) {
			return [];
		}

		const rolePermission =
			getNestedRecord(row, ["rolePermissions", "role_permissions"]) ?? row;
		const catalogEntry = getNestedRecord(row, [
			"permissionsCatalog",
			"permissions_catalog",
		]);

		const roleId = getString(rolePermission, "roleId");
		const permissionId = getString(rolePermission, "permissionId");
		const constraintId = getString(rolePermission, "constraintId");
		const effect = getString(rolePermission, "effect");
		const key = getString(catalogEntry, "key");
		const resourceType = getString(catalogEntry, "resourceType");
		const action = getString(catalogEntry, "action");
		const description = getString(catalogEntry, "description");

		if (
			!roleId ||
			!permissionId ||
			!effect ||
			!key ||
			!resourceType ||
			!action
		) {
			return [];
		}

		return [
			{
				roleId,
				permissionId,
				key,
				resourceType,
				action,
				description,
				effect: effect === "deny" ? "deny" : "allow",
				constraintId,
			},
		];
	});
}

function RouteComponent() {
	const { slug } = Route.useParams();
	const queryClient = useQueryClient();
	const [selectedRoleId, setSelectedRoleId] = useState<string | null>(null);

	const workspace = useSuspenseQuery(
		orpc.workspace.getBySlug.queryOptions({ input: { slug } }),
	);
	const roles = useQuery(
		orpc.role.list.queryOptions({
			input: { workspaceId: workspace.data.id },
		}),
	);
	const permissionCatalog = useQuery(
		orpc.role.permissions.catalog.queryOptions({
			input: { workspaceId: workspace.data.id },
		}),
	);
	const assignedPermissions = useQuery(
		orpc.role.permissions.list.queryOptions({
			input: {
				workspaceId: workspace.data.id,
				roleId: selectedRoleId ?? "",
				limit: 100,
				offset: 0,
			},
			enabled: selectedRoleId !== null,
		}),
	);

	const normalizedRoles = useMemo(
		() => normalizeRoles(roles.data),
		[roles.data],
	);
	const normalizedPermissionCatalog = useMemo(
		() => normalizePermissionCatalog(permissionCatalog.data),
		[permissionCatalog.data],
	);
	const normalizedAssignedPermissions = useMemo(
		() => normalizeAssignedPermissions(assignedPermissions.data),
		[assignedPermissions.data],
	);

	const createRole = useMutation(orpc.role.create.mutationOptions());
	const updateRole = useMutation(orpc.role.update.mutationOptions());
	const deleteRole = useMutation(orpc.role.delete.mutationOptions());
	const createPermission = useMutation(
		orpc.role.permissions.create.mutationOptions(),
	);
	const updatePermission = useMutation(
		orpc.role.permissions.update.mutationOptions(),
	);
	const deletePermission = useMutation(
		orpc.role.permissions.delete.mutationOptions(),
	);

	useEffect(() => {
		if (normalizedRoles.length === 0) {
			if (selectedRoleId !== null) {
				setSelectedRoleId(null);
			}

			return;
		}

		const selectedRoleStillExists = normalizedRoles.some(
			(role) => role.id === selectedRoleId,
		);

		if (!selectedRoleStillExists) {
			setSelectedRoleId(normalizedRoles[0]?.id ?? null);
		}
	}, [normalizedRoles, selectedRoleId]);

	const invalidateRoles = async () => {
		await queryClient.invalidateQueries({
			queryKey: orpc.role.list.queryKey({
				input: { workspaceId: workspace.data.id },
			}),
		});
	};

	const invalidatePermissions = async (roleId: string) => {
		await queryClient.invalidateQueries({
			queryKey: orpc.role.permissions.list.queryKey({
				input: {
					workspaceId: workspace.data.id,
					roleId,
					limit: 200,
					offset: 0,
				},
			}),
		});
	};

	return (
		<div className="p-6 w-full">
			<WorkspaceRolesView
				workspaceId={workspace.data.id}
				roles={normalizedRoles}
				selectedRoleId={selectedRoleId}
				onSelectedRoleChange={setSelectedRoleId}
				permissionsCatalog={normalizedPermissionCatalog}
				assignedPermissions={normalizedAssignedPermissions}
				isPermissionsLoading={assignedPermissions.isLoading}
				onCreateRole={async (input) => {
					try {
						const createdRole = await createRole.mutateAsync(input);
						await invalidateRoles();
						setSelectedRoleId(createdRole.id);
						toast.success("Role created");

						return { success: true };
					} catch (error) {
						toast.error(
							error instanceof Error ? error.message : "Failed to create role",
						);

						return { error };
					}
				}}
				onUpdateRole={async (input) => {
					try {
						await updateRole.mutateAsync({
							workspaceId: workspace.data.id,
							id: input.id,
							name: input.name,
							description: input.description,
						});
						await invalidateRoles();
					} catch (error) {
						toast.error(
							error instanceof Error ? error.message : "Failed to update role",
						);
					}
				}}
				onDeleteRole={async (roleId) => {
					try {
						await deleteRole.mutateAsync({
							workspaceId: workspace.data.id,
							id: roleId,
						});

						if (selectedRoleId === roleId) {
							const nextRole =
								normalizedRoles.find((role) => role.id !== roleId) ?? null;
							setSelectedRoleId(nextRole?.id ?? null);
						}

						await invalidateRoles();
						toast.success("Role deleted");
					} catch (error) {
						toast.error(
							error instanceof Error ? error.message : "Failed to delete role",
						);
					}
				}}
				onAssignPermission={async (input) => {
					try {
						await createPermission.mutateAsync({
							workspaceId: workspace.data.id,
							roleId: input.roleId,
							permissionId: input.permissionId,
							effect: "allow",
							attributes: {},
						});
						await invalidatePermissions(input.roleId);
					} catch (error) {
						toast.error(
							error instanceof Error
								? error.message
								: "Failed to assign permission",
						);
					}
				}}
				onUpdatePermissionEffect={async (input) => {
					try {
						await updatePermission.mutateAsync({
							workspaceId: workspace.data.id,
							roleId: input.roleId,
							permissionId: input.permissionId,
							constraintId: input.constraintId ?? undefined,
							effect: input.effect,
						});
						await invalidatePermissions(input.roleId);
					} catch (error) {
						toast.error(
							error instanceof Error
								? error.message
								: "Failed to update permission effect",
						);
					}
				}}
				onRemovePermission={async (input) => {
					try {
						await deletePermission.mutateAsync({
							workspaceId: workspace.data.id,
							roleId: input.roleId,
							permissionId: input.permissionId,
							constraintId: input.constraintId ?? undefined,
						});
						await invalidatePermissions(input.roleId);

						return { success: true };
					} catch (error) {
						toast.error(
							error instanceof Error
								? error.message
								: "Failed to remove permission",
						);

						return { error };
					}
				}}
			/>
		</div>
	);
}
