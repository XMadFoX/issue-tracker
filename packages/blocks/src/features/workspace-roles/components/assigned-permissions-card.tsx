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
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@prism/ui/components/select";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@prism/ui/components/table";
import type { RolePermissionAssignment } from "../types";

type Props = {
	assignedPermissions: RolePermissionAssignment[];
	isPermissionsLoading?: boolean;
	onUpdatePermissionEffect: (input: {
		roleId: string;
		permissionId: string;
		constraintId: string | null;
		effect: "allow" | "deny";
	}) => Promise<void>;
	onRequestRemovePermission: (permission: RolePermissionAssignment) => void;
};

function formatResourceType(resourceType: string) {
	return resourceType
		.split("_")
		.map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
		.join(" ");
}

export function AssignedPermissionsCard({
	assignedPermissions,
	isPermissionsLoading = false,
	onUpdatePermissionEffect,
	onRequestRemovePermission,
}: Props) {
	return (
		<Card>
			<CardHeader>
				<CardTitle>Assigned permissions</CardTitle>
				<CardDescription>
					Manage the concrete permission entries attached to this role.
				</CardDescription>
			</CardHeader>
			<CardContent>
				<Table>
					<TableHeader>
						<TableRow>
							<TableHead>Permission</TableHead>
							<TableHead>Constraint</TableHead>
							<TableHead>Effect</TableHead>
							<TableHead className="text-right">Actions</TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{isPermissionsLoading ? (
							<TableRow>
								<TableCell colSpan={4} className="h-24 text-center">
									Loading permissions...
								</TableCell>
							</TableRow>
						) : assignedPermissions.length > 0 ? (
							assignedPermissions.map((permission) => (
								<TableRow
									key={`${permission.permissionId}:${permission.constraintId ?? "global"}`}
								>
									<TableCell>
										<div className="space-y-1">
											<div className="font-medium">{permission.key}</div>
											<div className="text-sm text-muted-foreground">
												{permission.description ??
													`${formatResourceType(permission.resourceType)} ${permission.action}`}
											</div>
										</div>
									</TableCell>
									<TableCell>
										{permission.constraintId ? (
											<Badge variant="outline">{permission.constraintId}</Badge>
										) : (
											<Badge variant="secondary">Global</Badge>
										)}
									</TableCell>
									<TableCell>
										<Select
											value={permission.effect}
											onValueChange={(effect) =>
												onUpdatePermissionEffect({
													roleId: permission.roleId,
													permissionId: permission.permissionId,
													constraintId: permission.constraintId,
													effect: effect === "deny" ? "deny" : "allow",
												})
											}
										>
											<SelectTrigger className="w-28">
												<SelectValue />
											</SelectTrigger>
											<SelectContent>
												<SelectItem value="allow">Allow</SelectItem>
												<SelectItem value="deny">Deny</SelectItem>
											</SelectContent>
										</Select>
									</TableCell>
									<TableCell className="text-right">
										<Button
											type="button"
											variant="ghost"
											onClick={() => onRequestRemovePermission(permission)}
										>
											Remove
										</Button>
									</TableCell>
								</TableRow>
							))
						) : (
							<TableRow>
								<TableCell colSpan={4} className="h-24 text-center">
									No permissions assigned yet.
								</TableCell>
							</TableRow>
						)}
					</TableBody>
				</Table>
			</CardContent>
		</Card>
	);
}
