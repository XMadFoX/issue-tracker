import type { Outputs } from "@prism/api/src/router";
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
import { z } from "zod";
import {
	issueQueryKeys,
	useIssueLiveUpdates,
} from "@/features/issues/issues-feature";

export const Route = createFileRoute(
	"/workspace/$slug/teams/$teamSlug/cycles/",
)({
	component: RouteComponent,
});

function getCycleErrorMessage(error: unknown, fallback: string) {
	return error instanceof Error ? error.message : fallback;
}

// Minimal shape check for cached `issue.list` query keys, mirroring the
// parsing approach in `create-issues-feature.ts`, so completion can
// invalidate every cached list variant (archived filter, issue type filter,
// etc.) for this team without assuming there is only one cache entry.
const issueListQueryInputSchema = z.object({
	workspaceId: z.string(),
	teamId: z.string(),
});
const queryOptionsWithInputSchema = z.object({ input: z.unknown() });

function matchesTeamIssueList(
	queryKey: readonly unknown[],
	workspaceId: string,
	teamId: string,
) {
	const optionsResult = queryOptionsWithInputSchema.safeParse(queryKey[1]);
	if (!optionsResult.success) return false;
	const inputResult = issueListQueryInputSchema.safeParse(
		optionsResult.data.input,
	);
	return (
		inputResult.success &&
		inputResult.data.workspaceId === workspaceId &&
		inputResult.data.teamId === teamId
	);
}

function buildCompletionToastMessage(result: Outputs["cycle"]["complete"]) {
	const parts: string[] = [];
	if (result.counts.carriedOver > 0) {
		parts.push(
			`${result.counts.carriedOver} carried over to ${result.target?.name ?? "the target cycle"}`,
		);
	}
	if (result.counts.returnedToBacklog > 0) {
		parts.push(`${result.counts.returnedToBacklog} returned to backlog`);
	}
	if (parts.length === 0) return `${result.source.name} completed`;
	return `${result.source.name} completed — ${parts.join(", ")}`;
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
	const completeCycle = useMutation(orpc.cycle.complete.mutationOptions());

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

	// Completion changes cycle state, every affected issue's cycleId, and
	// creates rollover/backlog activity, so it needs a wider invalidation than
	// ordinary cycle updates: source+destination metrics, every scoped issue
	// list variant, and each affected issue's detail/activity cache. Live issue
	// updates already patch issue lists and metrics reactively, but this runs
	// synchronously so the UI is correct even if the live subscription lags.
	const invalidateAfterCompletion = async (
		result: Outputs["cycle"]["complete"],
	) => {
		await Promise.all([
			queryClient.invalidateQueries({ queryKey: orpc.cycle.list.key() }),
			...result.affectedCycleIds.map((cycleId) =>
				queryClient.invalidateQueries({
					queryKey: orpc.cycle.metrics.queryKey({
						input: { workspaceId: workspace.data.id, cycleId },
					}),
				}),
			),
			queryClient.invalidateQueries({
				queryKey: orpc.issue.list.key(),
				predicate: (query) =>
					matchesTeamIssueList(query.queryKey, workspace.data.id, team.data.id),
			}),
			...result.affectedIssueIds.flatMap((issueId) => [
				queryClient.invalidateQueries({
					queryKey: issueQueryKeys.issueDetail({
						workspaceId: workspace.data.id,
						issueId,
					}),
					exact: true,
				}),
				queryClient.invalidateQueries({
					queryKey: issueQueryKeys.issueActivity({
						workspaceId: workspace.data.id,
						issueId,
					}),
					exact: true,
				}),
			]),
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
				isCompleting={completeCycle.isPending}
				onComplete={async (value) => {
					try {
						const result = await completeCycle.mutateAsync({
							...value,
							workspaceId: workspace.data.id,
						});
						await invalidateAfterCompletion(result);
						toast.success(buildCompletionToastMessage(result));
					} catch (error) {
						console.error(error);
						toast.error(
							getCycleErrorMessage(error, "Failed to complete cycle"),
						);
						// The failure may mean another actor already completed or
						// canceled this cycle; refresh so the UI converges with the
						// server instead of showing a stale active cycle.
						await invalidateCycles();
						throw error;
					}
				}}
			/>
		</div>
	);
}
