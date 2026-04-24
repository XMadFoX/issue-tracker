import type { issueCreateSchema } from "@prism/api/src/features/issues/schema";
import type { Outputs } from "@prism/api/src/router";
import { IssueList } from "@prism/blocks/src/features/issues/list/issue-list";
import { IssueDetailSheet } from "@prism/blocks/src/features/issues/modal/issue-detail-sheet";
import { useDebouncedValue } from "@tanstack/react-pacer";
import {
	skipToken,
	useMutation,
	useQuery,
	useQueryClient,
} from "@tanstack/react-query";
import { createFileRoute, Outlet, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { client, orpc } from "src/orpc/client";
import z from "zod";

const TEXT_SUB_ISSUE_QUERY_MIN_LENGTH = 2;
const ISSUE_NUMBER_QUERY_MIN_LENGTH = 1;
const SUB_ISSUE_QUERY_DEBOUNCE_MS = 300;
const ISSUE_NUMBER_QUERY_REGEX = /^\d+$/;

const searchParamsSchema = z.object({
	selectedIssue: z.string().optional(),
});

export const Route = createFileRoute("/workspace/$slug/teams/$teamSlug/issues")(
	{
		component: RouteComponent,
		validateSearch: searchParamsSchema,
	},
);

type SubmitResult = { success: true } | { error: unknown };

function getMinSubIssueQueryLength(query: string) {
	return ISSUE_NUMBER_QUERY_REGEX.test(query)
		? ISSUE_NUMBER_QUERY_MIN_LENGTH
		: TEXT_SUB_ISSUE_QUERY_MIN_LENGTH;
}

function RouteComponent() {
	const { slug, teamSlug } = Route.useParams();
	const search = Route.useSearch();
	const navigate = useNavigate();
	const [subIssueSearchQuery, setSubIssueSearchQuery] = useState("");
	const workspace = useQuery(
		orpc.workspace.getBySlug.queryOptions({ input: { slug } }),
	);

	const workspaceId = workspace.data?.id;

	const team = useQuery(
		orpc.team.getBySlug.queryOptions({
			input: workspaceId ? { key: teamSlug, workspaceId } : skipToken,
		}),
	);
	const priorities = useQuery(
		orpc.priority.list.queryOptions({
			input: workspaceId ? { workspaceId } : skipToken,
		}),
	);

	const issues = useQuery(
		orpc.issue.list.queryOptions({
			input:
				workspace.data?.id && team.data?.id
					? { workspaceId: workspace.data.id, teamId: team.data.id }
					: skipToken,
		}),
	);

	const labels = useQuery(
		orpc.label.list.queryOptions({
			input:
				workspace.data?.id && team.data?.id
					? {
							workspaceId: workspace.data.id,
							teamId: team.data.id,
							scope: "all",
						}
					: skipToken,
		}),
	);

	const teamMembers = useQuery(
		orpc.teamMembership.list.queryOptions({
			input:
				workspace.data?.id && team.data?.id
					? { workspaceId: workspace.data.id, teamId: team.data.id }
					: skipToken,
		}),
	);

	const addLabels = useMutation(
		orpc.issue.labels.bulkAdd.mutationOptions({
			onSuccess: () => {
				// TODO: optimistic mutation, no full refetch
				qc.invalidateQueries({ queryKey: orpc.issue.list.key() });
				if (search.selectedIssue && workspaceId) {
					qc.invalidateQueries({
						queryKey: orpc.issue.get.key({
							input: { id: search.selectedIssue, workspaceId },
						}),
					});
				}
			},
		}),
	);
	const deleteLabels = useMutation(
		orpc.issue.labels.bulkDelete.mutationOptions({
			onSuccess: () => {
				// TODO: no full refetch
				qc.invalidateQueries({ queryKey: orpc.issue.list.key() });
				if (search.selectedIssue && workspaceId) {
					qc.invalidateQueries({
						queryKey: orpc.issue.get.key({
							input: { id: search.selectedIssue, workspaceId },
						}),
					});
				}
			},
		}),
	);

	const updateIssuePriority = useMutation(
		orpc.issue.updatePriority.mutationOptions({
			onSuccess: () => {
				// TODO: optimistic mutation, no full refetch
				qc.invalidateQueries({ queryKey: orpc.issue.list.key() });
				if (search.selectedIssue && workspaceId) {
					qc.invalidateQueries({
						queryKey: orpc.issue.get.key({
							input: { id: search.selectedIssue, workspaceId },
						}),
					});
				}
			},
		}),
	);

	const updateIssueAssignee = useMutation(
		orpc.issue.updateAssignee.mutationOptions({
			onSuccess: () => {
				// TODO: optimistic mutation, no full refetch
				qc.invalidateQueries({ queryKey: orpc.issue.list.key() });
				if (search.selectedIssue && workspaceId) {
					qc.invalidateQueries({
						queryKey: orpc.issue.get.key({
							input: { id: search.selectedIssue, workspaceId },
						}),
					});
				}
			},
		}),
	);

	const moveIssue = useMutation(
		orpc.issue.move.mutationOptions({
			onSuccess: () => {
				qc.invalidateQueries({ queryKey: orpc.issue.list.key() });
			},
			onError: () => {
				toast.error("Failed to move issue");
			},
		}),
	);

	const statuses = useQuery(
		orpc.issue.status.list.queryOptions({
			input: workspace.data?.id ? { id: workspace.data.id } : skipToken,
		}),
	);

	const selectedIssue = useQuery(
		orpc.issue.get.queryOptions({
			input:
				search.selectedIssue && workspace.data?.id && team.data?.id
					? { id: search.selectedIssue, workspaceId: workspace.data.id }
					: skipToken,
		}),
	);

	const qc = useQueryClient();
	const createIssue = useMutation(orpc.issue.create.mutationOptions());
	const updateIssueParent = useMutation(
		orpc.issue.updateParent.mutationOptions(),
	);
	const onUpdate = useMutation(
		orpc.issue.update.mutationOptions({
			onSuccess: () => {
				qc.invalidateQueries({ queryKey: orpc.issue.list.key() });
				if (search.selectedIssue && workspaceId) {
					qc.invalidateQueries({
						queryKey: orpc.issue.get.key({
							input: { id: search.selectedIssue, workspaceId },
						}),
					});
				}
			},
		}),
	);
	const allIssues = issues.data ?? [];
	const selectedParentIssue = selectedIssue.data?.parentIssueId
		? (allIssues.find(
				(issue) => issue.id === selectedIssue.data?.parentIssueId,
			) ?? null)
		: null;
	const selectedSubIssues = selectedIssue.data
		? allIssues.filter(
				(issue) => issue.parentIssueId === selectedIssue.data?.id,
			)
		: [];
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
	const canSearchSubIssues = Boolean(
		workspaceId &&
			team.data?.id &&
			selectedIssue.data &&
			debouncedSubIssueSearchQuery.length >=
				debouncedMinSubIssueSearchQueryLength,
	);
	const subIssueSearch = useQuery(
		orpc.issue.search.queryOptions({
			input:
				workspaceId && team.data?.id && canSearchSubIssues
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
		const ids = new Set<string>();
		if (selectedIssue.data?.id) {
			ids.add(selectedIssue.data.id);
		}
		for (const subIssue of selectedSubIssues) {
			ids.add(subIssue.id);
		}
		return ids;
	}, [selectedIssue.data?.id, selectedSubIssues]);
	const attachableSubIssueResults = useMemo(
		() =>
			(subIssueSearch.data?.issues ?? []).filter(
				(issue) => !excludedSubIssueSearchIds.has(issue.id),
			),
		[subIssueSearch.data?.issues, excludedSubIssueSearchIds],
	);

	const invalidateIssue = (issueId: string) => {
		if (!workspaceId) return;
		qc.invalidateQueries({
			queryKey: orpc.issue.get.key({ input: { id: issueId, workspaceId } }),
		});
	};

	const invalidateHierarchy = (issueIds: Array<string>) => {
		qc.invalidateQueries({ queryKey: orpc.issue.list.key() });
		for (const issueId of issueIds) {
			invalidateIssue(issueId);
		}
	};

	const onIssueSubmit = async (
		issue: z.input<typeof issueCreateSchema>,
	): Promise<SubmitResult> => {
		try {
			const createdIssue = await createIssue.mutateAsync(issue);
			// TODO: optimistic mutation, no full refetch
			invalidateHierarchy(
				createdIssue.parentIssueId
					? [createdIssue.id, createdIssue.parentIssueId]
					: [createdIssue.id],
			);
			toast.success("Issue created successfully");
			return { success: true } as const;
		} catch (err) {
			toast.error("Issue creation failed");
			return { error: err };
		}
	};

	const attachSubIssue = async (
		subIssue: Outputs["issue"]["search"]["issues"][number],
	) => {
		if (!workspaceId || !selectedIssue.data) return;

		try {
			await updateIssueParent.mutateAsync({
				id: subIssue.id,
				workspaceId,
				parentIssueId: selectedIssue.data.id,
			});
			invalidateHierarchy(
				subIssue.parentIssueId
					? [selectedIssue.data.id, subIssue.id, subIssue.parentIssueId]
					: [selectedIssue.data.id, subIssue.id],
			);
			toast.success("Sub-item added");
		} catch (error) {
			toast.error("Failed to add sub-item");
			throw error;
		}
	};

	const detachSubIssue = async (subIssueId: string) => {
		if (!workspaceId || !selectedIssue.data) return;

		try {
			await updateIssueParent.mutateAsync({
				id: subIssueId,
				workspaceId,
				parentIssueId: null,
			});
			invalidateHierarchy([selectedIssue.data.id, subIssueId]);
			toast.success("Sub-item detached");
		} catch (error) {
			toast.error("Failed to detach sub-item");
			throw error;
		}
	};

	const getIssueUrl = (issue: {
		id: string;
		team?: { key: string } | null;
	}): `/${string}` => {
		const nextTeamSlug = issue.team?.key ?? teamSlug;
		return `/workspace/${slug}/teams/${nextTeamSlug}/issue/${issue.id}`;
	};

	// Live updates subscription
	useEffect(() => {
		if (!workspaceId || !team.data?.id) return;

		const abortController = new AbortController();

		(async () => {
			try {
				const iterator = await client.issue.live(
					{ workspaceId, teamId: team.data.id },
					{ signal: abortController.signal },
				);

				console.log("Live updates connected");

				for await (const event of iterator) {
					console.log("New issue update event", event);
					qc.setQueryData<Outputs["issue"]["list"]>(
						orpc.issue.list.queryKey({
							input: { workspaceId, teamId: team.data.id },
						}),
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
		})();

		return () => abortController.abort();
	}, [workspaceId, team.data?.id, qc]);

	if (workspace.isLoading || issues.isLoading || statuses.isLoading) {
		return (
			<div className="flex items-center justify-center h-full">
				<div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
			</div>
		);
	}

	return (
		<div className="p-6 space-y-8 w-full relative">
			<div className="flex items-center justify-between">
				<h1 className="text-2xl font-bold">Issues</h1>
			</div>

			<IssueList
				issues={issues.data ?? []}
				statuses={statuses.data ?? []}
				teamId={team?.data?.id ?? ""}
				priorities={priorities.data ?? []}
				labels={labels.data ?? []}
				teamMembers={teamMembers.data ?? []}
				workspaceId={workspaceId ?? ""}
				onIssueSubmit={onIssueSubmit}
				addLabels={addLabels.mutateAsync}
				deleteLabels={deleteLabels.mutateAsync}
				updateIssuePriority={updateIssuePriority.mutateAsync}
				updateIssueAssignee={updateIssueAssignee.mutateAsync}
				moveIssue={moveIssue.mutateAsync}
				onIssueClick={(issueId) => {
					navigate({
						to: ".",
						search: { selectedIssue: issueId },
					});
				}}
				getIssueUrl={getIssueUrl}
			/>
			<Outlet />
			{selectedIssue.data && (
				<IssueDetailSheet
					issue={selectedIssue.data}
					onClose={() => {
						navigate({
							to: ".",
							search: { selectedIssue: undefined },
						});
					}}
					statuses={statuses.data ?? []}
					priorities={priorities.data ?? []}
					labels={labels.data ?? []}
					teamMembers={teamMembers.data ?? []}
					workspaceId={workspaceId ?? ""}
					onUpdate={onUpdate.mutateAsync}
					updateIssuePriority={updateIssuePriority.mutateAsync}
					updateIssueAssignee={updateIssueAssignee.mutateAsync}
					addLabels={addLabels.mutateAsync}
					deleteLabels={deleteLabels.mutateAsync}
					teamId={team.data?.id ?? ""}
					parentIssue={selectedParentIssue}
					subIssues={selectedSubIssues}
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
					fullPageUrl={`/workspace/${slug}/teams/${teamSlug}/issue/${search.selectedIssue}`}
				/>
			)}
		</div>
	);
}
