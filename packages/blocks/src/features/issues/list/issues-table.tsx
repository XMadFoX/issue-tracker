import {
	SortableContext,
	verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import {
	Table,
	TableBody,
	TableHead,
	TableHeader,
	TableRow,
} from "@prism/ui/components/table";
import { useMemo } from "react";
import type {
	CycleList,
	IssueActions,
	IssueListData,
	IssueListItem,
	IssueNavigation,
	IssueStatusList,
	IssueTypeAllowedStatusIdsByType,
	IssueTypeList,
	LabelActions,
	LabelList,
	PriorityList,
	TeamMemberList,
} from "../types";
import { SortableIssueRow } from "./sortable-issue-row";

type Props = {
	statusIssues: IssueListData;
	labels: LabelList;
	priorities: PriorityList;
	issueTypes: IssueTypeList;
	statuses: IssueStatusList;
	allowedStatusesByIssueTypeId?: IssueTypeAllowedStatusIdsByType;
	teamMembers: TeamMemberList;
	cycles: CycleList;
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
	navigation?: IssueNavigation;
	subIssuesByParentId: Map<string, Array<IssueListItem>>;
};

export function IssuesTable({
	statusIssues,
	labels,
	priorities,
	issueTypes,
	statuses,
	allowedStatusesByIssueTypeId,
	teamMembers,
	cycles,
	workspaceId,
	issueActions,
	labelActions,
	navigation,
	subIssuesByParentId,
}: Props) {
	const issueIds = useMemo(
		() => statusIssues.map((issue) => issue.id),
		[statusIssues],
	);

	return (
		<div className="rounded-md border">
			<Table>
				<TableHeader>
					<TableRow className="hover:bg-transparent">
						<TableHead className="w-[30px]"></TableHead>
						<TableHead className="w-[100px]">ID</TableHead>
						<TableHead>Title</TableHead>
						<TableHead className="w-[130px]">Sub-tasks</TableHead>
						<TableHead>Cycle</TableHead>
						<TableHead>Type</TableHead>
						<TableHead>Priority</TableHead>
						<TableHead className="w-[110px]">Estimate</TableHead>
						<TableHead>Label</TableHead>
						<TableHead>Assignee</TableHead>
						<TableHead className="text-right">Created</TableHead>
					</TableRow>
				</TableHeader>
				<TableBody>
					<SortableContext
						items={issueIds}
						strategy={verticalListSortingStrategy}
					>
						{statusIssues.map((issue) => (
							<SortableIssueRow
								key={issue.id}
								issue={issue}
								labels={labels}
								priorities={priorities}
								issueTypes={issueTypes}
								statuses={statuses}
								allowedStatusesByIssueTypeId={allowedStatusesByIssueTypeId}
								teamMembers={teamMembers}
								cycles={cycles}
								workspaceId={workspaceId}
								issueActions={issueActions}
								labelActions={labelActions}
								navigation={navigation}
								subIssues={subIssuesByParentId.get(issue.id) ?? []}
							/>
						))}
					</SortableContext>
				</TableBody>
			</Table>
		</div>
	);
}
