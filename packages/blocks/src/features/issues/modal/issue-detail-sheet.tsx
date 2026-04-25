import {
	Sheet,
	SheetContent,
	SheetHeader,
	SheetTitle,
} from "@prism/ui/components/sheet";
import { ExternalLink } from "lucide-react";
import { useRouterAdapter } from "../../../router/adapter";
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
import { IssueDetail } from "../view/issue-detail";

type Props = {
	issue: IssueDetailData;
	onClose: () => void;
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
	fullPageUrl: `/${string}`;
};

export function IssueDetailSheet({
	issue,
	onClose,
	statuses,
	priorities,
	labels,
	teamMembers,
	workspaceId,
	teamId,
	issueActions,
	labelActions,
	parentIssue,
	subIssues,
	subIssueSearch,
	subIssueActions,
	navigation,
	fullPageUrl,
}: Props) {
	const { Link } = useRouterAdapter();

	return (
		<Sheet open={true} onOpenChange={(open) => !open && onClose()}>
			<SheetContent
				side="right"
				className="w-full overflow-y-auto sm:max-w-4xl!"
			>
				<SheetHeader className="mb-4">
					<div className="flex items-center justify-between pr-8">
						<SheetTitle className="sr-only">{issue.title}</SheetTitle>
						<Link
							to={fullPageUrl}
							className="flex items-center gap-2 text-muted-foreground text-sm transition-colors hover:text-foreground"
						>
							<span>Open full page</span>
							<ExternalLink className="size-4" />
						</Link>
					</div>
				</SheetHeader>
				<IssueDetail
					issue={issue}
					statuses={statuses}
					priorities={priorities}
					labels={labels}
					teamMembers={teamMembers}
					workspaceId={workspaceId}
					teamId={teamId}
					issueActions={issueActions}
					labelActions={labelActions}
					parentIssue={parentIssue}
					subIssues={subIssues}
					subIssueSearch={subIssueSearch}
					subIssueActions={subIssueActions}
					navigation={navigation}
					className="px-4"
				/>
			</SheetContent>
		</Sheet>
	);
}
