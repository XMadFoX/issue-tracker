import {
	IssueDetailSheet,
	type IssueLinkTarget,
	IssueList,
} from "@prism/blocks/src/features/issues";
import { useIssueDetailModel } from "@prism/features/issues";
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
};

export function IssuesRouteContainer({
	slug,
	teamSlug,
	selectedIssueId,
}: Props) {
	const navigate = useNavigate();
	const workspace = useSuspenseQuery(issueQueries.workspaceBySlug(slug));
	const workspaceId = workspace.data.id;
	const team = useSuspenseQuery(
		issueQueries.teamBySlug({ workspaceId, teamSlug }),
	);
	const teamId = team.data.id;
	const listInput = { workspaceId, teamId };
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

	useIssueLiveUpdates({ workspaceId, teamId });

	const getIssueUrl = (issue: IssueLinkTarget) =>
		buildIssueUrl({ slug, teamSlug, issue });

	return (
		<div className="relative w-full space-y-8 p-6">
			<div className="flex items-center justify-between">
				<h1 className="font-bold text-2xl">Issues</h1>
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
							search: { selectedIssue: issueId },
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
							search: { selectedIssue: undefined },
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
