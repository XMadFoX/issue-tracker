import type { Outputs } from "@prism/api/src/router";
import {
	AlertDialog,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@prism/ui/components/alert-dialog";
import { Button } from "@prism/ui/components/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@prism/ui/components/card";
import { Input } from "@prism/ui/components/input";
import { Label } from "@prism/ui/components/label";
import { AlertTriangleIcon } from "lucide-react";
import { useId, useState } from "react";

type Workspace = Outputs["workspace"]["getBySlug"];

type DeleteWorkspaceCardProps = {
	workspace: Workspace;
	isDeleting?: boolean;
	onDelete: (confirmationSlug: string) => void | Promise<void>;
};

export function DeleteWorkspaceCard({
	workspace,
	isDeleting = false,
	onDelete,
}: DeleteWorkspaceCardProps) {
	const confirmationId = useId();
	const [open, setOpen] = useState(false);
	const [confirmation, setConfirmation] = useState("");
	const confirmationMatches = confirmation === workspace.slug;

	return (
		<Card>
			<CardHeader>
				<div className="flex items-start gap-3">
					<div className="rounded-md bg-destructive/10 p-2 text-destructive">
						<AlertTriangleIcon className="size-5" />
					</div>
					<div className="space-y-1">
						<CardTitle>Delete workspace</CardTitle>
						<CardDescription>
							Permanently delete this workspace and all of its teams, issues,
							cycles, labels, priorities, issue types, and memberships.
						</CardDescription>
					</div>
				</div>
			</CardHeader>
			<CardContent className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
				<p className="max-w-xl text-sm text-muted-foreground">
					This action cannot be undone. You will be asked to type the workspace
					slug before deleting.
				</p>
				<Button
					type="button"
					variant="destructive"
					onClick={() => {
						setConfirmation("");
						setOpen(true);
					}}
				>
					Delete workspace
				</Button>
			</CardContent>

			<AlertDialog
				open={open}
				onOpenChange={(nextOpen) => {
					if (isDeleting) {
						return;
					}

					setOpen(nextOpen);
				}}
			>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>Delete {workspace.name}?</AlertDialogTitle>
						<AlertDialogDescription>
							This permanently deletes the workspace and all related data. Type{" "}
							<span className="font-medium text-foreground">
								{workspace.slug}
							</span>{" "}
							to confirm.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<div className="space-y-2">
						<Label htmlFor={confirmationId}>Workspace slug</Label>
						<Input
							id={confirmationId}
							value={confirmation}
							disabled={isDeleting}
							placeholder={workspace.slug}
							onChange={(event) => setConfirmation(event.currentTarget.value)}
						/>
					</div>
					<AlertDialogFooter>
						<AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
						<Button
							type="button"
							variant="destructive"
							disabled={!confirmationMatches || isDeleting}
							onClick={() => {
								void onDelete(confirmation);
							}}
						>
							{isDeleting ? "Deleting…" : "Delete workspace"}
						</Button>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</Card>
	);
}
