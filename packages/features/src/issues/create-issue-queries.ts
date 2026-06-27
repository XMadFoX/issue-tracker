import type {
	IssueDetailInput,
	IssueSearchInput,
	IssueTypeAllowedStatusListInput,
	IssueTypeListInput,
	PrismOrpc,
	TeamBySlugInput,
	TeamIssuesInput,
} from "./types";
import { normalizeTeamIssuesInput } from "./types";

function normalizeIssueTypeListInput(
	input: IssueTypeListInput,
): IssueTypeListInput {
	return {
		...input,
		includeArchived: input.includeArchived ?? false,
	};
}

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
		cycles: ({ workspaceId, teamId }: TeamIssuesInput) =>
			orpc.cycle.list.queryOptions({
				input: { workspaceId, teamId },
			}),
		issueList: (input: TeamIssuesInput) =>
			orpc.issue.list.queryOptions({
				input: normalizeTeamIssuesInput(input),
			}),
		issueDetail: ({ workspaceId, issueId }: IssueDetailInput) =>
			orpc.issue.get.queryOptions({
				input: { id: issueId, workspaceId },
			}),
		issueActivity: ({ workspaceId, issueId }: IssueDetailInput) =>
			orpc.issue.activity.list.queryOptions({
				input: { workspaceId, issueId },
			}),
		issueTypes: (input: IssueTypeListInput) =>
			orpc.issueType.list.queryOptions({
				input: normalizeIssueTypeListInput(input),
			}),
		issueTypeAllowedStatuses: (input: IssueTypeAllowedStatusListInput) =>
			orpc.issueType.listAllowedStatuses.queryOptions({ input }),
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
		issueList: (input: TeamIssuesInput) =>
			orpc.issue.list.queryKey({
				input: normalizeTeamIssuesInput(input),
			}),
		issueDetail: ({ workspaceId, issueId }: IssueDetailInput) =>
			orpc.issue.get.queryKey({ input: { id: issueId, workspaceId } }),
		issueActivity: ({ workspaceId, issueId }: IssueDetailInput) =>
			orpc.issue.activity.list.queryKey({ input: { workspaceId, issueId } }),
	};

	const issueTypeQueryKeys = {
		issueTypes: (input: IssueTypeListInput) =>
			orpc.issueType.list.queryKey({
				input: normalizeIssueTypeListInput(input),
			}),
		all: () => orpc.issueType.list.key(),
	};

	return { issueQueries, issueQueryKeys, issueTypeQueryKeys };
}
