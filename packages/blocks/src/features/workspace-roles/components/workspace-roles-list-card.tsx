import { Badge } from "@prism/ui/components/badge";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@prism/ui/components/card";
import { cn } from "@prism/ui/lib/utils";
import type { WorkspaceRole } from "../types";

type Props = {
	roles: WorkspaceRole[];
	selectedRoleId: string | null;
	onSelectedRoleChange: (roleId: string) => void;
	className?: string;
};

export function WorkspaceRolesListCard({
	roles,
	selectedRoleId,
	onSelectedRoleChange,
	className,
}: Props) {
	return (
		<Card className={className}>
			<CardHeader>
				<CardTitle>Workspace roles</CardTitle>
				<CardDescription>
					Select a role to inspect and edit its permissions.
				</CardDescription>
			</CardHeader>
			<CardContent className="space-y-3">
				{roles.length > 0 ? (
					roles.map((role) => {
						const isSelected = role.id === selectedRoleId;

						return (
							<button
								key={role.id}
								className={cn(
									"w-full rounded-lg border px-4 py-3 text-left transition-colors",
									isSelected
										? "border-primary bg-primary/5"
										: "hover:bg-muted/40",
								)}
								onClick={() => onSelectedRoleChange(role.id)}
								type="button"
							>
								<div className="flex items-center justify-between gap-3">
									<div className="font-medium">{role.name}</div>
									<Badge variant="outline">{role.scopeLevel}</Badge>
								</div>
								<p className="mt-2 line-clamp-2 text-sm text-muted-foreground">
									{role.description ?? "No description yet."}
								</p>
							</button>
						);
					})
				) : (
					<div className="rounded-lg border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
						No workspace roles yet.
					</div>
				)}
			</CardContent>
		</Card>
	);
}
