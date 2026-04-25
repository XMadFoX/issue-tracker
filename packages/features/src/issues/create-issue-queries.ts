import type {
	IssueDetailInput,
	IssueSearchInput,
	PrismOrpc,
	TeamBySlugInput,
	TeamIssuesInput,
} from "./types";

export function createIssueQueries(orpc: PrismOrpc) {
	const issueQueries = {
		workspaceBySlug: (slug: string) =>
			orpc.workspace.getBySlug.queryOptions({ input: { slug } }),
		teamBySlug: ({ workspaceId, teamSlug }: TeamBySlugInput) =>
			orpc.team.getBySlug.queryOptions({
				input: { key: teamSlug, workspaceId },
			}),
		priorities: (workspaceId: string) =>
			orpc.priority.list.queryOptions({ input: { workspaceId } }),
		statuses: (workspaceId: string) =>
			orpc.issue.status.list.queryOptions({ input: { id: workspaceId } }),
		labels: ({ workspaceId, teamId }: TeamIssuesInput) =>
			orpc.label.list.queryOptions({
				input: { workspaceId, teamId, scope: "all" },
			}),
		teamMembers: ({ workspaceId, teamId }: TeamIssuesInput) =>
			orpc.teamMembership.list.queryOptions({
				input: { workspaceId, teamId },
			}),
		issueList: ({ workspaceId, teamId }: TeamIssuesInput) =>
			orpc.issue.list.queryOptions({
				input: { workspaceId, teamId },
			}),
		issueDetail: ({ workspaceId, issueId }: IssueDetailInput) =>
			orpc.issue.get.queryOptions({
				input: { id: issueId, workspaceId },
			}),
		subIssueSearch: ({ workspaceId, teamId, query }: IssueSearchInput) =>
			orpc.issue.search.queryOptions({
				input: {
					workspaceId,
					query,
					mode: "hybrid",
					filters: { teamId },
					options: {
						includeTeam: true,
						includeStatus: true,
						includePriority: true,
						includeAssignee: true,
					},
					includeArchived: false,
				},
			}),
	};

	const issueQueryKeys = {
		issueList: (input: TeamIssuesInput) => orpc.issue.list.queryKey({ input }),
		issueDetail: ({ workspaceId, issueId }: IssueDetailInput) =>
			orpc.issue.get.queryKey({ input: { id: issueId, workspaceId } }),
	};

	return { issueQueries, issueQueryKeys };
}
