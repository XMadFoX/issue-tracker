import type { teamCreateSchema } from "@prism/api/src/features/teams/schema";
import type { Inputs } from "@prism/api/src/router";
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
import { TeamCreateForm } from "../form/create";

type SubmitResult = { success: true } | { error: unknown };

type TeamCreateModalProps = {
	workspaceId: Inputs["team"]["create"]["workspaceId"];
	onSubmit: (team: z.input<typeof teamCreateSchema>) => Promise<SubmitResult>;
	trigger: React.ReactNode;
	title?: string;
	description?: string;
	className?: string;
};

export function TeamCreateModal({
	workspaceId,
	onSubmit,
	trigger,
	title = "Create team",
	description = "Fill in the details below to create a new team.",
	className,
}: TeamCreateModalProps) {
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
				<TeamCreateForm
					className={className}
					workspaceId={workspaceId}
					onSubmit={async (team) => {
						const res = await onSubmit(team);
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
