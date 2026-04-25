import { Button } from "@prism/ui/components/button";
import { Check } from "lucide-react";
import { useState } from "react";
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

	return (
		<div className="space-y-2">
			<div className="flex items-center gap-2 text-muted-foreground text-sm">
				<span>{getIssueReference(issue)}</span>
				<span>•</span>
				<span>{new Date(issue.createdAt).toLocaleDateString()}</span>
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
