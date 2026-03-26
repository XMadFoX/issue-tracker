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
import { RoleCreateForm } from "../forms/role-create-form";
import type { CreateWorkspaceRoleInput, SubmitResult } from "../types";

type Props = {
	workspaceId: string;
	onSubmit: (role: CreateWorkspaceRoleInput) => Promise<SubmitResult>;
	trigger: ReactElement;
	title?: string;
	description?: string;
	className?: string;
};

export function RoleCreateModal({
	workspaceId,
	onSubmit,
	trigger,
	title = "Create role",
	description = "Create a workspace role and then configure its permissions.",
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
				<RoleCreateForm
					className={className}
					workspaceId={workspaceId}
					onSubmit={async (role) => {
						const result = await onSubmit(role);

						if ("success" in result) {
							setOpen(false);
						}

						return result;
					}}
				/>
			</DialogContent>
		</Dialog>
	);
}
