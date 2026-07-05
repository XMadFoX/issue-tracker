import { ORPCError } from "@orpc/server";
import type { Outputs } from "@prism/api/src/router";
import { useDebouncedValue } from "@tanstack/react-pacer";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import z from "zod";
import { createIssueQueries } from "./create-issue-queries";
import type {
	IssueActions,
	IssueCreateInput,
	IssueFeatureNotifications,
	IssueTypeActions,
	LabelActions,
	NormalizedTeamIssuesInput,
	PrismOrpc,
	PrismRouterClient,
	SubIssueActions,
	SubIssueSearchState,
	SubmitResult,
	TeamIssuesInput,
	UpdateIssueTypeResult,
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

const issueListQueryOptionsSchema = z.object({
	input: z.unknown(),
});

const issueListQueryInputSchema = z.object({
	workspaceId: z.string(),
	teamId: z.string(),
	archivedFilter: z
		.enum(["unarchived", "archived", "all"])
		.default("unarchived"),
	issueTypeId: z.string().optional(),
});

const issueSearchQueryInputSchema = z.object({
	workspaceId: z.string(),
	filters: z
		.object({
			teamId: z.string().optional(),
		})
		.optional(),
});

const issueTypeListQueryInputSchema = z.object({
	workspaceId: z.string(),
	teamId: z.string().optional(),
});

const workspaceScopedQueryInputSchema = z.object({
	workspaceId: z.string(),
});

function getMinSubIssueQueryLength(query: string) {
	return ISSUE_NUMBER_QUERY_REGEX.test(query)
		? ISSUE_NUMBER_QUERY_MIN_LENGTH
		: TEXT_SUB_ISSUE_QUERY_MIN_LENGTH;
}

function getIssueTypeArchiveErrorMessage(error: unknown, fallback: string) {
	return error instanceof ORPCError &&
		error.defined &&
		error.code === "DEFAULT_CONFLICT"
		? "Change default type before archiving."
		: fallback;
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

/**
 * Extracts and validates the issue list input from an oRPC query key.
 * oRPC keys have the shape `[path, { type?, input? }]`.
 * Returns null if the key cannot be parsed as a valid issue list input.
 */
function parseQueryInput<TInput>(
	queryKey: unknown,
	schema: z.ZodType<TInput>,
): TInput | null {
	if (!Array.isArray(queryKey) || queryKey.length < 2) return null;
	const optionsResult = issueListQueryOptionsSchema.safeParse(queryKey[1]);
	if (!optionsResult.success) return null;

	const inputResult = schema.safeParse(optionsResult.data.input);
	if (!inputResult.success) return null;

	return inputResult.data;
}

function parseIssueListQueryInput(
	queryKey: unknown,
): NormalizedTeamIssuesInput | null {
	return parseQueryInput(queryKey, issueListQueryInputSchema);
}

function affectsCycleMetrics(input: Parameters<IssueActions["update"]>[0]) {
	return (
		input.cycleId !== undefined ||
		input.statusId !== undefined ||
		input.estimate !== undefined
	);
}

type IssueTypeMutationParams = {
	workspaceId: string;
	teamId?: string | null;
};

export function createIssuesFeature({
	orpc,
	client,
	notify,
}: CreateIssuesFeatureParams) {
	const { issueQueries, issueQueryKeys, issueTypeQueryKeys } =
		createIssueQueries(orpc);

	function useIssueMutations({
		workspaceId,
		teamId: _teamId,
		selectedIssueId,
	}: IssueMutationParams) {
		const queryClient = useQueryClient();

		const invalidateIssueList = () => {
			queryClient.invalidateQueries({
				queryKey: orpc.issue.list.key(),
				predicate: (query) => {
					const listInput = parseIssueListQueryInput(query.queryKey);

					return (
						listInput?.workspaceId === workspaceId &&
						listInput.teamId === _teamId
					);
				},
			});
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
			// Search all cached list variants (including issueTypeId-filtered ones)
			const allLists = queryClient.getQueriesData<Outputs["issue"]["list"]>({
				queryKey: orpc.issue.list.key(),
			});
			for (const [, data] of allLists) {
				const found = data?.find((candidate) => candidate.id === issueId);
				if (found) return found;
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

		const updateIssueType = async ({
			id,
			workspaceId: issueWorkspaceId,
			issueTypeId,
		}: {
			id: string;
			workspaceId: string;
			issueTypeId: string;
		}): Promise<UpdateIssueTypeResult> => {
			try {
				await updateIssue.mutateAsync({
					id,
					workspaceId: issueWorkspaceId,
					issueTypeId,
				});
				return { ok: true };
			} catch (err) {
				if (!(err instanceof ORPCError) || !err.defined) throw err;

				if (err.code === "ISSUE_TYPE_STATUS_REQUIRED") {
					const allowed = await queryClient.fetchQuery(
						orpc.issueType.listAllowedStatuses.queryOptions({
							input: {
								workspaceId: issueWorkspaceId,
								issueTypeId,
								teamId: _teamId ?? undefined,
							},
						}),
					);
					const allStatuses = await queryClient.fetchQuery(
						orpc.issue.status.list.queryOptions({
							input: { id: issueWorkspaceId },
						}),
					);
					const compatibleStatuses =
						allowed.length === 0
							? allStatuses
							: allStatuses.filter((s) =>
									allowed.some((a) => a.statusId === s.id),
								);
					return {
						ok: false,
						reason: "STATUS_REQUIRED",
						compatibleStatuses,
					};
				}

				throw err;
			}
		};

		const issueActions: IssueActions = {
			update: updateIssue.mutateAsync,
			updateIssueType,
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

	function useIssueTypeMutations({
		workspaceId,
		teamId,
	}: IssueTypeMutationParams) {
		const queryClient = useQueryClient();

		const matchesTeamScope = (queryTeamId?: string) =>
			teamId === undefined ||
			teamId === null ||
			queryTeamId === undefined ||
			queryTeamId === teamId;

		const invalidateIssueTypes = () => {
			queryClient.invalidateQueries({
				queryKey: issueTypeQueryKeys.all(),
				predicate: (query) => {
					const input = parseQueryInput(
						query.queryKey,
						issueTypeListQueryInputSchema,
					);
					return (
						input?.workspaceId === workspaceId && matchesTeamScope(input.teamId)
					);
				},
			});
		};

		const invalidateIssueListsAndSearch = () => {
			queryClient.invalidateQueries({
				queryKey: orpc.issue.list.key(),
				predicate: (query) => {
					const input = parseIssueListQueryInput(query.queryKey);
					return (
						input?.workspaceId === workspaceId && matchesTeamScope(input.teamId)
					);
				},
			});
			queryClient.invalidateQueries({
				queryKey: orpc.issue.search.key(),
				predicate: (query) => {
					const input = parseQueryInput(
						query.queryKey,
						issueSearchQueryInputSchema,
					);
					return (
						input?.workspaceId === workspaceId &&
						matchesTeamScope(input.filters?.teamId)
					);
				},
			});
		};

		const invalidateIssueDetailsAndActivity = () => {
			queryClient.invalidateQueries({
				queryKey: orpc.issue.get.key(),
				predicate: (query) => {
					const input = parseQueryInput(
						query.queryKey,
						workspaceScopedQueryInputSchema,
					);
					return input?.workspaceId === workspaceId;
				},
			});
			queryClient.invalidateQueries({
				queryKey: orpc.issue.activity.list.key(),
				predicate: (query) => {
					const input = parseQueryInput(
						query.queryKey,
						workspaceScopedQueryInputSchema,
					);
					return input?.workspaceId === workspaceId;
				},
			});
		};

		const invalidateCycleMetrics = () => {
			queryClient.invalidateQueries({
				queryKey: orpc.cycle.metrics.key(),
				predicate: (query) => {
					const input = parseQueryInput(
						query.queryKey,
						workspaceScopedQueryInputSchema,
					);
					return input?.workspaceId === workspaceId;
				},
			});
		};

		const invalidateSettingsMetadata = () => {
			invalidateIssueTypes();
		};

		const createIssueType = useMutation(
			orpc.issueType.create.mutationOptions({
				onSuccess: () => {
					invalidateSettingsMetadata();
					invalidateIssueListsAndSearch();
					notify?.success("Issue type created");
				},
				onError: () => {
					notify?.error("Failed to create issue type");
				},
			}),
		);

		const updateIssueType = useMutation(
			orpc.issueType.update.mutationOptions({
				onSuccess: () => {
					invalidateSettingsMetadata();
					invalidateIssueListsAndSearch();
					invalidateIssueDetailsAndActivity();
					notify?.success("Issue type updated");
				},
				onError: () => {
					notify?.error("Failed to update issue type");
				},
			}),
		);

		const archiveIssueType = useMutation(
			orpc.issueType.archive.mutationOptions({
				onSuccess: () => {
					invalidateSettingsMetadata();
					invalidateIssueListsAndSearch();
					invalidateIssueDetailsAndActivity();
					notify?.success("Issue type archived");
				},
				onError: (error) => {
					notify?.error(
						getIssueTypeArchiveErrorMessage(
							error,
							"Failed to archive issue type",
						),
					);
				},
			}),
		);

		const reassignAndArchiveIssueType = useMutation(
			orpc.issueType.reassignAndArchive.mutationOptions({
				onSuccess: () => {
					invalidateSettingsMetadata();
					invalidateIssueListsAndSearch();
					invalidateIssueDetailsAndActivity();
					invalidateCycleMetrics();
					notify?.success("Issue type archived and issues reassigned");
				},
				onError: (error) => {
					notify?.error(
						getIssueTypeArchiveErrorMessage(
							error,
							"Failed to reassign and archive issue type",
						),
					);
				},
			}),
		);

		const reorderIssueTypes = useMutation(
			orpc.issueType.reorder.mutationOptions({
				onSuccess: () => {
					invalidateSettingsMetadata();
					invalidateIssueListsAndSearch();
					notify?.success("Issue types reordered");
				},
				onError: () => {
					notify?.error("Failed to reorder issue types");
				},
			}),
		);

		const setDefaultIssueType = useMutation(
			orpc.issueType.setDefault.mutationOptions({
				onSuccess: () => {
					invalidateSettingsMetadata();
					invalidateIssueListsAndSearch();
					notify?.success("Default issue type set");
				},
				onError: () => {
					notify?.error("Failed to set default issue type");
				},
			}),
		);

		const hideIssueTypeForTeam = useMutation(
			orpc.issueType.hideForTeam.mutationOptions({
				onSuccess: () => {
					invalidateSettingsMetadata();
					invalidateIssueListsAndSearch();
					notify?.success("Issue type hidden for team");
				},
				onError: () => {
					notify?.error("Failed to hide issue type for team");
				},
			}),
		);

		const replaceIssueTypeForTeam = useMutation(
			orpc.issueType.replaceForTeam.mutationOptions({
				onSuccess: () => {
					invalidateSettingsMetadata();
					invalidateIssueListsAndSearch();
					notify?.success("Issue type replaced for team");
				},
				onError: () => {
					notify?.error("Failed to replace issue type for team");
				},
			}),
		);

		const restoreIssueTypeForTeam = useMutation(
			orpc.issueType.restoreForTeam.mutationOptions({
				onSuccess: () => {
					invalidateSettingsMetadata();
					invalidateIssueListsAndSearch();
					notify?.success("Issue type restored for team");
				},
				onError: () => {
					notify?.error("Failed to restore issue type for team");
				},
			}),
		);

		const issueTypeActions: IssueTypeActions = {
			createIssueType: createIssueType.mutateAsync,
			updateIssueType: updateIssueType.mutateAsync,
			archiveIssueType: archiveIssueType.mutateAsync,
			reassignAndArchiveIssueType: reassignAndArchiveIssueType.mutateAsync,
			reorderIssueTypes: reorderIssueTypes.mutateAsync,
			setDefaultIssueType: setDefaultIssueType.mutateAsync,
			hideIssueTypeForTeam: hideIssueTypeForTeam.mutateAsync,
			replaceIssueTypeForTeam: replaceIssueTypeForTeam.mutateAsync,
			restoreIssueTypeForTeam: restoreIssueTypeForTeam.mutateAsync,
		};

		return { issueTypeActions };
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
				// Search all cached list variants, including issueTypeId-filtered ones
				const allLists = queryClient.getQueriesData<Outputs["issue"]["list"]>({
					queryKey: orpc.issue.list.key(),
				});
				for (const [, data] of allLists) {
					const found = data?.find((candidate) => candidate.id === issueId);
					if (found) return found;
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

						// Update all cached list variants in-place (including issueTypeId-filtered
						// ones), so that type-filtered views receive live updates correctly.
						const allCachedLists = queryClient.getQueriesData<
							Outputs["issue"]["list"]
						>({ queryKey: orpc.issue.list.key() });

						for (const [cachedKey] of allCachedLists) {
							const listInput = parseIssueListQueryInput(cachedKey);
							if (!listInput) continue;
							// Only update cache entries that belong to this live-update
							// subscription's workspace/team context; skip foreign lists.
							if (
								listInput.workspaceId !== workspaceId ||
								listInput.teamId !== teamId
							)
								continue;

							queryClient.setQueryData<Outputs["issue"]["list"]>(
								cachedKey,
								(oldData) => {
									if (!oldData) return oldData;

									if (event.type === "create") {
										const visible =
											isIssueVisibleForArchivedFilter(
												event.issue,
												listInput.archivedFilter,
											) &&
											(listInput.issueTypeId === undefined ||
												event.issue.issueTypeId === listInput.issueTypeId);
										return visible ? [...oldData, event.issue] : oldData;
									}
									if (event.type === "update") {
										const visible =
											isIssueVisibleForArchivedFilter(
												event.issue,
												listInput.archivedFilter,
											) &&
											(listInput.issueTypeId === undefined ||
												event.issue.issueTypeId === listInput.issueTypeId);
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
		issueTypeQueryKeys,
		useIssueMutations,
		useIssueTypeMutations,
		useSubIssueSearch,
		useIssueLiveUpdates,
	};
}
