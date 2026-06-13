import { Badge } from "@prism/ui/components/badge";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@prism/ui/components/select";
import { IssueAssigneeSelect } from "../components/issue-assignee-select";
import { IssueCycleSelect } from "../components/issue-cycle-select";
import { IssueEstimateSelect } from "../components/issue-estimate-select";
import { IssueLabelSelect } from "../components/issue-label-select";
import { IssuePrioritySelect } from "../components/issue-priority-select";
import type {
	CycleList,
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
	cycles: CycleList;
	teamMembers: TeamMemberList;
	workspaceId: string;
	issueActions: Pick<
		IssueActions,
		"update" | "updatePriority" | "updateAssignee" | "updateCycle"
	>;
	labelActions: LabelActions;
};

export function IssuePropertyBar({
	issue,
	statuses,
	priorities,
	labels,
	cycles,
	teamMembers,
	workspaceId,
	issueActions,
	labelActions,
}: Props) {
	return (
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
	);
}
