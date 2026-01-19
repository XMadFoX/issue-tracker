import type { issueCreateSchema } from "@prism/api/src/features/issues/schema";
import { IssueList } from "@prism/blocks/src/features/issues/list/issue-list";
import { IssueDetailSheet } from "@prism/blocks/src/features/issues/modal/issue-detail-sheet";
import {
	skipToken,
	useMutation,
	useQuery,
	useQueryClient,
} from "@tanstack/react-query";
import { createFileRoute, Outlet, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { orpc } from "src/orpc/client";
import z from "zod";

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

function RouteComponent() {
	const { slug, teamSlug } = Route.useParams();
	const search = Route.useSearch();
	const navigate = useNavigate();
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

	const onIssueSubmit = async (
		issue: z.input<typeof issueCreateSchema>,
	): Promise<SubmitResult> => {
		try {
			await createIssue.mutateAsync(issue);
			// TODO: optimistic mutation, no full refetch
			qc.invalidateQueries({ queryKey: orpc.issue.list.key() });
			toast.success("Issue created successfully");
			return { success: true } as const;
		} catch (err) {
			toast.error("Issue creation failed");
			return { error: err };
		}
	};

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
					fullPageUrl={`/workspace/$slug/teams/$teamSlug/issue/${search.selectedIssue}`}
				/>
			)}
		</div>
	);
}
