import { Badge } from "@prism/ui/components/badge";
import { Button } from "@prism/ui/components/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@prism/ui/components/dropdown-menu";
import { Archive, ArchiveRestore, Check, MoreHorizontal } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { getIssueReference } from "../components/issue-reference";
import type { IssueActions, IssueDetailData } from "../types";

type Props = {
	issue: IssueDetailData;
	workspaceId: string;
	onUpdate: IssueActions["update"];
};

export function IssueDetailHeader({ issue, workspaceId, onUpdate }: Props) {
	const [isEditingTitle, setIsEditingTitle] = useState(false);
	const [editedTitle, setEditedTitle] = useState(issue.title);

	const handleTitleSave = async () => {
		if (editedTitle !== issue.title) {
			await onUpdate({
				id: issue.id,
				workspaceId,
				title: editedTitle,
			});
		}
		setIsEditingTitle(false);
	};

	const handleArchiveToggle = async () => {
		const nextArchivedAt = issue.archivedAt ? null : new Date();
		const previousArchivedAt = issue.archivedAt;

		try {
			await onUpdate({
				id: issue.id,
				workspaceId,
				archivedAt: nextArchivedAt,
			});
		} catch {
			toast.error(
				issue.archivedAt
					? "Failed to restore issue"
					: "Failed to archive issue",
			);
			return;
		}

		toast(issue.archivedAt ? "Issue restored" : "Issue archived", {
			action: {
				label: "Undo",
				onClick: () => {
					void onUpdate({
						id: issue.id,
						workspaceId,
						archivedAt: previousArchivedAt,
					}).catch(() => {
						toast.error("Failed to undo");
					});
				},
			},
		});
	};

	return (
		<div className="space-y-3">
			{issue.archivedAt ? (
				<div className="flex items-center justify-between gap-3 rounded-lg border border-dashed bg-muted/40 px-3 py-2 text-sm">
					<div className="flex items-center gap-2 text-muted-foreground">
						<Archive className="size-4" />
						<span>
							This issue is archived and hidden from active issue views.
						</span>
					</div>
					<Button
						type="button"
						variant="secondary"
						size="sm"
						onClick={handleArchiveToggle}
					>
						<ArchiveRestore className="size-4" />
						Restore
					</Button>
				</div>
			) : null}
			<div className="flex items-center justify-between gap-3">
				<div className="flex items-center gap-2 text-muted-foreground text-sm">
					<span>{getIssueReference(issue)}</span>
					<span>•</span>
					<span>{new Date(issue.createdAt).toLocaleDateString()}</span>
					{issue.archivedAt ? (
						<Badge variant="secondary">Archived</Badge>
					) : null}
				</div>
				{issue.archivedAt ? null : (
					<DropdownMenu>
						<DropdownMenuTrigger
							render={
								<Button type="button" variant="ghost" size="icon">
									<MoreHorizontal className="size-4" />
									<span className="sr-only">Issue actions</span>
								</Button>
							}
						/>
						<DropdownMenuContent align="end">
							<DropdownMenuItem onClick={handleArchiveToggle}>
								<Archive className="size-4" />
								Archive issue
							</DropdownMenuItem>
						</DropdownMenuContent>
					</DropdownMenu>
				)}
			</div>
			{isEditingTitle ? (
				<div className="flex items-start gap-2">
					<input
						type="text"
						value={editedTitle}
						onChange={(event) => setEditedTitle(event.target.value)}
						onKeyDown={(event) => {
							if (event.key === "Enter") {
								handleTitleSave();
							} else if (event.key === "Escape") {
								setEditedTitle(issue.title);
								setIsEditingTitle(false);
							}
						}}
						className="flex-1 border-input border-b bg-transparent py-1 font-bold text-2xl focus:border-primary focus:outline-none"
					/>
					<Button
						size="sm"
						variant="ghost"
						onClick={handleTitleSave}
						className="mt-1"
					>
						<Check className="size-4" />
					</Button>
				</div>
			) : (
				<button
					type="button"
					onClick={() => setIsEditingTitle(true)}
					className="rounded text-left font-bold text-2xl hover:underline focus:outline-none focus:ring-2 focus:ring-ring"
				>
					{issue.title}
				</button>
			)}
		</div>
	);
}
