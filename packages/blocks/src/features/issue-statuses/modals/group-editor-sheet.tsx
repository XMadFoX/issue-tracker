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
import { GroupForm } from "../forms/group-form";
import type {
	IssueStatusGroup,
	IssueStatusGroupCreateDraft,
	IssueStatusGroupUpdateInput,
	SubmitHandler,
} from "../types";

type Props = {
	workspaceId: string;
	group?: IssueStatusGroup;
	statusCount?: number;
	trigger: ReactNode;
	onSubmit: SubmitHandler<
		IssueStatusGroupCreateDraft | IssueStatusGroupUpdateInput
	>;
	onDelete?: (group: IssueStatusGroup) => void;
};

export function GroupEditorSheet({
	workspaceId,
	group,
	statusCount = 0,
	trigger,
	onSubmit,
	onDelete,
}: Props) {
	const [open, setOpen] = useState(false);
	const canDelete = !!group?.isEditable && statusCount === 0;
	return (
		<Drawer direction="right" open={open} onOpenChange={setOpen}>
			<DrawerTrigger asChild>{trigger}</DrawerTrigger>
			<DrawerContent>
				<DrawerHeader>
					<DrawerTitle>{group ? "Edit group" : "Add group"}</DrawerTitle>
					<DrawerDescription>
						{group
							? "Update an editable workflow group."
							: "Create a custom workflow group."}
					</DrawerDescription>
				</DrawerHeader>
				<div className="flex flex-1 flex-col gap-4 overflow-y-auto p-4 pt-0">
					{group && !group.isEditable ? (
						<p className="rounded-md border p-3 text-sm text-muted-foreground">
							System groups are locked and cannot be edited.
						</p>
					) : (
						<GroupForm
							workspaceId={workspaceId}
							group={group}
							onSubmit={async (input) => {
								const result = await onSubmit(input);
								if ("success" in result) setOpen(false);
								return result;
							}}
						/>
					)}
					{group && onDelete ? (
						<Button
							type="button"
							variant="destructive"
							disabled={!canDelete}
							onClick={() => onDelete(group)}
						>
							<Trash2 className="size-4" />
							Delete group
						</Button>
					) : null}
					{group?.isEditable && statusCount > 0 ? (
						<p className="text-sm text-muted-foreground">
							Move or delete statuses before deleting this group.
						</p>
					) : null}
				</div>
			</DrawerContent>
		</Drawer>
	);
}
