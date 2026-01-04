import type { labelCreateSchema } from "@prism/api/src/features/labels/schema";
import type { Inputs, Outputs } from "@prism/api/src/router";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@prism/ui/components/dialog";
import { useState } from "react";
import type z from "zod";
import { LabelCreateForm } from "../form/create";

type SubmitResult = { success: true } | { error: unknown };

type LabelCreateModalProps = {
	workspaceId: Inputs["label"]["create"]["workspaceId"];
	teams: Outputs["team"]["listByWorkspace"];
	initialTeamId?: Inputs["label"]["create"]["teamId"];
	onSubmit: (label: z.input<typeof labelCreateSchema>) => Promise<SubmitResult>;
	trigger: React.ReactElement;
	title?: string;
	description?: string;
	className?: string;
};

export function LabelCreateModal({
	workspaceId,
	teams,
	initialTeamId,
	onSubmit,
	trigger,
	title = "Create label",
	description = "Fill in the details below to create a new label.",
	className,
}: LabelCreateModalProps) {
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
				<LabelCreateForm
					className={className}
					workspaceId={workspaceId}
					teams={teams}
					initialTeamId={initialTeamId}
					onSubmit={async (label) => {
						const res = await onSubmit(label);
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
