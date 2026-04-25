import { cn } from "@prism/ui/lib/utils";
import type { ComponentProps } from "react";
import type {
	IssueActions,
	IssueDetailData,
	IssueListItem,
	IssueNavigation,
	IssueStatusList,
	LabelActions,
	LabelList,
	PriorityList,
	SubIssueActions,
	SubIssueSearchState,
	TeamMemberList,
} from "../types";
import { IssueDescriptionSection } from "./issue-description-section";
import { IssueDetailHeader } from "./issue-detail-header";
import { IssuePropertyBar } from "./issue-property-bar";
import { IssueSubIssuesSection } from "./issue-sub-issues-section";

type Props = {
	issue: IssueDetailData;
	statuses: IssueStatusList;
	priorities: PriorityList;
	labels: LabelList;
	teamMembers: TeamMemberList;
	workspaceId: string;
	teamId: string;
	issueActions: Pick<
		IssueActions,
		"update" | "updatePriority" | "updateAssignee"
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
	statuses,
	priorities,
	labels,
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
				labels={labels}
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
				labels={labels}
				teamMembers={teamMembers}
				parentIssue={parentIssue}
				subIssues={subIssues}
				search={subIssueSearch}
				subIssueActions={subIssueActions}
				getIssueUrl={navigation?.getIssueUrl}
			/>
		</div>
	);
}
