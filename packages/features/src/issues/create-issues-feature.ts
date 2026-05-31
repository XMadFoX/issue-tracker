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
import { ISSUE_ARCHIVED_FILTERS, normalizeTeamIssuesInput } from "./types";

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

function isIssueVisibleForArchivedFilter(
	issue: Outputs["issue"]["list"][number],
	archivedFilter: TeamIssuesInput["archivedFilter"],
) {
	switch (archivedFilter) {
		case "archived":
			return issue.archivedAt !== null;
		case "unarchived":
		case undefined:
			return issue.archivedAt === null;
		case "all":
			return true;
	}
}

function isDescriptionOnlyIssueUpdate(
	input: Parameters<IssueActions["update"]>[0],
) {
	if (input.description === undefined) return false;

	return Object.entries(input).every(([key, value]) => {
		if (key === "id" || key === "workspaceId" || key === "description") {
			return true;
		}

		return value === undefined;
	});
}

function affectsCycleMetrics(input: Parameters<IssueActions["update"]>[0]) {
	return (
		input.cycleId !== undefined ||
		input.statusId !== undefined ||
		input.estimate !== undefined
	);
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
		const listInputs = ISSUE_ARCHIVED_FILTERS.map((filter) =>
			normalizeTeamIssuesInput({
				workspaceId,
				teamId,
				archivedFilter: filter,
			}),
		);

		const invalidateIssueList = () => {
			for (const input of listInputs) {
				queryClient.invalidateQueries({
					queryKey: issueQueryKeys.issueList(input),
					exact: true,
				});
			}
		};

		const invalidateCycleMetrics = (cycleId?: string | null) => {
			if (cycleId) {
				queryClient.invalidateQueries({
					queryKey: orpc.cycle.metrics.queryKey({
						input: { workspaceId, cycleId },
					}),
				});
				return;
			}

			queryClient.invalidateQueries({ queryKey: orpc.cycle.metrics.key() });
		};

		const invalidateIssue = (issueId: string) => {
			queryClient.invalidateQueries({
				queryKey: issueQueryKeys.issueDetail({ workspaceId, issueId }),
				exact: true,
			});
			queryClient.invalidateQueries({
				queryKey: issueQueryKeys.issueActivity({ workspaceId, issueId }),
				exact: true,
			});
		};

		const invalidateIssues = (issueIds: Array<string>) => {
			invalidateIssueList();
			for (const issueId of issueIds) {
				invalidateIssue(issueId);
			}
		};

		const getCachedIssue = (issueId: string) => {
			for (const input of listInputs) {
				const issues = queryClient.getQueryData<Outputs["issue"]["list"]>(
					issueQueryKeys.issueList(input),
				);
				const issue = issues?.find((candidate) => candidate.id === issueId);
				if (issue) return issue;
			}
		};

		const invalidateChangedIssue = (issueId: string) => {
			const issueIds = selectedIssueId ? [issueId, selectedIssueId] : [issueId];
			invalidateIssues([...new Set(issueIds)]);
		};

		const updateIssue = useMutation(
			orpc.issue.update.mutationOptions({
				onSuccess: (result, variables) => {
					if (isDescriptionOnlyIssueUpdate(variables)) {
						queryClient.setQueryData<Outputs["issue"]["get"]>(
							issueQueryKeys.issueDetail({
								workspaceId: variables.workspaceId,
								issueId: variables.id,
							}),
							(oldData) => {
								if (!oldData) return oldData;

								return {
									...oldData,
									...result,
								};
							},
						);
						queryClient.invalidateQueries({
							queryKey: issueQueryKeys.issueActivity({
								workspaceId: variables.workspaceId,
								issueId: variables.id,
							}),
							exact: true,
						});
						return;
					}

					invalidateChangedIssue(variables.id);
					if (affectsCycleMetrics(variables)) invalidateCycleMetrics();
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

		const assignIssueToCycle = useMutation(
			orpc.cycle.assignIssue.mutationOptions({
				onSuccess: (_result, variables) => {
					const previousIssue = getCachedIssue(variables.issueId);

					invalidateChangedIssue(variables.issueId);
					if (!previousIssue) {
						invalidateCycleMetrics();
						return;
					}
					if (
						previousIssue.cycleId &&
						previousIssue.cycleId !== variables.cycleId
					) {
						invalidateCycleMetrics(previousIssue.cycleId);
					}
					invalidateCycleMetrics(variables.cycleId);
				},
			}),
		);
		const unassignIssueFromCycle = useMutation(
			orpc.cycle.unassignIssue.mutationOptions({
				onSuccess: (_result, variables) => {
					invalidateChangedIssue(variables.issueId);
					invalidateCycleMetrics(variables.cycleId);
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
				onSuccess: () => {
					invalidateIssueList();
					invalidateCycleMetrics();
				},
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
				if (createdIssue.cycleId !== null) {
					invalidateCycleMetrics(createdIssue.cycleId);
				}
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

		const updateIssueCycle: IssueActions["updateCycle"] = async ({
			id,
			workspaceId,
			cycleId,
		}) => {
			if (cycleId === null) {
				return unassignIssueFromCycle.mutateAsync({
					workspaceId,
					issueId: id,
				});
			}

			return assignIssueToCycle.mutateAsync({
				workspaceId,
				issueId: id,
				cycleId,
			});
		};

		const issueActions: IssueActions = {
			update: updateIssue.mutateAsync,
			updatePriority: updateIssuePriority.mutateAsync,
			updateAssignee: updateIssueAssignee.mutateAsync,
			updateCycle: updateIssueCycle,
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

			function getCachedLiveIssue(issueId: string) {
				for (const filter of ISSUE_ARCHIVED_FILTERS) {
					const input = normalizeTeamIssuesInput({
						workspaceId,
						teamId,
						archivedFilter: filter,
					});
					const issues = queryClient.getQueryData<Outputs["issue"]["list"]>(
						issueQueryKeys.issueList(input),
					);
					const issue = issues?.find((candidate) => candidate.id === issueId);
					if (issue) return issue;
				}
			}

			async function subscribe() {
				try {
					const iterator = await client.issue.live(
						{ workspaceId, teamId },
						{ signal: abortController.signal },
					);

					for await (const event of iterator) {
						const cycleMetricIds = new Set<string>();
						let shouldInvalidateAllCycleMetrics = false;

						if (event.type === "delete") {
							shouldInvalidateAllCycleMetrics = true;
						}
						if (event.type === "create" && event.issue.cycleId !== null) {
							cycleMetricIds.add(event.issue.cycleId);
						}
						if (event.type === "update") {
							const previousIssue = getCachedLiveIssue(event.issue.id);

							if (!previousIssue) {
								shouldInvalidateAllCycleMetrics = true;
							} else if (
								previousIssue.cycleId !== event.issue.cycleId ||
								previousIssue.statusId !== event.issue.statusId ||
								previousIssue.estimate !== event.issue.estimate
							) {
								if (previousIssue.cycleId)
									cycleMetricIds.add(previousIssue.cycleId);
								if (event.issue.cycleId)
									cycleMetricIds.add(event.issue.cycleId);
							}
						}

						if (shouldInvalidateAllCycleMetrics) {
							queryClient.invalidateQueries({
								queryKey: orpc.cycle.metrics.key(),
							});
						} else {
							for (const cycleId of cycleMetricIds) {
								queryClient.invalidateQueries({
									queryKey: orpc.cycle.metrics.queryKey({
										input: { workspaceId, cycleId },
									}),
								});
							}
						}

						for (const filter of ISSUE_ARCHIVED_FILTERS) {
							const filteredListInput = normalizeTeamIssuesInput({
								workspaceId,
								teamId,
								archivedFilter: filter,
							});

							queryClient.setQueryData<Outputs["issue"]["list"]>(
								issueQueryKeys.issueList(filteredListInput),
								(oldData) => {
									if (!oldData) return oldData;

									if (event.type === "create") {
										return isIssueVisibleForArchivedFilter(event.issue, filter)
											? [...oldData, event.issue]
											: oldData;
									}
									if (event.type === "update") {
										const visible = isIssueVisibleForArchivedFilter(
											event.issue,
											filter,
										);
										const hasIssue = oldData.some(
											(issue) => issue.id === event.issue.id,
										);

										if (!visible) {
											return oldData.filter(
												(issue) => issue.id !== event.issue.id,
											);
										}
										if (!hasIssue) return [...oldData, event.issue];

										return oldData.map((issue) =>
											issue.id === event.issue.id ? event.issue : issue,
										);
									}
									if (event.type === "delete") {
										return oldData.filter(
											(issue) => issue.id !== event.issueId,
										);
									}
									return oldData;
								},
							);
						}
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
