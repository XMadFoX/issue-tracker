import { Badge } from "@prism/ui/components/badge";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@prism/ui/components/select";
import { IssueAssigneeSelect } from "../components/issue-assignee-select";
import { IssueLabelSelect } from "../components/issue-label-select";
import { IssuePrioritySelect } from "../components/issue-priority-select";
import type {
	IssueActions,
	IssueDetailData,
	IssueStatusList,
	LabelActions,
	LabelList,
	PriorityList,
	TeamMemberList,
} from "../types";

type Props = {
	issue: IssueDetailData;
	statuses: IssueStatusList;
	priorities: PriorityList;
	labels: LabelList;
	teamMembers: TeamMemberList;
	workspaceId: string;
	issueActions: Pick<
		IssueActions,
		"update" | "updatePriority" | "updateAssignee"
	>;
	labelActions: LabelActions;
};

export function IssuePropertyBar({
	issue,
	statuses,
	priorities,
	labels,
	teamMembers,
	workspaceId,
	issueActions,
	labelActions,
}: Props) {
	return (
		<div className="flex flex-wrap gap-2">
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
							return <Badge variant="secondary">{status?.name ?? value}</Badge>;
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

			<IssueLabelSelect
				labels={labels}
				value={issue.labelLinks.map((link) => link.labelId)}
				workspaceId={workspaceId}
				issueId={issue.id}
				addLabels={labelActions.addLabels}
				deleteLabels={labelActions.deleteLabels}
			/>
		</div>
	);
}
