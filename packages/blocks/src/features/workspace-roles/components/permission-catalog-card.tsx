import { Badge } from "@prism/ui/components/badge";
import { Button } from "@prism/ui/components/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@prism/ui/components/card";
import {
	Table,
	TableBody,
	TableCell,
	TableRow,
} from "@prism/ui/components/table";
import { useMemo } from "react";
import type {
	PermissionCatalogEntry,
	RolePermissionAssignment,
} from "../types";

type Props = {
	permissionsCatalog: PermissionCatalogEntry[];
	assignedPermissions: RolePermissionAssignment[];
	selectedRoleId: string;
	onAssignPermission: (input: {
		roleId: string;
		permissionId: string;
	}) => Promise<void>;
};

function formatResourceType(resourceType: string) {
	return resourceType
		.split("_")
		.map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
		.join(" ");
}

export function PermissionCatalogCard({
	permissionsCatalog,
	assignedPermissions,
	selectedRoleId,
	onAssignPermission,
}: Props) {
	const wildcardPermission = useMemo(
		() =>
			assignedPermissions.find(
				(permission) =>
					permission.key === "*" && permission.constraintId === null,
			) ?? null,
		[assignedPermissions],
	);
	const assignedPermissionById = useMemo(() => {
		const entries: Array<[string, RolePermissionAssignment]> =
			assignedPermissions
				.filter((permission) => permission.constraintId === null)
				.map((permission) => [permission.permissionId, permission]);

		return new Map(entries);
	}, [assignedPermissions]);
	const groupedCatalog = useMemo(() => {
		const nextGroups = new Map<string, PermissionCatalogEntry[]>();

		for (const permission of permissionsCatalog) {
			const currentGroup = nextGroups.get(permission.resourceType) ?? [];
			currentGroup.push(permission);
			nextGroups.set(permission.resourceType, currentGroup);
		}

		return [...nextGroups.entries()];
	}, [permissionsCatalog]);

	return (
		<Card>
			<CardHeader>
				<CardTitle>Permission catalog</CardTitle>
				<CardDescription>
					Add new workspace permissions to this role.
				</CardDescription>
			</CardHeader>
			<CardContent className="space-y-6">
				{groupedCatalog.map(([resourceType, permissions]) => (
					<div key={resourceType} className="space-y-3">
						<div className="flex items-center justify-between gap-3">
							<h3 className="text-sm font-semibold tracking-wide uppercase text-muted-foreground">
								{formatResourceType(resourceType)}
							</h3>
							<Badge variant="outline">
								{permissions.length} permission
								{permissions.length === 1 ? "" : "s"}
							</Badge>
						</div>
						<div className="overflow-hidden rounded-lg border">
							<Table>
								<TableBody>
									{permissions.map((permission) => {
										const assignedPermission = assignedPermissionById.get(
											permission.id,
										);
										const isCoveredByWildcard =
											wildcardPermission !== null && permission.key !== "*";

										return (
											<TableRow key={permission.id}>
												<TableCell>
													<div className="space-y-1">
														<div className="font-medium">{permission.key}</div>
														<div className="text-sm text-muted-foreground">
															{permission.description ??
																`${formatResourceType(permission.resourceType)} ${permission.action}`}
														</div>
													</div>
												</TableCell>
												<TableCell className="w-40 text-right">
													{assignedPermission ? (
														<Badge variant="secondary">
															{assignedPermission.effect}
														</Badge>
													) : isCoveredByWildcard ? (
														<Badge variant="outline">Granted via *</Badge>
													) : (
														<Button
															type="button"
															variant="outline"
															size="sm"
															onClick={() =>
																onAssignPermission({
																	roleId: selectedRoleId,
																	permissionId: permission.id,
																})
															}
														>
															Add
														</Button>
													)}
												</TableCell>
											</TableRow>
										);
									})}
								</TableBody>
							</Table>
						</div>
					</div>
				))}
			</CardContent>
		</Card>
	);
}
