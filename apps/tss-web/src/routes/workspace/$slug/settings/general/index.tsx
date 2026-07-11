import {
	type SubmitHandler,
	type WorkspaceGeneralUpdateInput,
	WorkspaceSettingsView,
} from "@prism/blocks/src/features/workspace-settings";
import {
	useMutation,
	useQueryClient,
	useSuspenseQuery,
} from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { orpc } from "src/orpc/client";

export const Route = createFileRoute("/workspace/$slug/settings/general/")({
	component: RouteComponent,
});

function RouteComponent() {
	const { slug } = Route.useParams();
	const navigate = useNavigate();
	const queryClient = useQueryClient();
	const workspace = useSuspenseQuery(
		orpc.workspace.getBySlug.queryOptions({ input: { slug } }),
	);
	const deleteWorkspace = useMutation(
		orpc.workspace.delete.mutationOptions({}),
	);
	const updateWorkspace = useMutation(
		orpc.workspace.update.mutationOptions({}),
	);

	const handleUpdateWorkspace: SubmitHandler<
		WorkspaceGeneralUpdateInput
	> = async (input) => {
		try {
			await updateWorkspace.mutateAsync(input);
			await Promise.all([
				queryClient.invalidateQueries({
					queryKey: orpc.workspace.list.queryKey(),
				}),
				queryClient.invalidateQueries({
					queryKey: orpc.workspace.getBySlug.queryKey({ input: { slug } }),
				}),
			]);

			if (input.slug !== slug) {
				await queryClient.invalidateQueries({
					queryKey: orpc.workspace.getBySlug.queryKey({
						input: { slug: input.slug },
					}),
				});
				await queryClient.ensureQueryData(
					orpc.workspace.getBySlug.queryOptions({
						input: { slug: input.slug },
					}),
				);
				await navigate({
					to: "/workspace/$slug/settings/general",
					params: { slug: input.slug },
				});
			}

			toast.success("Workspace updated");
			return { success: true };
		} catch (error) {
			return { error };
		}
	};

	const handleDeleteWorkspace = async (confirmationSlug: string) => {
		try {
			await deleteWorkspace.mutateAsync({
				id: workspace.data.id,
				confirmationSlug,
			});
			await queryClient.invalidateQueries({
				queryKey: orpc.workspace.list.queryKey(),
			});
			toast.success("Workspace deleted");
			navigate({ to: "/" });
		} catch {
			toast.error("Failed to delete workspace");
		}
	};

	return (
		<div className="w-full p-6">
			<WorkspaceSettingsView
				workspace={workspace.data}
				isDeleting={deleteWorkspace.isPending}
				onUpdateWorkspace={handleUpdateWorkspace}
				onDeleteWorkspace={handleDeleteWorkspace}
			/>
		</div>
	);
}
