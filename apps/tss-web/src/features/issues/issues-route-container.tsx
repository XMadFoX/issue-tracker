import {
	IssueDetailSheet,
	type IssueLinkTarget,
	IssueList,
} from "@prism/blocks/src/features/issues";
import {
	type IssueArchivedFilter,
	useIssueDetailModel,
} from "@prism/features/issues";
import { Badge } from "@prism/ui/components/badge";
import { Button } from "@prism/ui/components/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuLabel,
	DropdownMenuRadioGroup,
	DropdownMenuRadioItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@prism/ui/components/dropdown-menu";
import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { Outlet, useNavigate } from "@tanstack/react-router";
import type { ComponentProps } from "react";
import { buildIssueUrl } from "./issue-url";
import {
	issueQueries,
	useIssueLiveUpdates,
	useIssueMutations,
	useSubIssueSearch,
} from "./issues-feature";

type Props = {
	slug: string;
	teamSlug: string;
	selectedIssueId?: string;
	archivedFilter: IssueArchivedFilter;
};

const issueArchiveFilterOptions = [
	{ value: "unarchived", label: "Exclude archived" },
	{ value: "all", label: "Include archived" },
	{ value: "archived", label: "Only archived" },
] satisfies Array<{ value: IssueArchivedFilter; label: string }>;

const issueArchiveFilterSummary: Record<IssueArchivedFilter, string> = {
	unarchived: "Active only",
	all: "Including archived",
	archived: "Archived only",
};

function getIssueArchiveFilter(value: string): IssueArchivedFilter | null {
	return (
		issueArchiveFilterOptions.find((option) => option.value === value)?.value ??
		null
	);
}

export function IssuesRouteContainer({
	slug,
	teamSlug,
	selectedIssueId,
	archivedFilter,
}: Props) {
	const navigate = useNavigate();
	const workspace = useSuspenseQuery(issueQueries.workspaceBySlug(slug));
	const workspaceId = workspace.data.id;
	const team = useSuspenseQuery(
		issueQueries.teamBySlug({ workspaceId, teamSlug }),
	);
	const teamId = team.data.id;
	const listInput = { workspaceId, teamId, archivedFilter };
	const priorities = useSuspenseQuery(issueQueries.priorities(workspaceId));
	const statuses = useSuspenseQuery(issueQueries.statuses(workspaceId));
	const labels = useSuspenseQuery(issueQueries.labels(listInput));
	const teamMembers = useSuspenseQuery(issueQueries.teamMembers(listInput));
	const issues = useSuspenseQuery(issueQueries.issueList(listInput));
	const { issueActions, labelActions } = useIssueMutations({
		workspaceId,
		teamId,
		selectedIssueId,
	});

	useIssueLiveUpdates(listInput);

	const getIssueUrl = (issue: IssueLinkTarget) =>
		buildIssueUrl({ slug, teamSlug, issue });

	return (
		<div className="relative w-full space-y-8 p-6">
			<div className="flex items-center justify-between gap-4">
				<div className="flex items-center gap-3">
					<h1 className="font-bold text-2xl">Issues</h1>
					{archivedFilter !== "unarchived" ? (
						<Badge variant="secondary" className="font-normal">
							{issueArchiveFilterSummary[archivedFilter]}
						</Badge>
					) : null}
				</div>
				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<Button type="button" variant="ghost" size="sm">
							View options
						</Button>
					</DropdownMenuTrigger>
					<DropdownMenuContent align="end" className="w-56">
						<DropdownMenuLabel>Archived issues</DropdownMenuLabel>
						<DropdownMenuSeparator />
						<DropdownMenuRadioGroup
							value={archivedFilter}
							onValueChange={(value) => {
								const nextFilter = getIssueArchiveFilter(value);
								if (!nextFilter) return;

								navigate({
									to: ".",
									search: {
										archivedFilter: nextFilter,
										selectedIssue: undefined,
									},
								});
							}}
						>
							{issueArchiveFilterOptions.map((option) => (
								<DropdownMenuRadioItem key={option.value} value={option.value}>
									{option.label}
								</DropdownMenuRadioItem>
							))}
						</DropdownMenuRadioGroup>
					</DropdownMenuContent>
				</DropdownMenu>
			</div>

			<IssueList
				issues={issues.data}
				statuses={statuses.data}
				teamId={teamId}
				priorities={priorities.data}
				labels={labels.data}
				teamMembers={teamMembers.data}
				workspaceId={workspaceId}
				issueActions={issueActions}
				labelActions={labelActions}
				navigation={{
					onIssueClick: (issueId) => {
						navigate({
							to: ".",
							search: { archivedFilter, selectedIssue: issueId },
						});
					},
					getIssueUrl,
				}}
			/>
			<Outlet />
			{selectedIssueId ? (
				<SelectedIssueSheet
					issueId={selectedIssueId}
					slug={slug}
					teamSlug={teamSlug}
					workspaceId={workspaceId}
					teamId={teamId}
					issues={issues.data}
					statuses={statuses.data}
					priorities={priorities.data}
					labels={labels.data}
					teamMembers={teamMembers.data}
					getIssueUrl={getIssueUrl}
					onClose={() => {
						navigate({
							to: ".",
							search: { archivedFilter, selectedIssue: undefined },
						});
					}}
				/>
			) : null}
		</div>
	);
}

type SelectedIssueSheetProps = {
	issueId: string;
	slug: string;
	teamSlug: string;
	workspaceId: string;
	teamId: string;
	issues: ComponentProps<typeof IssueList>["issues"];
	statuses: ComponentProps<typeof IssueDetailSheet>["statuses"];
	priorities: ComponentProps<typeof IssueDetailSheet>["priorities"];
	labels: ComponentProps<typeof IssueDetailSheet>["labels"];
	teamMembers: ComponentProps<typeof IssueDetailSheet>["teamMembers"];
	getIssueUrl: (issue: IssueLinkTarget) => `/${string}`;
	onClose: () => void;
};

function SelectedIssueSheet({
	issueId,
	slug,
	teamSlug,
	workspaceId,
	teamId,
	issues,
	statuses,
	priorities,
	labels,
	teamMembers,
	getIssueUrl,
	onClose,
}: SelectedIssueSheetProps) {
	const selectedIssue = useQuery(
		issueQueries.issueDetail({ workspaceId, issueId }),
	);
	const activity = useQuery({
		...issueQueries.issueActivity({ workspaceId, issueId }),
		enabled: selectedIssue.data !== undefined,
	});
	const { issueActions, labelActions, subIssueActions } = useIssueMutations({
		workspaceId,
		teamId,
		selectedIssueId: issueId,
	});
	const { parentIssue, subIssues } = useIssueDetailModel({
		issue: selectedIssue.data,
		issues,
	});
	const subIssueSearch = useSubIssueSearch({
		workspaceId,
		teamId,
		selectedIssueId: issueId,
		subIssues,
	});

	if (!selectedIssue.data) return null;

	return (
		<IssueDetailSheet
			issue={selectedIssue.data}
			activity={activity.data ?? []}
			onClose={onClose}
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
			navigation={{ getIssueUrl }}
			fullPageUrl={`/workspace/${slug}/teams/${teamSlug}/issue/${issueId}`}
		/>
	);
}
