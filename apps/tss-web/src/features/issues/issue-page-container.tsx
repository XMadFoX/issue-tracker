import {
	IssueDetail,
	type IssueLinkTarget,
} from "@prism/blocks/src/features/issues";
import { useIssueDetailModel } from "@prism/features/issues";
import { useSuspenseQueries, useSuspenseQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { buildIssueUrl } from "./issue-url";
import {
	issueQueries,
	useIssueMutations,
	useSubIssueSearch,
} from "./issues-feature";

type Props = {
	slug: string;
	teamSlug: string;
	issueId: string;
};

export function IssuePageContainer({ slug, teamSlug, issueId }: Props) {
	const workspace = useSuspenseQuery(issueQueries.workspaceBySlug(slug));
	const workspaceId = workspace.data.id;
	const team = useSuspenseQuery(
		issueQueries.teamBySlug({ workspaceId, teamSlug }),
	);
	const teamId = team.data.id;
	const listInput = { workspaceId, teamId };
	const issue = useSuspenseQuery(
		issueQueries.issueDetail({ workspaceId, issueId }),
	);
	const activity = useSuspenseQuery(
		issueQueries.issueActivity({ workspaceId, issueId }),
	);
	const priorities = useSuspenseQuery(issueQueries.priorities(workspaceId));
	const statuses = useSuspenseQuery(issueQueries.statuses(workspaceId));
	const labels = useSuspenseQuery(issueQueries.labels(listInput));
	const cycles = useSuspenseQuery(issueQueries.cycles(listInput));
	const teamMembers = useSuspenseQuery(issueQueries.teamMembers(listInput));
	const issues = useSuspenseQuery(issueQueries.issueList(listInput));
	const issueTypes = useSuspenseQuery(
		issueQueries.issueTypes({ workspaceId, teamId }),
	);
	const issueTypeAllowedStatuses = useSuspenseQueries({
		queries: issueTypes.data.map((type) =>
			issueQueries.issueTypeAllowedStatuses({
				workspaceId,
				teamId,
				issueTypeId: type.id,
			}),
		),
	});
	const allowedStatusesByIssueTypeId = useMemo(
		() =>
			Object.fromEntries(
				issueTypes.data.map((type, index) => [
					type.id,
					issueTypeAllowedStatuses[index]?.data.map(
						(allowedStatus) => allowedStatus.statusId,
					) ?? [],
				]),
			),
		[issueTypes.data, issueTypeAllowedStatuses],
	);
	const { issueActions, labelActions, subIssueActions } = useIssueMutations({
		workspaceId,
		teamId,
		selectedIssueId: issueId,
	});
	const { parentIssue, subIssues } = useIssueDetailModel({
		issue: issue.data,
		issues: issues.data,
	});
	const subIssueSearch = useSubIssueSearch({
		workspaceId,
		teamId,
		selectedIssueId: issueId,
		subIssues,
	});
	const getIssueUrl = (nextIssue: IssueLinkTarget) =>
		buildIssueUrl({ slug, teamSlug, issue: nextIssue });

	return (
		<div className="container mx-auto max-w-3xl py-8">
			<IssueDetail
				issue={issue.data}
				activity={activity.data}
				statuses={statuses.data}
				priorities={priorities.data}
				issueTypes={issueTypes.data}
				allowedStatusesByIssueTypeId={allowedStatusesByIssueTypeId}
				labels={labels.data}
				cycles={cycles.data}
				teamMembers={teamMembers.data}
				workspaceId={workspaceId}
				teamId={teamId}
				issueActions={issueActions}
				labelActions={labelActions}
				parentIssue={parentIssue}
				subIssues={subIssues}
				subIssueSearch={subIssueSearch}
				subIssueActions={subIssueActions}
				navigation={{ getIssueUrl }}
			/>
		</div>
	);
}
