import type { Outputs } from "@prism/api/src/router";
import { useDebouncedValue } from "@tanstack/react-pacer";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { createIssueQueries } from "./create-issue-queries";
import type {
	IssueActions,
	IssueCreateInput,
	IssueFeatureNotifications,
	LabelActions,
	PrismOrpc,
	PrismRouterClient,
	SubIssueActions,
	SubIssueSearchState,
	SubmitResult,
	TeamIssuesInput,
} from "./types";

const TEXT_SUB_ISSUE_QUERY_MIN_LENGTH = 2;
const ISSUE_NUMBER_QUERY_MIN_LENGTH = 1;
const SUB_ISSUE_QUERY_DEBOUNCE_MS = 300;
const ISSUE_NUMBER_QUERY_REGEX = /^\d+$/;

type CreateIssuesFeatureParams = {
	orpc: PrismOrpc;
	client: PrismRouterClient;
	notify?: IssueFeatureNotifications;
};

type IssueMutationParams = TeamIssuesInput & {
	selectedIssueId?: string | null;
};

type SubIssueSearchParams = TeamIssuesInput & {
	selectedIssueId: string;
	subIssues: Outputs["issue"]["list"];
};

function getMinSubIssueQueryLength(query: string) {
	return ISSUE_NUMBER_QUERY_REGEX.test(query)
		? ISSUE_NUMBER_QUERY_MIN_LENGTH
		: TEXT_SUB_ISSUE_QUERY_MIN_LENGTH;
}

export function createIssuesFeature({
	orpc,
	client,
	notify,
}: CreateIssuesFeatureParams) {
	const { issueQueries, issueQueryKeys } = createIssueQueries(orpc);

	function useIssueMutations({
		workspaceId,
		teamId,
		selectedIssueId,
	}: IssueMutationParams) {
		const queryClient = useQueryClient();
		const listInput = { workspaceId, teamId };

		const invalidateIssueList = () => {
			queryClient.invalidateQueries({
				queryKey: issueQueryKeys.issueList(listInput),
				exact: true,
			});
		};

		const invalidateIssue = (issueId: string) => {
			queryClient.invalidateQueries({
				queryKey: issueQueryKeys.issueDetail({ workspaceId, issueId }),
				exact: true,
			});
		};

		const invalidateIssues = (issueIds: Array<string>) => {
			invalidateIssueList();
			for (const issueId of issueIds) {
				invalidateIssue(issueId);
			}
		};

		const invalidateChangedIssue = (issueId: string) => {
			const issueIds = selectedIssueId ? [issueId, selectedIssueId] : [issueId];
			invalidateIssues([...new Set(issueIds)]);
		};

		const updateIssue = useMutation(
			orpc.issue.update.mutationOptions({
				onSuccess: (_result, variables) => {
					invalidateChangedIssue(variables.id);
				},
			}),
		);

		const updateIssuePriority = useMutation(
			orpc.issue.updatePriority.mutationOptions({
				onSuccess: (_result, variables) => {
					invalidateChangedIssue(variables.id);
				},
			}),
		);

		const updateIssueAssignee = useMutation(
			orpc.issue.updateAssignee.mutationOptions({
				onSuccess: (_result, variables) => {
					invalidateChangedIssue(variables.id);
				},
			}),
		);

		const addLabels = useMutation(
			orpc.issue.labels.bulkAdd.mutationOptions({
				onSuccess: (_result, variables) => {
					invalidateChangedIssue(variables.issueId);
				},
			}),
		);

		const deleteLabels = useMutation(
			orpc.issue.labels.bulkDelete.mutationOptions({
				onSuccess: (_result, variables) => {
					invalidateChangedIssue(variables.issueId);
				},
			}),
		);

		const moveIssue = useMutation(
			orpc.issue.move.mutationOptions({
				onSuccess: invalidateIssueList,
				onError: () => {
					notify?.error("Failed to move issue");
				},
			}),
		);

		const createIssue = useMutation(orpc.issue.create.mutationOptions());
		const updateIssueParent = useMutation(
			orpc.issue.updateParent.mutationOptions(),
		);

		const createIssueWithToast = async (
			issue: IssueCreateInput,
		): Promise<SubmitResult> => {
			try {
				const createdIssue = await createIssue.mutateAsync(issue);
				invalidateIssues(
					createdIssue.parentIssueId
						? [createdIssue.id, createdIssue.parentIssueId]
						: [createdIssue.id],
				);
				notify?.success("Issue created successfully");
				return { success: true };
			} catch (error) {
				notify?.error("Issue creation failed");
				return { error };
			}
		};

		const attachSubIssue: SubIssueActions["attach"] = async (subIssue) => {
			if (!selectedIssueId) return;

			try {
				await updateIssueParent.mutateAsync({
					id: subIssue.id,
					workspaceId,
					parentIssueId: selectedIssueId,
				});
				invalidateIssues(
					subIssue.parentIssueId
						? [selectedIssueId, subIssue.id, subIssue.parentIssueId]
						: [selectedIssueId, subIssue.id],
				);
				notify?.success("Sub-item added");
			} catch (error) {
				notify?.error("Failed to add sub-item");
				throw error;
			}
		};

		const detachSubIssue: SubIssueActions["detach"] = async (subIssueId) => {
			if (!selectedIssueId) return;

			try {
				await updateIssueParent.mutateAsync({
					id: subIssueId,
					workspaceId,
					parentIssueId: null,
				});
				invalidateIssues([selectedIssueId, subIssueId]);
				notify?.success("Sub-item detached");
			} catch (error) {
				notify?.error("Failed to detach sub-item");
				throw error;
			}
		};

		const issueActions: IssueActions = {
			update: updateIssue.mutateAsync,
			updatePriority: updateIssuePriority.mutateAsync,
			updateAssignee: updateIssueAssignee.mutateAsync,
			move: moveIssue.mutateAsync,
			create: createIssueWithToast,
		};

		const labelActions: LabelActions = {
			addLabels: addLabels.mutateAsync,
			deleteLabels: deleteLabels.mutateAsync,
		};

		const subIssueActions: SubIssueActions = {
			attach: attachSubIssue,
			detach: detachSubIssue,
			create: createIssueWithToast,
		};

		return {
			issueActions,
			labelActions,
			subIssueActions,
		};
	}

	function useSubIssueSearch({
		workspaceId,
		teamId,
		selectedIssueId,
		subIssues,
	}: SubIssueSearchParams): SubIssueSearchState {
		const [query, setQuery] = useState("");
		const normalizedQuery = query.trim();
		const [debouncedQuery, debouncer] = useDebouncedValue(
			normalizedQuery,
			{ wait: SUB_ISSUE_QUERY_DEBOUNCE_MS },
			(state) => ({ isPending: state.isPending }),
		);
		const minQueryLength = getMinSubIssueQueryLength(normalizedQuery);
		const debouncedMinQueryLength = getMinSubIssueQueryLength(debouncedQuery);
		const canSearch = debouncedQuery.length >= debouncedMinQueryLength;

		const search = useQuery({
			...issueQueries.subIssueSearch({
				workspaceId,
				teamId,
				query: debouncedQuery,
			}),
			enabled: canSearch,
		});

		const excludedIds = useMemo(() => {
			const ids = new Set<string>([selectedIssueId]);
			for (const subIssue of subIssues) {
				ids.add(subIssue.id);
			}
			return ids;
		}, [selectedIssueId, subIssues]);

		const results = useMemo(
			() =>
				(search.data?.issues ?? []).filter(
					(issue) => !excludedIds.has(issue.id),
				),
			[search.data?.issues, excludedIds],
		);

		return {
			query,
			onQueryChange: setQuery,
			results,
			isSearching: debouncer.state.isPending || search.isFetching,
			hasSearched: search.isFetched,
			minQueryLength,
		};
	}

	function useIssueLiveUpdates({ workspaceId, teamId }: TeamIssuesInput) {
		const queryClient = useQueryClient();

		useEffect(() => {
			const abortController = new AbortController();

			async function subscribe() {
				try {
					const iterator = await client.issue.live(
						{ workspaceId, teamId },
						{ signal: abortController.signal },
					);

					for await (const event of iterator) {
						queryClient.setQueryData<Outputs["issue"]["list"]>(
							issueQueryKeys.issueList({ workspaceId, teamId }),
							(oldData) => {
								if (!oldData) return oldData;

								if (event.type === "create") {
									return [...oldData, event.issue];
								}
								if (event.type === "update") {
									return oldData.map((issue) =>
										issue.id === event.issue.id ? event.issue : issue,
									);
								}
								if (event.type === "delete") {
									return oldData.filter((issue) => issue.id !== event.issueId);
								}
								return oldData;
							},
						);
					}
				} catch (error) {
					if (error instanceof Error && error.name !== "AbortError") {
						console.error("Live updates error:", error);
					}
				}
			}

			subscribe();

			return () => abortController.abort();
		}, [workspaceId, teamId, queryClient]);
	}

	return {
		issueQueries,
		issueQueryKeys,
		useIssueMutations,
		useSubIssueSearch,
		useIssueLiveUpdates,
	};
}
