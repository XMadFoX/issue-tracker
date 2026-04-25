import { Badge } from "@prism/ui/components/badge";
import { Button } from "@prism/ui/components/button";
import { Plus } from "lucide-react";
import { IssueCreateModal } from "../modal/issue-create-modal";
import type {
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

function CreateIssueButton() {
	return (
		<Button variant="ghost" size="icon" type="button" className="ml-auto p-2">
			<Plus className="size-3" />
		</Button>
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
	issueActions: Pick<
		IssueActions,
		"create" | "updatePriority" | "updateAssignee"
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
					workspaceId={workspaceId}
					issueActions={issueActions}
					labelActions={labelActions}
					navigation={navigation}
					subIssuesByParentId={subIssuesByParentId}
				/>
			) : null}
		</div>
	);
}
