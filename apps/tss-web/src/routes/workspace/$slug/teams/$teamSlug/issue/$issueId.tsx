import type { issueCreateSchema } from "@prism/api/src/features/issues/schema";
import type { Outputs } from "@prism/api/src/router";
import { IssueDetail } from "@prism/blocks/src/features/issues/view/issue-detail";
import { useDebouncedValue } from "@tanstack/react-pacer";
import {
	skipToken,
	useMutation,
	useQuery,
	useQueryClient,
	useSuspenseQuery,
} from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { orpc } from "src/orpc/client";
import type z from "zod";

const TEXT_SUB_ISSUE_QUERY_MIN_LENGTH = 2;
const ISSUE_NUMBER_QUERY_MIN_LENGTH = 1;
const SUB_ISSUE_QUERY_DEBOUNCE_MS = 300;
const ISSUE_NUMBER_QUERY_REGEX = /^\d+$/;

export const Route = createFileRoute(
	"/workspace/$slug/teams/$teamSlug/issue/$issueId",
)({
	component: RouteComponent,
});

type SubmitResult = { success: true } | { error: unknown };

function getMinSubIssueQueryLength(query: string) {
	return ISSUE_NUMBER_QUERY_REGEX.test(query)
		? ISSUE_NUMBER_QUERY_MIN_LENGTH
		: TEXT_SUB_ISSUE_QUERY_MIN_LENGTH;
}

function RouteComponent() {
	const { issueId, slug, teamSlug } = Route.useParams();
	const qc = useQueryClient();
	const [subIssueSearchQuery, setSubIssueSearchQuery] = useState("");

	const workspace = useSuspenseQuery(
		orpc.workspace.getBySlug.queryOptions({ input: { slug } }),
	);

	const workspaceId = workspace.data.id;

	const team = useSuspenseQuery(
		orpc.team.getBySlug.queryOptions({
			input: { key: teamSlug, workspaceId },
		}),
	);

	const issue = useSuspenseQuery(
		orpc.issue.get.queryOptions({
			input: { id: issueId, workspaceId },
		}),
	);

	const priorities = useSuspenseQuery(
		orpc.priority.list.queryOptions({
			input: { workspaceId },
		}),
	);

	const statuses = useSuspenseQuery(
		orpc.issue.status.list.queryOptions({
			input: { id: workspaceId },
		}),
	);

	const labels = useSuspenseQuery(
		orpc.label.list.queryOptions({
			input: {
				workspaceId,
				teamId: team.data.id,
				scope: "all",
			},
		}),
	);

	const teamMembers = useSuspenseQuery(
		orpc.teamMembership.list.queryOptions({
			input: { workspaceId, teamId: team.data.id },
		}),
	);

	const issues = useSuspenseQuery(
		orpc.issue.list.queryOptions({
			input: { workspaceId, teamId: team.data.id },
		}),
	);

	const invalidate = () => {
		qc.invalidateQueries({ queryKey: orpc.issue.list.key() });
		qc.invalidateQueries({
			queryKey: orpc.issue.get.key({ input: { id: issueId, workspaceId } }),
		});
	};

	const invalidateIssue = (nextIssueId: string) => {
		qc.invalidateQueries({
			queryKey: orpc.issue.get.key({
				input: { id: nextIssueId, workspaceId },
			}),
		});
	};

	const invalidateHierarchy = (issueIds: Array<string>) => {
		qc.invalidateQueries({ queryKey: orpc.issue.list.key() });
		for (const nextIssueId of issueIds) {
			invalidateIssue(nextIssueId);
		}
	};

	const onUpdate = useMutation(
		orpc.issue.update.mutationOptions({
			onSuccess: invalidate,
		}),
	);

	const updateIssuePriority = useMutation(
		orpc.issue.updatePriority.mutationOptions({
			onSuccess: invalidate,
		}),
	);

	const updateIssueAssignee = useMutation(
		orpc.issue.updateAssignee.mutationOptions({
			onSuccess: invalidate,
		}),
	);

	const addLabels = useMutation(
		orpc.issue.labels.bulkAdd.mutationOptions({
			onSuccess: invalidate,
		}),
	);

	const deleteLabels = useMutation(
		orpc.issue.labels.bulkDelete.mutationOptions({
			onSuccess: invalidate,
		}),
	);

	const createIssue = useMutation(orpc.issue.create.mutationOptions());
	const updateIssueParent = useMutation(
		orpc.issue.updateParent.mutationOptions(),
	);
	const parentIssue = issue.data.parentIssueId
		? (issues.data.find((item) => item.id === issue.data.parentIssueId) ?? null)
		: null;
	const subIssues = issues.data.filter(
		(item) => item.parentIssueId === issueId,
	);
	const normalizedSubIssueSearchQuery = subIssueSearchQuery.trim();
	const [debouncedSubIssueSearchQuery, subIssueSearchDebouncer] =
		useDebouncedValue(
			normalizedSubIssueSearchQuery,
			{ wait: SUB_ISSUE_QUERY_DEBOUNCE_MS },
			(state) => ({ isPending: state.isPending }),
		);
	const minSubIssueSearchQueryLength = getMinSubIssueQueryLength(
		normalizedSubIssueSearchQuery,
	);
	const debouncedMinSubIssueSearchQueryLength = getMinSubIssueQueryLength(
		debouncedSubIssueSearchQuery,
	);
	const canSearchSubIssues =
		debouncedSubIssueSearchQuery.length >=
		debouncedMinSubIssueSearchQueryLength;
	const subIssueSearch = useQuery(
		orpc.issue.search.queryOptions({
			input: canSearchSubIssues
				? {
						workspaceId,
						query: debouncedSubIssueSearchQuery,
						mode: "hybrid",
						filters: { teamId: team.data.id },
						options: {
							includeTeam: true,
							includeStatus: true,
							includePriority: true,
							includeAssignee: true,
						},
						includeArchived: false,
					}
				: skipToken,
		}),
	);
	const excludedSubIssueSearchIds = useMemo(() => {
		const ids = new Set<string>([issueId]);
		for (const subIssue of subIssues) {
			ids.add(subIssue.id);
		}
		return ids;
	}, [issueId, subIssues]);
	const attachableSubIssueResults = useMemo(
		() =>
			(subIssueSearch.data?.issues ?? []).filter(
				(item) => !excludedSubIssueSearchIds.has(item.id),
			),
		[subIssueSearch.data?.issues, excludedSubIssueSearchIds],
	);

	const onIssueSubmit = async (
		value: z.input<typeof issueCreateSchema>,
	): Promise<SubmitResult> => {
		try {
			const createdIssue = await createIssue.mutateAsync(value);
			invalidateHierarchy(
				createdIssue.parentIssueId
					? [createdIssue.id, createdIssue.parentIssueId]
					: [createdIssue.id],
			);
			toast.success("Issue created successfully");
			return { success: true } as const;
		} catch (error) {
			toast.error("Issue creation failed");
			return { error };
		}
	};

	const attachSubIssue = async (
		subIssue: Outputs["issue"]["search"]["issues"][number],
	) => {
		try {
			await updateIssueParent.mutateAsync({
				id: subIssue.id,
				workspaceId,
				parentIssueId: issueId,
			});
			invalidateHierarchy(
				subIssue.parentIssueId
					? [issueId, subIssue.id, subIssue.parentIssueId]
					: [issueId, subIssue.id],
			);
			toast.success("Sub-item added");
		} catch (error) {
			toast.error("Failed to add sub-item");
			throw error;
		}
	};

	const detachSubIssue = async (subIssueId: string) => {
		try {
			await updateIssueParent.mutateAsync({
				id: subIssueId,
				workspaceId,
				parentIssueId: null,
			});
			invalidateHierarchy([issueId, subIssueId]);
			toast.success("Sub-item detached");
		} catch (error) {
			toast.error("Failed to detach sub-item");
			throw error;
		}
	};

	const getIssueUrl = (nextIssue: {
		id: string;
		team?: { key: string } | null;
	}): `/${string}` => {
		const nextTeamSlug = nextIssue.team?.key ?? teamSlug;
		return `/workspace/${slug}/teams/${nextTeamSlug}/issue/${nextIssue.id}`;
	};

	return (
		<div className="container mx-auto max-w-3xl py-8">
			<IssueDetail
				issue={issue.data}
				statuses={statuses.data}
				priorities={priorities.data}
				labels={labels.data}
				teamMembers={teamMembers.data}
				workspaceId={workspaceId}
				onUpdate={onUpdate.mutateAsync}
				updateIssuePriority={updateIssuePriority.mutateAsync}
				updateIssueAssignee={updateIssueAssignee.mutateAsync}
				addLabels={addLabels.mutateAsync}
				deleteLabels={deleteLabels.mutateAsync}
				teamId={team.data.id}
				parentIssue={parentIssue}
				subIssues={subIssues}
				subIssueSearch={{
					query: subIssueSearchQuery,
					onQueryChange: setSubIssueSearchQuery,
					results: attachableSubIssueResults,
					isSearching:
						subIssueSearchDebouncer.state.isPending ||
						subIssueSearch.isFetching,
					hasSearched: subIssueSearch.isFetched,
					minQueryLength: minSubIssueSearchQueryLength,
				}}
				onAttachSubIssue={attachSubIssue}
				onDetachSubIssue={detachSubIssue}
				onCreateSubIssue={onIssueSubmit}
				getIssueUrl={getIssueUrl}
			/>
		</div>
	);
}
