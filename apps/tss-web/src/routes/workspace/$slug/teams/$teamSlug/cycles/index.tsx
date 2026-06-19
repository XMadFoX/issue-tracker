import {
	CycleList,
	type CycleMetrics,
} from "@prism/blocks/src/features/cycles";
import {
	useMutation,
	useQueries,
	useQueryClient,
	useSuspenseQuery,
} from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import { orpc } from "src/orpc/client";
import { useIssueLiveUpdates } from "@/features/issues/issues-feature";

export const Route = createFileRoute(
	"/workspace/$slug/teams/$teamSlug/cycles/",
)({
	component: RouteComponent,
});

function getCycleErrorMessage(error: unknown, fallback: string) {
	return error instanceof Error ? error.message : fallback;
}

function RouteComponent() {
	const { slug, teamSlug } = Route.useParams();
	const queryClient = useQueryClient();

	const workspace = useSuspenseQuery(
		orpc.workspace.getBySlug.queryOptions({ input: { slug } }),
	);
	const team = useSuspenseQuery(
		orpc.team.getBySlug.queryOptions({
			input: { workspaceId: workspace.data.id, key: teamSlug },
		}),
	);
	useIssueLiveUpdates({ workspaceId: workspace.data.id, teamId: team.data.id });
	const cycles = useSuspenseQuery(
		orpc.cycle.list.queryOptions({
			input: { workspaceId: workspace.data.id, teamId: team.data.id },
		}),
	);
	const metrics = useQueries({
		queries: cycles.data.map((cycle) =>
			orpc.cycle.metrics.queryOptions({
				input: { workspaceId: workspace.data.id, cycleId: cycle.id },
			}),
		),
	});
	const metricsByCycleId = new Map<string, CycleMetrics>();
	for (const result of metrics) {
		if (result.data) metricsByCycleId.set(result.data.cycleId, result.data);
	}

	const createCycle = useMutation(orpc.cycle.create.mutationOptions());
	const updateCycle = useMutation(orpc.cycle.update.mutationOptions());
	const deleteCycle = useMutation(orpc.cycle.delete.mutationOptions());

	const invalidateCycles = async (cycleId?: string) => {
		await Promise.all([
			queryClient.invalidateQueries({ queryKey: orpc.cycle.list.key() }),
			cycleId
				? queryClient.invalidateQueries({
						queryKey: orpc.cycle.metrics.queryKey({
							input: { workspaceId: workspace.data.id, cycleId },
						}),
					})
				: queryClient.invalidateQueries({ queryKey: orpc.cycle.metrics.key() }),
		]);
	};

	return (
		<div className="w-full p-6">
			<CycleList
				cycles={cycles.data}
				metricsByCycleId={metricsByCycleId}
				cycleDuration={team.data.cycleDuration}
				onCreate={async (value) => {
					try {
						await createCycle.mutateAsync({
							...value,
							workspaceId: workspace.data.id,
							teamId: team.data.id,
						});
						await invalidateCycles();
						toast.success("Cycle created");
					} catch (error) {
						console.error(error);
						toast.error(getCycleErrorMessage(error, "Failed to create cycle"));
					}
				}}
				onUpdate={async (value) => {
					try {
						await updateCycle.mutateAsync({
							...value,
							workspaceId: workspace.data.id,
						});
						await invalidateCycles(value.id);
						toast.success("Cycle updated");
					} catch (error) {
						console.error(error);
						toast.error(getCycleErrorMessage(error, "Failed to update cycle"));
					}
				}}
				onDelete={async (cycle) => {
					if (cycle.state !== "planned" && cycle.state !== "canceled") {
						toast.error("Only planned or canceled cycles can be deleted");
						return;
					}
					try {
						await deleteCycle.mutateAsync({
							workspaceId: workspace.data.id,
							id: cycle.id,
						});
						await invalidateCycles(cycle.id);
						toast.success("Cycle deleted");
					} catch (error) {
						console.error(error);
						toast.error(getCycleErrorMessage(error, "Failed to delete cycle"));
					}
				}}
			/>
		</div>
	);
}
