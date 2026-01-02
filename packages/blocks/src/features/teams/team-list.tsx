import type { teamCreateSchema } from "@prism/api/src/features/teams/schema";
import type { Inputs, Outputs } from "@prism/api/src/router";
import { Button } from "@prism/ui/components/button";
import ColorPicker from "@prism/ui/components/color-picker";
import { InlineEdit } from "@prism/ui/components/inline-edit";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@prism/ui/components/table";
import { getRelativeTime } from "@prism/ui/lib/utils";
import { Plus } from "lucide-react";
import { useCallback } from "react";
import type z from "zod";
import { TeamCreateModal } from "./modal/create-modal";

type Team = Outputs["team"]["listByWorkspace"][0];
type UpdateTeam = Inputs["team"]["update"];
type CreateTeam = Inputs["team"]["create"];
type SubmitResult = { success: true } | { error: unknown };

interface TeamListProps {
	teams: Team[];
	onTeamSubmit: (
		team: z.input<typeof teamCreateSchema>,
	) => Promise<SubmitResult>;
	updateTeam?: (input: UpdateTeam) => Promise<void>;
	workspaceId: string;
}

export function TeamList({
	teams,
	onTeamSubmit,
	updateTeam,
	workspaceId,
}: TeamListProps) {
	const handleCreateTeam = useCallback(
		async (input: CreateTeam): Promise<SubmitResult> => {
			if (!onTeamSubmit)
				return { error: new Error("onTeamSubmit not provided") };
			try {
				const res = await onTeamSubmit(input);
				if ("error" in res) {
					return { error: res.error };
				}
				return { success: true };
			} catch (error) {
				return { error };
			}
		},
		[onTeamSubmit],
	);

	return (
		<div className="space-y-4 w-full">
			<div className="flex items-center justify-between gap-4">
				<h2 className="text-2xl font-bold">Teams</h2>
				<TeamCreateModal
					workspaceId={workspaceId}
					onSubmit={handleCreateTeam}
					trigger={
						<Button size="sm">
							<Plus className="size-4" />
							Create team
						</Button>
					}
				/>
			</div>

			<div className="rounded-md border">
				<Table>
					<TableHeader>
						<TableRow className="hover:bg-transparent">
							<TableHead className="w-[100px]">Key</TableHead>
							<TableHead>Name</TableHead>
							<TableHead>Privacy</TableHead>
							<TableHead>Created</TableHead>
							<TableHead className="text-right">Updated</TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{teams.length > 0 ? (
							teams.map((team) => (
								<TableRow key={team.id}>
									<TableCell className="font-medium text-muted-foreground">
										{team.key}
									</TableCell>
									<TableCell>
										<div className="flex items-center gap-2">
											{updateTeam ? (
												<ColorPicker
													value={team.color ?? "#000000"}
													onChange={(color) =>
														updateTeam({ id: team.id, color, workspaceId })
													}
													showControls={false}
													trigger={
														<div
															className="size-4 rounded-full border-2 cursor-pointer"
															style={{
																backgroundColor: team.color ?? "transparent",
															}}
														/>
													}
												/>
											) : (
												<div
													className="size-4 rounded-full border-2"
													style={{
														backgroundColor: team.color ?? "transparent",
													}}
												/>
											)}
											{updateTeam ? (
												<InlineEdit
													value={team.name}
													onSave={(name) =>
														updateTeam({ id: team.id, name, workspaceId })
													}
													placeholder="Unnamed team"
												/>
											) : (
												team.name
											)}
										</div>
									</TableCell>
									<TableCell>{team.privacy}</TableCell>
									<TableCell className="text-muted-foreground">
										{new Date(team.createdAt).toLocaleDateString()}
									</TableCell>
									<TableCell className="text-right text-muted-foreground">
										{getRelativeTime(team.updatedAt)}
									</TableCell>
								</TableRow>
							))
						) : (
							<TableRow>
								<TableCell colSpan={5} className="h-24 text-center">
									No teams found.
								</TableCell>
							</TableRow>
						)}
					</TableBody>
				</Table>
			</div>
		</div>
	);
}
