import { Badge } from "@prism/ui/components/badge";
import { Button } from "@prism/ui/components/button";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@prism/ui/components/table";
import { Link2Off } from "lucide-react";
import { useRouterAdapter } from "../../../router/adapter";
import { getIssueReference } from "../components/issue-reference";
import { AddSubIssueDialog } from "../modal/add-sub-issue-dialog";
import type {
	IssueDetailData,
	IssueListItem,
	IssueNavigation,
	IssueStatusList,
	LabelList,
	PriorityList,
	SubIssueActions,
	SubIssueSearchState,
	TeamMemberList,
} from "../types";

type Props = {
	issue: IssueDetailData;
	workspaceId: string;
	teamId: string;
	statuses: IssueStatusList;
	priorities: PriorityList;
	labels: LabelList;
	teamMembers: TeamMemberList;
	parentIssue?: IssueListItem | null;
	subIssues: Array<IssueListItem>;
	search?: SubIssueSearchState;
	subIssueActions?: SubIssueActions;
	getIssueUrl?: IssueNavigation["getIssueUrl"];
};

export function IssueSubIssuesSection({
	issue,
	workspaceId,
	teamId,
	statuses,
	priorities,
	labels,
	teamMembers,
	parentIssue,
	subIssues,
	search,
	subIssueActions,
	getIssueUrl,
}: Props) {
	const { Link } = useRouterAdapter();
	const hasSubIssues = subIssues.length > 0;
	const subIssueManager =
		search && subIssueActions?.attach && subIssueActions.create
			? {
					search,
					attach: subIssueActions.attach,
					create: subIssueActions.create,
				}
			: null;

	return (
		<div className="space-y-3">
			<div className="flex items-center justify-between gap-3">
				<h2 className="font-semibold text-sm">Sub-tasks</h2>
				{hasSubIssues && subIssueManager ? (
					<AddSubIssueDialog
						issue={issue}
						workspaceId={workspaceId}
						teamId={teamId}
						statuses={statuses}
						priorities={priorities}
						labels={labels}
						teamMembers={teamMembers}
						search={subIssueManager.search}
						onAttachSubIssue={subIssueManager.attach}
						onCreateSubIssue={subIssueManager.create}
					/>
				) : null}
			</div>

			{parentIssue && getIssueUrl ? (
				<div className="flex flex-wrap items-center gap-2 text-sm">
					<span className="text-muted-foreground">Parent</span>
					<Badge variant="outline" asChild>
						<Link to={getIssueUrl(parentIssue)}>
							{getIssueReference(parentIssue)}
						</Link>
					</Badge>
					<span className="truncate text-muted-foreground">
						{parentIssue.title}
					</span>
				</div>
			) : null}

			{hasSubIssues ? (
				<div className="rounded-md border">
					<Table>
						<TableHeader>
							<TableRow className="hover:bg-transparent">
								<TableHead className="w-[100px]">ID</TableHead>
								<TableHead>Title</TableHead>
								<TableHead>Status</TableHead>
								<TableHead>Assignee</TableHead>
								<TableHead className="w-[60px] text-right"></TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{subIssues.map((subIssue) => {
								const issueUrl = getIssueUrl?.(subIssue);
								return (
									<TableRow key={subIssue.id}>
										<TableCell className="font-medium text-muted-foreground">
											{issueUrl ? (
												<Link
													to={issueUrl}
													className="hover:text-foreground hover:underline"
												>
													{getIssueReference(subIssue)}
												</Link>
											) : (
												getIssueReference(subIssue)
											)}
										</TableCell>
										<TableCell className="max-w-[360px] truncate font-medium">
											{issueUrl ? (
												<Link
													to={issueUrl}
													className="hover:text-foreground hover:underline"
												>
													{subIssue.title}
												</Link>
											) : (
												subIssue.title
											)}
										</TableCell>
										<TableCell>
											<Badge variant="secondary">
												{subIssue.status?.name ?? "-"}
											</Badge>
										</TableCell>
										<TableCell className="text-muted-foreground">
											{subIssue.assignee?.name ?? "Unassigned"}
										</TableCell>
										<TableCell className="text-right">
											{subIssueActions?.detach ? (
												<Button
													type="button"
													variant="ghost"
													size="icon-sm"
													onClick={() => subIssueActions.detach?.(subIssue.id)}
												>
													<Link2Off className="size-4" />
													<span className="sr-only">Detach sub-task</span>
												</Button>
											) : null}
										</TableCell>
									</TableRow>
								);
							})}
						</TableBody>
					</Table>
				</div>
			) : (
				<div className="flex min-h-24 flex-col items-center justify-center gap-3 rounded-md border border-dashed text-center">
					<p className="text-muted-foreground text-sm">No sub-tasks yet.</p>
					{subIssueManager ? (
						<AddSubIssueDialog
							issue={issue}
							workspaceId={workspaceId}
							teamId={teamId}
							statuses={statuses}
							priorities={priorities}
							labels={labels}
							teamMembers={teamMembers}
							search={subIssueManager.search}
							onAttachSubIssue={subIssueManager.attach}
							onCreateSubIssue={subIssueManager.create}
							triggerVariant="default"
						/>
					) : null}
				</div>
			)}
		</div>
	);
}
