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
import { type ComponentProps, useState } from "react";
import type z from "zod";
import { IssueCreateForm } from "../form/create";

type SubmitResult = { success: true } | { error: unknown };

type IssueCreateModalProps = {
	workspaceId: string;
	teamId: string;
	priorities: Outputs["priority"]["list"];
	statuses: Outputs["issue"]["status"]["list"];
	assignees?: Outputs["teamMembership"]["list"];
	onSubmit: (issue: z.input<typeof issueCreateSchema>) => Promise<SubmitResult>;
	trigger: React.ReactNode;
	title?: string;
	description?: string;
	className?: string;
	initialStatusId?: ComponentProps<typeof IssueCreateForm>["initialStatusId"];
};

export function IssueCreateModal({
	workspaceId,
	teamId,
	priorities,
	statuses,
	assignees,
	onSubmit,
	trigger,
	title = "Create issue",
	description = "Fill in the details below.",
	className,
	initialStatusId,
}: IssueCreateModalProps) {
	const [open, setOpen] = useState(false);

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
					assignees={assignees}
					onSubmit={async (issue) => {
						const res = await onSubmit(issue);
						if ("success" in res) {
							setOpen(false);
						}
						return res;
					}}
					initialStatusId={initialStatusId}
				/>
			</DialogContent>
		</Dialog>
	);
}
