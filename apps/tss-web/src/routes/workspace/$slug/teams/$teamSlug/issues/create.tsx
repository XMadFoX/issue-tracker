import type { issueCreateSchema } from "@prism/api/src/features/issues/schema";
import { IssueCreateForm } from "@prism/blocks/src/features/issues";
import {
	skipToken,
	useMutation,
	useQueries,
	useQuery,
	useQueryClient,
	useSuspenseQuery,
} from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import { toast } from "sonner";
import { orpc } from "src/orpc/client";
import type z from "zod";

export const Route = createFileRoute(
	"/workspace/$slug/teams/$teamSlug/issues/create",
)({
	component: RouteComponent,
});

type SubmitResult = { success: true } | { error: unknown };

function RouteComponent() {
	const { slug, teamSlug } = Route.useParams();
	const workspace = useSuspenseQuery(
		orpc.workspace.getBySlug.queryOptions({ input: { slug } }),
	);
	const workspaceId = workspace.data?.id;

	const team = useQuery(
		orpc.team.getBySlug.queryOptions({
			input: workspaceId
				? { key: teamSlug, workspaceId: workspace?.data?.id }
				: skipToken,
			enabled: !!workspace?.data?.id,
		}),
	);
	const priorities = useQuery(
		orpc.priority.list.queryOptions({
			input: workspaceId ? { workspaceId: workspace.data.id } : skipToken,
		}),
	);
	const statuses = useQuery(
		orpc.issue.status.list.queryOptions({
			input: workspaceId ? { id: workspace.data.id } : skipToken,
		}),
	);
	const issueTypes = useQuery(
		orpc.issueType.list.queryOptions({
			input:
				workspaceId && team.data?.id
					? {
							workspaceId: workspace.data.id,
							teamId: team.data.id,
							includeArchived: false,
						}
					: skipToken,
		}),
	);

	const teamId = team.data?.id;
	const issueTypeList = issueTypes.data ?? [];
	const issueTypeAllowedStatuses = useQueries({
		queries: teamId
			? issueTypeList.map((type) =>
					orpc.issueType.listAllowedStatuses.queryOptions({
						input: {
							workspaceId: workspace.data.id,
							teamId,
							issueTypeId: type.id,
						},
					}),
				)
			: [],
	});

	// An empty allowed-status array means "open constraints" (all statuses
	// allowed). To avoid conflating that with a pending/failed fetch, only build
	// the map from successfully loaded queries and gate the form on readiness.
	const allowedStatusesPending = issueTypeAllowedStatuses.some(
		(query) => query.isPending,
	);
	const allowedStatusesError = issueTypeAllowedStatuses.some(
		(query) => query.isError,
	);
	const allowedStatusesByIssueTypeId = useMemo(
		() =>
			Object.fromEntries(
				issueTypeList.flatMap((type, index) => {
					const data = issueTypeAllowedStatuses[index]?.data;
					if (data === undefined) return [];
					return [[type.id, data.map((a) => a.statusId)]];
				}),
			),
		[issueTypeList, issueTypeAllowedStatuses],
	);

	const isFormDataReady =
		team.isSuccess &&
		priorities.isSuccess &&
		statuses.isSuccess &&
		issueTypes.isSuccess &&
		!allowedStatusesPending &&
		!allowedStatusesError;

	const qc = useQueryClient();
	const createIssue = useMutation(orpc.issue.create.mutationOptions());

	const onSubmit = async (
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

	if (allowedStatusesError) {
		return (
			<div className="flex w-full flex-col items-center justify-center gap-3 py-12 text-center">
				<p className="font-medium text-sm">
					Couldn't load status constraints for issue types.
				</p>
				<p className="text-muted-foreground text-sm">
					Refresh the page to try again.
				</p>
			</div>
		);
	}

	if (!isFormDataReady) {
		return (
			<div className="flex w-full items-center justify-center py-12 text-muted-foreground text-sm">
				Loading…
			</div>
		);
	}

	return (
		<div className="w-full flex flex-col items-center justify-center">
			<IssueCreateForm
				workspaceId={workspace.data.id}
				teamId={team.data.id}
				statuses={statuses.data}
				priorities={priorities.data}
				issueTypes={issueTypes.data}
				allowedStatusesByIssueTypeId={allowedStatusesByIssueTypeId}
				onSubmit={onSubmit}
			/>
		</div>
	);
}
