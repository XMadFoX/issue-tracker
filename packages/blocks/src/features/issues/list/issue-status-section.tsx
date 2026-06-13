import { useDroppable } from "@dnd-kit/core";
import { Badge } from "@prism/ui/components/badge";
import { Button } from "@prism/ui/components/button";
import { Plus } from "lucide-react";
import { IssueCreateModal } from "../modal/issue-create-modal";
import type {
	CycleList,
	IssueActions,
	IssueListData,
	IssueListItem,
	IssueNavigation,
	IssueStatusList,
	LabelActions,
	LabelList,
	PriorityList,
	TeamMemberList,
} from "../types";
import { IssuesTable } from "./issues-table";

export const ISSUE_STATUS_DROP_ID_PREFIX = "issue-status:";

function CreateIssueButton() {
	return (
		<Button variant="ghost" size="icon" type="button" className="ml-auto p-2">
			<Plus className="size-3" />
		</Button>
	);
}

function EmptyStatusDropZone({ statusId }: { statusId: string }) {
	const { isOver, setNodeRef } = useDroppable({
		id: `${ISSUE_STATUS_DROP_ID_PREFIX}${statusId}`,
	});

	return (
		<div
			ref={setNodeRef}
			className={`rounded-md border border-dashed px-4 py-6 text-center text-muted-foreground text-sm transition-colors ${
				isOver ? "border-primary bg-primary/10 text-foreground" : ""
			}`}
		>
			Drop issue here
		</div>
	);
}

type Props = {
	status: IssueStatusList[number];
	statusIssues: IssueListData;
	statuses: IssueStatusList;
	workspaceId: string;
	teamId: string;
	priorities: PriorityList;
	labels: LabelList;
	teamMembers: TeamMemberList;
	cycles: CycleList;
	issueActions: Pick<
		IssueActions,
		"create" | "update" | "updatePriority" | "updateAssignee" | "updateCycle"
	>;
	labelActions: LabelActions;
	navigation?: IssueNavigation;
	subIssuesByParentId: Map<string, Array<IssueListItem>>;
};

export function IssueStatusSection({
	status,
	statusIssues,
	statuses,
	workspaceId,
	teamId,
	priorities,
	labels,
	teamMembers,
	cycles,
	issueActions,
	labelActions,
	navigation,
	subIssuesByParentId,
}: Props) {
	return (
		<div className="space-y-4">
			<div className="flex items-center gap-2 px-1">
				<div
					className="size-2.5 rounded-full"
					style={{ backgroundColor: status.color ?? "#ccc" }}
				/>
				<h2 className="font-semibold text-muted-foreground text-sm uppercase tracking-wider">
					{status.name}
				</h2>
				<Badge variant="secondary" className="ml-1 h-5 px-1.5 py-0">
					{statusIssues.length}
				</Badge>
				<IssueCreateModal
					workspaceId={workspaceId}
					teamId={teamId}
					priorities={priorities}
					statuses={statuses}
					assignees={teamMembers}
					labels={labels}
					trigger={CreateIssueButton()}
					onSubmit={issueActions.create}
					initialStatusId={status.id}
				/>
			</div>

			{statusIssues.length > 0 ? (
				<IssuesTable
					statusIssues={statusIssues}
					labels={labels}
					priorities={priorities}
					teamMembers={teamMembers}
					cycles={cycles}
					workspaceId={workspaceId}
					issueActions={issueActions}
					labelActions={labelActions}
					navigation={navigation}
					subIssuesByParentId={subIssuesByParentId}
				/>
			) : (
				<EmptyStatusDropZone statusId={status.id} />
			)}
		</div>
	);
}
