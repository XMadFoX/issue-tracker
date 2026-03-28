import { Button } from "@prism/ui/components/button";
import {
	Card,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@prism/ui/components/card";
import { ConfirmActionDialog } from "@prism/ui/components/confirm-action-dialog";
import {
	GLOBAL_CONFIRM_ACTIONS_SKIP_STORAGE_KEY,
	usePersistedBoolean,
} from "@prism/ui/hooks/use-persisted-boolean";
import { Plus } from "lucide-react";
import { useMemo, useState } from "react";
import {
	AssignedPermissionsCard,
	PermissionCatalogCard,
	RoleDetailsCard,
	WorkspaceRolesListCard,
} from "../components";
import { RoleCreateModal } from "../modals/role-create-modal";
import type {
	CreateWorkspaceRoleInput,
	PermissionCatalogEntry,
	RolePermissionAssignment,
	SubmitResult,
	WorkspaceRole,
} from "../types";

type Props = {
	workspaceId: string;
	roles: WorkspaceRole[];
	selectedRoleId: string | null;
	onSelectedRoleChange: (roleId: string) => void;
	permissionsCatalog: PermissionCatalogEntry[];
	assignedPermissions: RolePermissionAssignment[];
	onCreateRole: (role: CreateWorkspaceRoleInput) => Promise<SubmitResult>;
	onUpdateRole: (input: {
		id: string;
		name?: string;
		description?: string | null;
	}) => Promise<void>;
	onDeleteRole: (roleId: string) => Promise<void>;
	onAssignPermission: (input: {
		roleId: string;
		permissionId: string;
	}) => Promise<void>;
	onUpdatePermissionEffect: (input: {
		roleId: string;
		permissionId: string;
		constraintId: string | null;
		effect: "allow" | "deny";
	}) => Promise<void>;
	onRemovePermission: (input: {
		roleId: string;
		permissionId: string;
		constraintId: string | null;
	}) => Promise<SubmitResult>;
	isPermissionsLoading?: boolean;
};

export function WorkspaceRolesView({
	workspaceId,
	roles,
	selectedRoleId,
	onSelectedRoleChange,
	permissionsCatalog,
	assignedPermissions,
	onCreateRole,
	onUpdateRole,
	onDeleteRole,
	onAssignPermission,
	onUpdatePermissionEffect,
	onRemovePermission,
	isPermissionsLoading = false,
}: Props) {
	const [skipConfirmActions, setSkipConfirmActions] = usePersistedBoolean(
		GLOBAL_CONFIRM_ACTIONS_SKIP_STORAGE_KEY,
		false,
	);
	const [pendingPermissionRemoval, setPendingPermissionRemoval] =
		useState<RolePermissionAssignment | null>(null);
	const [rememberSkipChoice, setRememberSkipChoice] = useState(false);
	const [isRemovingPermission, setIsRemovingPermission] = useState(false);
	const selectedRole = useMemo(
		() => roles.find((role) => role.id === selectedRoleId) ?? null,
		[roles, selectedRoleId],
	);
	const wildcardPermission = useMemo(
		() =>
			assignedPermissions.find(
				(permission) =>
					permission.key === "*" && permission.constraintId === null,
			) ?? null,
		[assignedPermissions],
	);

	const pendingPermissionScope = pendingPermissionRemoval?.constraintId
		? `constraint "${pendingPermissionRemoval.constraintId}"`
		: "global scope";

	const handleRemovePermission = async (
		permission: RolePermissionAssignment,
	) => {
		return onRemovePermission({
			roleId: permission.roleId,
			permissionId: permission.permissionId,
			constraintId: permission.constraintId,
		});
	};

	const handleRequestRemovePermission = async (
		permission: RolePermissionAssignment,
	) => {
		if (skipConfirmActions) {
			await handleRemovePermission(permission);

			return;
		}

		setRememberSkipChoice(false);
		setPendingPermissionRemoval(permission);
	};

	const handleConfirmPermissionRemoval = async () => {
		if (!pendingPermissionRemoval || isRemovingPermission) {
			return;
		}

		setIsRemovingPermission(true);

		const result = await handleRemovePermission(pendingPermissionRemoval);

		setIsRemovingPermission(false);

		if ("success" in result) {
			if (rememberSkipChoice) {
				setSkipConfirmActions(true);
			}

			setPendingPermissionRemoval(null);
			setRememberSkipChoice(false);
		}
	};

	return (
		<div className="space-y-6 w-full">
			<div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
				<div className="space-y-1">
					<h1 className="text-2xl font-semibold tracking-tight">
						Roles & permissions
					</h1>
					<p className="text-sm text-muted-foreground">
						Create workspace roles and define the permissions each role grants.
					</p>
				</div>
				<RoleCreateModal
					workspaceId={workspaceId}
					onSubmit={onCreateRole}
					trigger={
						<Button size="sm">
							<Plus className="size-4" />
							Create role
						</Button>
					}
				/>
			</div>

			<div className="grid gap-6 xl:grid-cols-[320px_minmax(0,1fr)]">
				<WorkspaceRolesListCard
					roles={roles}
					selectedRoleId={selectedRoleId}
					onSelectedRoleChange={onSelectedRoleChange}
				/>

				{selectedRole ? (
					<div className="space-y-6">
						<RoleDetailsCard
							role={selectedRole}
							assignedPermissionsCount={assignedPermissions.length}
							hasWildcardPermission={wildcardPermission !== null}
							onUpdateRole={onUpdateRole}
							onDeleteRole={onDeleteRole}
						/>
						<AssignedPermissionsCard
							assignedPermissions={assignedPermissions}
							isPermissionsLoading={isPermissionsLoading}
							onUpdatePermissionEffect={onUpdatePermissionEffect}
							onRequestRemovePermission={(permission) => {
								void handleRequestRemovePermission(permission);
							}}
						/>
						<PermissionCatalogCard
							permissionsCatalog={permissionsCatalog}
							assignedPermissions={assignedPermissions}
							selectedRoleId={selectedRole.id}
							onAssignPermission={onAssignPermission}
						/>
					</div>
				) : (
					<Card>
						<CardHeader>
							<CardTitle>Select a role</CardTitle>
							<CardDescription>
								Choose a role from the list to edit its details and permissions.
							</CardDescription>
						</CardHeader>
					</Card>
				)}
			</div>
			<ConfirmActionDialog
				open={pendingPermissionRemoval !== null}
				onOpenChange={(open) => {
					if (open || isRemovingPermission) {
						return;
					}

					setPendingPermissionRemoval(null);
					setRememberSkipChoice(false);
				}}
				title="Remove permission?"
				description={
					pendingPermissionRemoval
						? `This will remove "${pendingPermissionRemoval.key}" from this role for ${pendingPermissionScope}.`
						: "This will remove this permission from the role."
				}
				confirmLabel="Remove permission"
				confirmingLabel="Removing..."
				onConfirm={handleConfirmPermissionRemoval}
				isConfirming={isRemovingPermission}
				showRememberChoice
				rememberChoice={rememberSkipChoice}
				onRememberChoiceChange={setRememberSkipChoice}
				rememberChoiceLabel="Don't show this confirmation again"
			/>
		</div>
	);
}
