import { Badge } from "@prism/ui/components/badge";
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
import { IssueAssigneeSelect } from "../components/issue-assignee-select";
import { IssueCycleSelect } from "../components/issue-cycle-select";
import { IssueEstimateSelect } from "../components/issue-estimate-select";
import { IssueLabelSelect } from "../components/issue-label-select";
import { IssuePrioritySelect } from "../components/issue-priority-select";
import { IssueTypeSelect } from "../components/issue-type-select";
import type {
	CycleList,
	IssueActions,
	IssueDetailData,
	IssueStatusList,
	IssueTypeList,
	LabelActions,
	LabelList,
	PriorityList,
	TeamMemberList,
} from "../types";

type Props = {
	issue: IssueDetailData;
	statuses: IssueStatusList;
	priorities: PriorityList;
	issueTypes: IssueTypeList;
	labels: LabelList;
	cycles: CycleList;
	teamMembers: TeamMemberList;
	workspaceId: string;
	issueActions: Pick<
		IssueActions,
		| "update"
		| "updateIssueType"
		| "updatePriority"
		| "updateAssignee"
		| "updateCycle"
	>;
	labelActions: LabelActions;
};

export function IssuePropertyBar({
	issue,
	statuses,
	priorities,
	issueTypes,
	labels,
	cycles,
	teamMembers,
	workspaceId,
	issueActions,
	labelActions,
}: Props) {
	// State for the invalid-status dialog:
	// When changing issue type and the current status is incompatible,
	// issueActions.updateIssueType returns { ok: false, reason: 'STATUS_REQUIRED' }.
	// We capture the pending type change and let the user pick a compatible status.
	const [pendingTypeId, setPendingTypeId] = useState<string | null>(null);
	const [pendingStatusId, setPendingStatusId] = useState<string>("");
	// The subset of statuses valid for the pending type (populated on demand).
	const [dialogStatuses, setDialogStatuses] =
		useState<IssueStatusList>(statuses);

	const handleTypeChange = async (newIssueTypeId: string) => {
		try {
			const result = await issueActions.updateIssueType({
				id: issue.id,
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
				id: issue.id,
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
			<div className="flex flex-wrap gap-2">
				<IssueCycleSelect
					cycleId={issue.cycleId}
					cycles={cycles}
					currentCycle={issue.cycle}
					triggerClassName="h-fit w-fit cursor-pointer border bg-transparent px-2 py-1 text-sm shadow-none"
					onChange={(cycleId) =>
						issueActions.updateCycle({
							id: issue.id,
							workspaceId,
							cycleId,
						})
					}
				/>

				{issueTypes.length > 0 ? (
					<IssueTypeSelect
						issueTypeId={issue.issueTypeId}
						issueTypes={issueTypes}
						triggerClassName="h-fit w-fit cursor-pointer border bg-transparent px-2 py-1 text-sm shadow-none"
						showBadge={true}
						onChange={handleTypeChange}
					/>
				) : null}

				<IssuePrioritySelect
					priorityId={issue.priorityId}
					priorities={priorities}
					triggerClassName="h-fit w-fit cursor-pointer border bg-transparent px-2 py-1 text-sm shadow-none"
					showBadge={true}
					onChange={(priorityId) =>
						issueActions.updatePriority({
							id: issue.id,
							workspaceId,
							priorityId,
						})
					}
				/>

				<Select
					value={issue.statusId ?? ""}
					onValueChange={(statusId) =>
						issueActions.update({
							id: issue.id,
							workspaceId,
							statusId: statusId || undefined,
						})
					}
				>
					<SelectTrigger className="h-fit w-fit cursor-pointer border bg-transparent px-2 py-1 text-sm shadow-none">
						<SelectValue placeholder="-">
							{(value) => {
								const status = statuses.find((item) => item.id === value);
								return (
									<Badge variant="secondary">{status?.name ?? value}</Badge>
								);
							}}
						</SelectValue>
					</SelectTrigger>
					<SelectContent>
						{statuses.map((status) => (
							<SelectItem key={status.id} value={status.id}>
								{status.name}
							</SelectItem>
						))}
					</SelectContent>
				</Select>

				<IssueAssigneeSelect
					assigneeId={issue.assignee?.id ?? null}
					teamMembers={teamMembers}
					triggerClassName="h-fit w-fit cursor-pointer border px-2 py-1 text-sm shadow-none"
					showBadge={true}
					onChange={(assigneeId) =>
						issueActions.updateAssignee({
							id: issue.id,
							workspaceId,
							assigneeId,
						})
					}
				/>

				<IssueEstimateSelect
					estimate={issue.estimate}
					triggerClassName="h-fit w-fit cursor-pointer border bg-transparent px-2 py-1 text-sm shadow-none"
					showBadge={true}
					onChange={(estimate) =>
						issueActions.update({
							id: issue.id,
							workspaceId,
							estimate,
						})
					}
				/>

				<IssueLabelSelect
					labels={labels}
					value={issue.labelLinks.map((link) => link.labelId)}
					workspaceId={workspaceId}
					issueId={issue.id}
					addLabels={labelActions.addLabels}
					deleteLabels={labelActions.deleteLabels}
				/>
			</div>

			{/* Invalid-status dialog (UX-008): shown when the chosen type
			    doesn't allow the issue's current status */}
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
							The selected issue type does not allow the current status. Please
							choose a status to apply alongside the type change.
						</DialogDescription>
					</DialogHeader>
					<Select
						value={pendingStatusId}
						onValueChange={(v) => setPendingStatusId(v ?? "")}
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
