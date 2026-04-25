import type { QueryClient } from "@tanstack/react-query";
import { issueQueries } from "./issues-feature";

export type TeamIssuesLoaderParams = {
	queryClient: QueryClient;
	slug: string;
	teamSlug: string;
};

export type IssuePageLoaderParams = TeamIssuesLoaderParams & {
	issueId: string;
};

export async function loadTeamIssuesRoute({
	queryClient,
	slug,
	teamSlug,
}: TeamIssuesLoaderParams) {
	const workspace = await queryClient.ensureQueryData(
		issueQueries.workspaceBySlug(slug),
	);
	const team = await queryClient.ensureQueryData(
		issueQueries.teamBySlug({ workspaceId: workspace.id, teamSlug }),
	);
	const input = { workspaceId: workspace.id, teamId: team.id };

	await Promise.all([
		queryClient.ensureQueryData(issueQueries.priorities(workspace.id)),
		queryClient.ensureQueryData(issueQueries.statuses(workspace.id)),
		queryClient.ensureQueryData(issueQueries.labels(input)),
		queryClient.ensureQueryData(issueQueries.teamMembers(input)),
		queryClient.ensureQueryData(issueQueries.issueList(input)),
	]);

	return { workspace, team };
}

export async function loadIssuePageRoute({
	queryClient,
	slug,
	teamSlug,
	issueId,
}: IssuePageLoaderParams) {
	const { workspace, team } = await loadTeamIssuesRoute({
		queryClient,
		slug,
		teamSlug,
	});

	await queryClient.ensureQueryData(
		issueQueries.issueDetail({ workspaceId: workspace.id, issueId }),
	);

	return { workspace, team };
}
