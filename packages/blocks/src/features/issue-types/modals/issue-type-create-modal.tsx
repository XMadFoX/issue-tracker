import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@prism/ui/components/dialog";
import type { ReactElement } from "react";
import { useState } from "react";
import { IssueTypeCreateForm } from "../forms/issue-type-create-form";
import type { IssueTypeCreateDraft, SubmitResult } from "../types";

type Props = {
	workspaceId: string;
	teamId: string | null;
	onSubmit: (draft: IssueTypeCreateDraft) => Promise<SubmitResult>;
	trigger: ReactElement;
	title?: string;
	description?: string;
	className?: string;
};

export function IssueTypeCreateModal({
	workspaceId,
	teamId,
	onSubmit,
	trigger,
	title = "Create issue type",
	description = "Add a new issue type and place it at the end of the current ordering.",
	className,
}: Props) {
	const [open, setOpen] = useState(false);

	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogTrigger render={trigger} />
			<DialogContent className="max-w-xl">
				<DialogHeader>
					<DialogTitle>{title}</DialogTitle>
					{description ? (
						<DialogDescription>{description}</DialogDescription>
					) : null}
				</DialogHeader>
				<IssueTypeCreateForm
					className={className}
					workspaceId={workspaceId}
					teamId={teamId}
					onSubmit={async (draft) => {
						const res = await onSubmit(draft);
						if ("success" in res) {
							setOpen(false);
						}
						return res;
					}}
				/>
			</DialogContent>
		</Dialog>
	);
}
