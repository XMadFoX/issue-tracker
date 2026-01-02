import type { Inputs, Outputs } from "@prism/api/src/router";
import { TeamList } from "@prism/blocks/src/features/teams/team-list";
import { useDebouncedCallback } from "@tanstack/react-pacer";
import {
	useMutation,
	useQuery,
	useQueryClient,
	useSuspenseQuery,
} from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useCallback } from "react";
import { orpc } from "src/orpc/client";

export const Route = createFileRoute("/workspace/$slug/teams/")({
	component: RouteComponent,
});

function RouteComponent() {
	const { slug } = Route.useParams();

	const workspace = useSuspenseQuery(
		orpc.workspace.getBySlug.queryOptions({ input: { slug } }),
	);

	const teams = useQuery(
		orpc.team.listByWorkspace.queryOptions({
			input: { id: workspace.data.id },
		}),
	);

	const queryClient = useQueryClient();
	const updateTeam = useMutation(orpc.team.update.mutationOptions({}));

	const debouncedUpdateTeam = useDebouncedCallback(
		async (input: Inputs["team"]["update"]) => {
			await updateTeam.mutateAsync(input);
		},
		{ wait: 300 },
	);

	const handleUpdateTeam = useCallback(
		async (input: Inputs["team"]["update"]) => {
			const previousTeams = queryClient.getQueryData<
				Outputs["team"]["listByWorkspace"]
			>(
				orpc.team.listByWorkspace.queryKey({
					input: { id: workspace.data.id },
				}),
			);

			queryClient.setQueryData<Outputs["team"]["listByWorkspace"]>(
				orpc.team.listByWorkspace.queryKey({
					input: { id: workspace.data.id },
				}),
				(old) =>
					old?.map((team) =>
						team.id === input.id ? { ...team, ...input } : team,
					),
			);

			try {
				debouncedUpdateTeam(input);
			} catch (error) {
				queryClient.setQueryData(
					orpc.team.listByWorkspace.queryKey({
						input: { id: workspace.data.id },
					}),
					previousTeams,
				);
				throw error;
			}
		},
		[debouncedUpdateTeam, workspace.data.id, queryClient],
	);

	const createTeam = useMutation(orpc.team.create.mutationOptions({}));

	const handleCreateTeam = useCallback(
		async (
			input: Inputs["team"]["create"],
		): Promise<{ success: true } | { error: unknown }> => {
			console.log("handleCreateTeam", input);

			const existingTeams = queryClient.getQueryData<
				Outputs["team"]["listByWorkspace"]
			>(
				orpc.team.listByWorkspace.queryKey({
					input: { id: workspace.data.id },
				}),
			);

			const hasConflict = existingTeams?.some(
				(team) => team.key.toLowerCase() === input.key.toLowerCase(),
			);

			if (hasConflict) {
				return {
					error: new Error(
						`Team with key "${input.key}" already exists in this workspace`,
					),
				};
			}

			const previousTeams = existingTeams;

			queryClient.setQueryData<Outputs["team"]["listByWorkspace"]>(
				orpc.team.listByWorkspace.queryKey({
					input: { id: workspace.data.id },
				}),
				(old) =>
					old
						? [
								...old,
								{
									...input,
									id: `temp-${Date.now()}`,
									color: input.color ?? null,
									leadId: input.leadId ?? null,
									cycleDuration: input.cycleDuration ?? null,
									triageMode: input.triageMode ?? null,
									createdAt: new Date(),
									updatedAt: new Date(),
								},
							]
						: [],
			);

			try {
				const res = await createTeam.mutateAsync(input);
				console.log("created team", res);
				await queryClient.invalidateQueries({
					queryKey: orpc.team.listByWorkspace.queryKey({
						input: { id: workspace.data.id },
					}),
				});
				return { success: true };
			} catch (error) {
				console.error("create team failed", error);
				queryClient.setQueryData(
					orpc.team.listByWorkspace.queryKey({
						input: { id: workspace.data.id },
					}),
					previousTeams,
				);
				return { error };
			}
		},
		[createTeam, workspace.data.id, queryClient],
	);

	return (
		<div className="p-6 w-full">
			<TeamList
				teams={teams.data ?? []}
				onTeamSubmit={handleCreateTeam}
				updateTeam={handleUpdateTeam}
				workspaceId={workspace.data.id}
			/>
		</div>
	);
}
