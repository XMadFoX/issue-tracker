import { Button } from "@prism/ui/components/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@prism/ui/components/dialog";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@prism/ui/components/select";
import { useState } from "react";
import { toast } from "sonner";
import type {
	IssueActions,
	IssueStatusList,
	IssueTypeAllowedStatusIdsByType,
	IssueTypeList,
} from "../types";
import { IssueTypeSelect } from "./issue-type-select";

type Props = {
	issueId: string;
	workspaceId: string;
	issueTypeId: string | null | undefined;
	statusId: string | null | undefined;
	issueTypes: IssueTypeList;
	statuses: IssueStatusList;
	allowedStatusesByIssueTypeId?: IssueTypeAllowedStatusIdsByType;
	issueActions: Pick<IssueActions, "update" | "updateIssueType">;
	triggerClassName?: string;
};

/**
 * Renders the issue-type picker for a table row, including the invalid-status
 * dialog (UX-008): when the chosen type does not allow the issue's current
 * status, `updateIssueType` returns `{ ok: false, reason: "STATUS_REQUIRED" }`
 * and the user is prompted to pick a compatible status to apply alongside the
 * type change.
 */
export function IssueTypeCell({
	issueId,
	workspaceId,
	issueTypeId,
	statusId,
	issueTypes,
	statuses,
	allowedStatusesByIssueTypeId,
	issueActions,
	triggerClassName,
}: Props) {
	const [pendingTypeId, setPendingTypeId] = useState<string | null>(null);
	const [pendingStatusId, setPendingStatusId] = useState<string>("");
	const [dialogStatuses, setDialogStatuses] =
		useState<IssueStatusList>(statuses);
	const incompatibleTypeIds = statusId
		? issueTypes
				.filter((type) => {
					const allowed = allowedStatusesByIssueTypeId?.[type.id];
					return allowed !== undefined && allowed.length > 0
						? !allowed.includes(statusId)
						: false;
				})
				.map((type) => type.id)
		: [];

	const handleTypeChange = async (newIssueTypeId: string) => {
		try {
			const result = await issueActions.updateIssueType({
				id: issueId,
				workspaceId,
				issueTypeId: newIssueTypeId,
			});

			if (!result.ok && result.reason === "STATUS_REQUIRED") {
				setDialogStatuses(result.compatibleStatuses);
				setPendingTypeId(newIssueTypeId);
				setPendingStatusId(result.compatibleStatuses[0]?.id ?? "");
			}
		} catch {
			toast.error("Failed to update issue type");
		}
	};

	const handleTypeStatusConfirm = async () => {
		if (!pendingTypeId || !pendingStatusId) return;
		try {
			await issueActions.update({
				id: issueId,
				workspaceId,
				issueTypeId: pendingTypeId,
				statusId: pendingStatusId,
			});
			setPendingTypeId(null);
		} catch {
			toast.error("Failed to update issue type and status");
		}
	};

	return (
		<>
			<IssueTypeSelect
				issueTypeId={issueTypeId}
				issueTypes={issueTypes}
				triggerClassName={triggerClassName}
				showBadge={false}
				disabledIssueTypeIds={incompatibleTypeIds}
				disabledReason="current status not allowed"
				onChange={handleTypeChange}
			/>

			<Dialog
				open={pendingTypeId !== null}
				onOpenChange={(open) => {
					if (!open) {
						setPendingTypeId(null);
						setDialogStatuses(statuses);
					}
				}}
			>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Select a compatible status</DialogTitle>
						<DialogDescription>
							This issue type cannot be used with the issue's current status.
							Choose one of the compatible statuses below to apply both changes.
						</DialogDescription>
					</DialogHeader>
					<Select
						value={pendingStatusId}
						onValueChange={(value) => setPendingStatusId(value ?? "")}
					>
						<SelectTrigger>
							<SelectValue placeholder="Select a status" />
						</SelectTrigger>
						<SelectContent>
							{dialogStatuses.map((status) => (
								<SelectItem key={status.id} value={status.id}>
									{status.name}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
					<DialogFooter>
						<Button
							type="button"
							variant="ghost"
							onClick={() => {
								setPendingTypeId(null);
								setDialogStatuses(statuses);
							}}
						>
							Cancel
						</Button>
						<Button
							type="button"
							disabled={!pendingStatusId}
							onClick={handleTypeStatusConfirm}
						>
							Confirm
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</>
	);
}
