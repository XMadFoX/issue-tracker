import { cn } from "@prism/ui/lib/utils";
import type { ComponentProps } from "react";
import type {
	CycleList,
	IssueActions,
	IssueActivityList,
	IssueDetailData,
	IssueListItem,
	IssueNavigation,
	IssueStatusList,
	IssueTypeAllowedStatusIdsByType,
	IssueTypeList,
	LabelActions,
	LabelList,
	PriorityList,
	SubIssueActions,
	SubIssueSearchState,
	TeamMemberList,
} from "../types";
import { IssueActivitySection } from "./issue-activity-section";
import { IssueDescriptionSection } from "./issue-description-section";
import { IssueDetailHeader } from "./issue-detail-header";
import { IssuePropertyBar } from "./issue-property-bar";
import { IssueSubIssuesSection } from "./issue-sub-issues-section";

type Props = {
	issue: IssueDetailData;
	activity?: IssueActivityList;
	statuses: IssueStatusList;
	priorities: PriorityList;
	issueTypes: IssueTypeList;
	allowedStatusesByIssueTypeId?: IssueTypeAllowedStatusIdsByType;
	labels: LabelList;
	cycles: CycleList;
	teamMembers: TeamMemberList;
	workspaceId: string;
	teamId: string;
	issueActions: Pick<
		IssueActions,
		| "update"
		| "updateIssueType"
		| "updatePriority"
		| "updateAssignee"
		| "updateCycle"
	>;
	labelActions: LabelActions;
	parentIssue?: IssueListItem | null;
	subIssues?: Array<IssueListItem>;
	subIssueSearch?: SubIssueSearchState;
	subIssueActions?: SubIssueActions;
	navigation?: IssueNavigation;
	className?: ComponentProps<"div">["className"];
};

export function IssueDetail({
	issue,
	activity = [],
	statuses,
	priorities,
	issueTypes,
	allowedStatusesByIssueTypeId,
	labels,
	cycles,
	teamMembers,
	workspaceId,
	teamId,
	issueActions,
	labelActions,
	parentIssue = null,
	subIssues = [],
	subIssueSearch,
	subIssueActions,
	navigation,
	className,
}: Props) {
	return (
		<div className={cn("space-y-6", className)}>
			<IssueDetailHeader
				issue={issue}
				workspaceId={workspaceId}
				onUpdate={issueActions.update}
			/>

			<IssuePropertyBar
				issue={issue}
				statuses={statuses}
				priorities={priorities}
				issueTypes={issueTypes}
				allowedStatusesByIssueTypeId={allowedStatusesByIssueTypeId}
				labels={labels}
				cycles={cycles}
				teamMembers={teamMembers}
				workspaceId={workspaceId}
				issueActions={issueActions}
				labelActions={labelActions}
			/>

			<IssueDescriptionSection
				issue={issue}
				workspaceId={workspaceId}
				onUpdate={issueActions.update}
			/>

			<IssueSubIssuesSection
				issue={issue}
				workspaceId={workspaceId}
				teamId={teamId}
				statuses={statuses}
				priorities={priorities}
				issueTypes={issueTypes}
				allowedStatusesByIssueTypeId={allowedStatusesByIssueTypeId}
				labels={labels}
				teamMembers={teamMembers}
				parentIssue={parentIssue}
				subIssues={subIssues}
				search={subIssueSearch}
				subIssueActions={subIssueActions}
				getIssueUrl={navigation?.getIssueUrl}
			/>

			<IssueActivitySection activity={activity} statuses={statuses} />
		</div>
	);
}
