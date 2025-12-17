import type { issueCreateSchema } from "@prism/api/src/features/issues/schema";
import type { Outputs } from "@prism/api/src/router";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@prism/ui/components/dialog";
import * as React from "react";
import type z from "zod";
import { IssueCreateForm } from "../form/create";

type SubmitResult = { success: true } | { error: unknown };

type IssueCreateModalProps = {
	workspaceId: string;
	teamId: string;
	priorities: Outputs["priority"]["list"];
	statuses: Outputs["issue"]["status"]["list"];
	onSubmit: (issue: z.input<typeof issueCreateSchema>) => Promise<SubmitResult>;
	trigger: React.ReactNode;
	title?: string;
	description?: string;
	className?: string;
};

export function IssueCreateModal({
	workspaceId,
	teamId,
	priorities,
	statuses,
	onSubmit,
	trigger,
	title = "Create issue",
	description = "Fill in the details below.",
	className,
}: IssueCreateModalProps) {
	const [open, setOpen] = React.useState(false);

	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogTrigger asChild>{trigger}</DialogTrigger>
			<DialogContent className="max-w-xl">
				<DialogHeader>
					<DialogTitle>{title}</DialogTitle>
					{description ? (
						<DialogDescription>{description}</DialogDescription>
					) : null}
				</DialogHeader>
				<IssueCreateForm
					className={className}
					workspaceId={workspaceId}
					teamId={teamId}
					priorities={priorities}
					statuses={statuses}
					onSubmit={async (issue) => {
						const res = await onSubmit(issue);
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
