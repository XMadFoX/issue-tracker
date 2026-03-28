import { Badge } from "@prism/ui/components/badge";
import { Button } from "@prism/ui/components/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
} from "@prism/ui/components/card";
import { InlineEdit } from "@prism/ui/components/inline-edit";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@prism/ui/components/tooltip";
import { Asterisk } from "lucide-react";
import type { WorkspaceRole } from "../types";

type Props = {
	role: WorkspaceRole;
	assignedPermissionsCount: number;
	hasWildcardPermission: boolean;
	onUpdateRole: (input: {
		id: string;
		name?: string;
		description?: string | null;
	}) => Promise<void>;
	onDeleteRole: (roleId: string) => Promise<void>;
	className?: string;
};

export function RoleDetailsCard({
	role,
	assignedPermissionsCount,
	hasWildcardPermission,
	onUpdateRole,
	onDeleteRole,
	className,
}: Props) {
	return (
		<Card className={className}>
			<CardHeader className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
				<div className="space-y-4">
					<div className="space-y-2">
						<CardDescription>Role name</CardDescription>
						<InlineEdit
							value={role.name}
							onSave={(name) => onUpdateRole({ id: role.id, name })}
							className="text-2xl font-semibold"
							editIconVisibility="always"
						/>
					</div>
					<div className="flex flex-wrap gap-2">
						<Badge variant="secondary">{role.scopeLevel}</Badge>
						{hasWildcardPermission ? (
							<Tooltip>
								<TooltipTrigger asChild>
									<Badge
										variant="destructive"
										className="gap-1.5 px-3 py-1 text-xs"
									>
										<Asterisk className="size-3.5" />
										Wildcard permission
									</Badge>
								</TooltipTrigger>
								<TooltipContent side="top" sideOffset={6}>
									This role has the wildcard permission, so it effectively
									grants every permission in this workspace.
								</TooltipContent>
							</Tooltip>
						) : (
							<Badge variant="outline">
								{assignedPermissionsCount} assigned permission
								{assignedPermissionsCount === 1 ? "" : "s"}
							</Badge>
						)}
					</div>
				</div>
				<Button
					type="button"
					variant="destructive"
					size="sm"
					onClick={() => onDeleteRole(role.id)}
				>
					Delete role
				</Button>
			</CardHeader>
			<CardContent className="space-y-3">
				<div className="space-y-2">
					<div className="text-sm font-medium">Description</div>
					<InlineEdit
						value={role.description ?? ""}
						onSave={(description) =>
							onUpdateRole({
								id: role.id,
								description,
							})
						}
						multiline
						placeholder="Describe what this role should be used for"
						className="w-full"
					/>
				</div>
			</CardContent>
		</Card>
	);
}
