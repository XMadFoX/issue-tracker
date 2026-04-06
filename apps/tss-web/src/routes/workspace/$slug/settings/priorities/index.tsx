import type { Inputs } from "@prism/api/src/router";
import {
	IssuePrioritiesView,
	type IssuePriorityCreateDraft,
	type SubmitResult,
} from "@prism/blocks/src/features/issue-priorities";
import {
	useMutation,
	useQuery,
	useQueryClient,
	useSuspenseQuery,
} from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import { orpc } from "src/orpc/client";

export const Route = createFileRoute("/workspace/$slug/settings/priorities/")({
	component: RouteComponent,
});

function getNextPriorityRank(priorities: Array<{ rank: number }>): number {
	const highestRank = priorities.reduce((max, priority) => {
		return priority.rank > max ? priority.rank : max;
	}, -1);

	return highestRank + 1;
}

function RouteComponent() {
	const { slug } = Route.useParams();
	const queryClient = useQueryClient();

	const workspace = useSuspenseQuery(
		orpc.workspace.getBySlug.queryOptions({ input: { slug } }),
	);
	const priorities = useQuery(
		orpc.priority.list.queryOptions({
			input: { workspaceId: workspace.data.id },
		}),
	);

	const createPriority = useMutation(orpc.priority.create.mutationOptions({}));
	const updatePriority = useMutation(orpc.priority.update.mutationOptions({}));
	const deletePriority = useMutation(orpc.priority.delete.mutationOptions({}));
	const reorderPriority = useMutation(
		orpc.priority.reorder.mutationOptions({}),
	);

	const refreshPriorities = async () => {
		await queryClient.invalidateQueries({
			queryKey: orpc.priority.list.queryKey({
				input: { workspaceId: workspace.data.id },
			}),
		});
	};

	const handleCreatePriority = async (
		input: IssuePriorityCreateDraft,
	): Promise<SubmitResult> => {
		try {
			await createPriority.mutateAsync({
				...input,
				rank: getNextPriorityRank(priorities.data ?? []),
			});
			await refreshPriorities();
			toast.success("Priority created");
			return { success: true };
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : "Failed to create priority",
			);
			return { error };
		}
	};

	const handleUpdatePriority = async (input: Inputs["priority"]["update"]) => {
		try {
			await updatePriority.mutateAsync(input);
			await refreshPriorities();
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : "Failed to update priority",
			);
		}
	};

	const handleDeletePriority = async (
		input: Inputs["priority"]["delete"],
	): Promise<SubmitResult> => {
		try {
			await deletePriority.mutateAsync(input);
			await refreshPriorities();
			toast.success("Priority deleted");
			return { success: true };
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : "Failed to delete priority",
			);
			return { error };
		}
	};

	const handleReorderPriorities = async (
		input: Inputs["priority"]["reorder"],
	) => {
		try {
			await reorderPriority.mutateAsync(input);
			await refreshPriorities();
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : "Failed to reorder priorities",
			);
		}
	};

	return (
		<IssuePrioritiesView
			workspaceId={workspace.data.id}
			priorities={priorities.data ?? []}
			onCreatePriority={handleCreatePriority}
			onUpdatePriority={handleUpdatePriority}
			onDeletePriority={handleDeletePriority}
			onReorderPriorities={handleReorderPriorities}
		/>
	);
}
