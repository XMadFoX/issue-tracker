import { Button } from "@prism/ui/components/button";
import {
	Drawer,
	DrawerContent,
	DrawerDescription,
	DrawerHeader,
	DrawerTitle,
	DrawerTrigger,
} from "@prism/ui/components/drawer";
import { Trash2 } from "lucide-react";
import type { ReactNode } from "react";
import { useState } from "react";
import { StatusForm } from "../forms/status-form";
import type {
	IssueStatus,
	IssueStatusCreateDraft,
	IssueStatusGroup,
	IssueStatusUpdateInput,
	SubmitHandler,
	Team,
	WorkflowScopeValue,
} from "../types";

type Props = {
	workspaceId: string;
	groups: IssueStatusGroup[];
	teams: Team[];
	scope: WorkflowScopeValue;
	status?: IssueStatus;
	defaultGroupId?: string;
	trigger: ReactNode;
	onSubmit: SubmitHandler<IssueStatusCreateDraft | IssueStatusUpdateInput>;
	onDelete?: (status: IssueStatus) => void;
};

export function StatusEditorSheet({
	workspaceId,
	groups,
	teams,
	scope,
	status,
	defaultGroupId,
	trigger,
	onSubmit,
	onDelete,
}: Props) {
	const [open, setOpen] = useState(false);
	return (
		<Drawer direction="right" open={open} onOpenChange={setOpen}>
			<DrawerTrigger asChild>{trigger}</DrawerTrigger>
			<DrawerContent>
				<DrawerHeader>
					<DrawerTitle>{status ? "Edit status" : "Add status"}</DrawerTitle>
					<DrawerDescription>
						{status
							? "Update this workflow status."
							: "Create a status in the workspace workflow."}
					</DrawerDescription>
				</DrawerHeader>
				<div className="flex flex-1 flex-col gap-4 overflow-y-auto p-4 pt-0">
					<StatusForm
						workspaceId={workspaceId}
						groups={groups}
						teams={teams}
						scope={scope}
						status={status}
						defaultGroupId={defaultGroupId}
						onSubmit={async (input) => {
							const result = await onSubmit(input);
							if ("success" in result) setOpen(false);
							return result;
						}}
					/>
					{status && onDelete ? (
						<Button
							type="button"
							variant="destructive"
							onClick={() => onDelete(status)}
						>
							<Trash2 className="size-4" />
							Delete status
						</Button>
					) : null}
				</div>
			</DrawerContent>
		</Drawer>
	);
}
