import type { Inputs } from "@prism/api/src/router";
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
import { IssuePriorityCreateForm } from "../forms/priority-create-form";
import type { IssuePriorityCreateDraft, SubmitResult } from "../types";

type Props = {
	workspaceId: Inputs["priority"]["create"]["workspaceId"];
	onSubmit: (priority: IssuePriorityCreateDraft) => Promise<SubmitResult>;
	trigger: ReactElement;
	title?: string;
	description?: string;
	className?: string;
};

export function PriorityCreateModal({
	workspaceId,
	onSubmit,
	trigger,
	title = "Create priority",
	description = "Add a new issue priority and place it at the end of the current ladder.",
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
				<IssuePriorityCreateForm
					className={className}
					workspaceId={workspaceId}
					onSubmit={async (priority) => {
						const res = await onSubmit(priority);
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
