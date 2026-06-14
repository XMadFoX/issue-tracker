import { Badge } from "@prism/ui/components/badge";
import { Button } from "@prism/ui/components/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@prism/ui/components/card";
import { ConfirmActionDialog } from "@prism/ui/components/confirm-action-dialog";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@prism/ui/components/select";
import {
	ArrowDown,
	ArrowLeft,
	ArrowRight,
	ArrowUp,
	Lock,
	Plus,
} from "lucide-react";
import { useState } from "react";
import { GroupEditorSheet } from "../modals/group-editor-sheet";
import { StatusEditorSheet } from "../modals/status-editor-sheet";
import type {
	IssueStatus,
	IssueStatusCreateDraft,
	IssueStatusDeleteInput,
	IssueStatusGroup,
	IssueStatusGroupCreateDraft,
	IssueStatusGroupDeleteInput,
	IssueStatusGroupReorderInput,
	IssueStatusGroupUpdateInput,
	IssueStatusReorderInput,
	IssueStatusUpdateInput,
	SubmitResult,
	Team,
	WorkflowScopeValue,
} from "../types";

type Props = {
	workspaceId: string;
	teams: Team[];
	scope: WorkflowScopeValue;
	groups: IssueStatusGroup[];
	statuses: IssueStatus[];
	onScopeChange: (value: WorkflowScopeValue) => void;
	onCreateStatus: (input: IssueStatusCreateDraft) => Promise<SubmitResult>;
	onUpdateStatus: (input: IssueStatusUpdateInput) => Promise<SubmitResult>;
	onDeleteStatus: (input: IssueStatusDeleteInput) => Promise<SubmitResult>;
	onReorderStatuses: (input: IssueStatusReorderInput) => Promise<void>;
	onCreateGroup: (input: IssueStatusGroupCreateDraft) => Promise<SubmitResult>;
	onUpdateGroup: (input: IssueStatusGroupUpdateInput) => Promise<SubmitResult>;
	onDeleteGroup: (input: IssueStatusGroupDeleteInput) => Promise<SubmitResult>;
	onReorderGroups: (input: IssueStatusGroupReorderInput) => Promise<void>;
	isLoading?: boolean;
	isDeletingStatus?: boolean;
	isDeletingGroup?: boolean;
};

const sortByOrder = <T extends { orderIndex: number }>(items: T[]) =>
	[...items].sort((a, b) => a.orderIndex - b.orderIndex);

function moveId(ids: string[], id: string, direction: -1 | 1) {
	const index = ids.indexOf(id);
	const target = index + direction;
	if (index < 0 || target < 0 || target >= ids.length) return null;
	const next = [...ids];
	const [moved] = next.splice(index, 1);
	next.splice(target, 0, moved);
	return next;
}

export function IssueStatusesView({
	workspaceId,
	teams,
	scope,
	groups,
	statuses,
	onScopeChange,
	onCreateStatus,
	onUpdateStatus,
	onDeleteStatus,
	onReorderStatuses,
	onCreateGroup,
	onUpdateGroup,
	onDeleteGroup,
	onReorderGroups,
	isLoading = false,
	isDeletingStatus = false,
	isDeletingGroup = false,
}: Props) {
	const [deleteStatus, setDeleteStatus] = useState<IssueStatus | null>(null);
	const [deleteGroup, setDeleteGroup] = useState<IssueStatusGroup | null>(null);
	const readOnly = scope.kind === "team";
	const canCreateStatus = !readOnly && groups.length > 0 && !isLoading;
	const orderedGroups = sortByOrder(groups);
	const orderedStatuses = sortByOrder(statuses);
	const knownGroupIds = new Set(groups.map((group) => group.id));
	const ungrouped = orderedStatuses.filter(
		(status) => !knownGroupIds.has(status.statusGroupId),
	);
	const groupIds = orderedGroups.map((group) => group.id);
	const scopeValue =
		scope.kind === "workspace" ? "workspace" : `team:${scope.teamId}`;
	const moveStatus = async (status: IssueStatus, direction: -1 | 1) => {
		const currentGroup = orderedStatuses.filter(
			(item) => item.statusGroupId === status.statusGroupId,
		);
		const visibleIds = moveId(
			currentGroup.map((item) => item.id),
			status.id,
			direction,
		);
		if (!visibleIds) return;
		const ids = orderedStatuses.map((item) => item.id);
		const groupPositions = orderedStatuses
			.map((item, index) =>
				item.statusGroupId === status.statusGroupId ? index : -1,
			)
			.filter((index) => index >= 0);
		const next = [...ids];
		groupPositions.forEach((position, index) => {
			next[position] = visibleIds[index] ?? next[position];
		});
		await onReorderStatuses({ workspaceId, orderedIds: next });
	};
	return (
		<div className="w-full p-6">
			<Card>
				<CardHeader className="border-b px-6">
					<div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
						<div className="space-y-1">
							<CardTitle className="flex items-center gap-2">
								<span>Workflow</span>
								<Badge variant="outline">{statuses.length} statuses</Badge>
							</CardTitle>
							<CardDescription>
								Configure the lifecycle stages and statuses used by issues.
							</CardDescription>
						</div>
						<div className="flex flex-wrap items-center gap-2">
							<Select
								value={scopeValue}
								onValueChange={(value) => {
									if (!value) return;
									onScopeChange(
										value === "workspace"
											? { kind: "workspace" }
											: { kind: "team", teamId: value.replace("team:", "") },
									);
								}}
							>
								<SelectTrigger className="w-56" aria-label="Workflow scope">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="workspace">Workspace default</SelectItem>
									{teams.map((team) => (
										<SelectItem key={team.id} value={`team:${team.id}`}>
											{team.name}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
							<GroupEditorSheet
								workspaceId={workspaceId}
								onSubmit={onCreateGroup}
								trigger={
									<Button
										type="button"
										variant="secondary"
										size="sm"
										disabled={readOnly}
									>
										<Plus className="size-4" />
										Add group
									</Button>
								}
							/>
							<StatusEditorSheet
								workspaceId={workspaceId}
								groups={groups}
								teams={teams}
								scope={scope}
								onSubmit={onCreateStatus}
								trigger={
									<Button type="button" size="sm" disabled={!canCreateStatus}>
										<Plus className="size-4" />
										Add status
									</Button>
								}
							/>
						</div>
					</div>
				</CardHeader>
				<CardContent className="space-y-4 p-6">
					{readOnly ? (
						<div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
							Team scopes are inherited read-only previews. Customize workflow
							is not available yet.
						</div>
					) : null}
					{isLoading ? (
						<div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
							Loading workflow statuses...
						</div>
					) : null}
					{!isLoading && statuses.length === 0 ? (
						<div className="rounded-lg border border-dashed p-8 text-center">
							<p className="font-medium">No workflow statuses yet</p>
							<p className="text-sm text-muted-foreground">
								Create statuses to define how issues move from intake to
								completion.
							</p>
						</div>
					) : null}
					<div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-5">
						{orderedGroups.map((group, groupIndex) => {
							const groupStatuses = orderedStatuses.filter(
								(status) => status.statusGroupId === group.id,
							);
							return (
								<Card key={group.id} className="bg-muted/20">
									<CardHeader className="space-y-2 p-4">
										<div className="flex items-start justify-between gap-2">
											<div>
												<CardTitle className="text-base">
													{group.name}
												</CardTitle>
												{group.description ? (
													<CardDescription>{group.description}</CardDescription>
												) : null}
											</div>
											{group.isEditable ? null : (
												<Badge variant="outline">
													<Lock className="size-3" />
													System
												</Badge>
											)}
										</div>
										<div className="flex gap-1">
											<Button
												type="button"
												variant="ghost"
												size="icon-sm"
												disabled={readOnly || groupIndex === 0}
												onClick={() => {
													const orderedIds = moveId(groupIds, group.id, -1);
													if (orderedIds)
														void onReorderGroups({ workspaceId, orderedIds });
												}}
												aria-label="Move group left"
											>
												<ArrowLeft className="size-4" />
											</Button>
											<Button
												type="button"
												variant="ghost"
												size="icon-sm"
												disabled={
													readOnly || groupIndex === orderedGroups.length - 1
												}
												onClick={() => {
													const orderedIds = moveId(groupIds, group.id, 1);
													if (orderedIds)
														void onReorderGroups({ workspaceId, orderedIds });
												}}
												aria-label="Move group right"
											>
												<ArrowRight className="size-4" />
											</Button>
											<GroupEditorSheet
												workspaceId={workspaceId}
												group={group}
												statusCount={groupStatuses.length}
												onSubmit={onUpdateGroup}
												onDelete={setDeleteGroup}
												trigger={
													<Button
														type="button"
														variant="ghost"
														size="sm"
														disabled={readOnly || !group.isEditable}
													>
														Edit
													</Button>
												}
											/>
										</div>
									</CardHeader>
									<CardContent className="space-y-2 p-4 pt-0">
										{groupStatuses.map((status, statusIndex) => (
											<div
												key={status.id}
												className="rounded-md border bg-background p-3"
											>
												<div className="flex items-start gap-2">
													<span
														className="mt-1 size-3 rounded-full border"
														style={{
															backgroundColor: status.color ?? "transparent",
														}}
													/>
													<div className="min-w-0 flex-1">
														<p className="truncate text-sm font-medium">
															{status.name}
														</p>
														{status.description ? (
															<p className="line-clamp-2 text-xs text-muted-foreground">
																{status.description}
															</p>
														) : null}
													</div>
													<Button
														type="button"
														variant="ghost"
														size="icon-sm"
														disabled={readOnly || statusIndex === 0}
														onClick={() => {
															void moveStatus(status, -1);
														}}
														aria-label="Move status up"
													>
														<ArrowUp className="size-3" />
													</Button>
													<Button
														type="button"
														variant="ghost"
														size="icon-sm"
														disabled={
															readOnly ||
															statusIndex === groupStatuses.length - 1
														}
														onClick={() => {
															void moveStatus(status, 1);
														}}
														aria-label="Move status down"
													>
														<ArrowDown className="size-3" />
													</Button>
													<StatusEditorSheet
														workspaceId={workspaceId}
														groups={groups}
														teams={teams}
														scope={scope}
														status={status}
														onSubmit={onUpdateStatus}
														onDelete={setDeleteStatus}
														trigger={
															<Button
																type="button"
																variant="ghost"
																size="sm"
																disabled={readOnly}
															>
																Edit
															</Button>
														}
													/>
												</div>
											</div>
										))}
										<StatusEditorSheet
											workspaceId={workspaceId}
											groups={groups}
											teams={teams}
											scope={scope}
											defaultGroupId={group.id}
											onSubmit={onCreateStatus}
											trigger={
												<Button
													type="button"
													variant="ghost"
													className="w-full"
													disabled={!canCreateStatus}
												>
													<Plus className="size-4" />
													Add status
												</Button>
											}
										/>
									</CardContent>
								</Card>
							);
						})}
						{ungrouped.length > 0 ? (
							<Card className="border-dashed">
								<CardHeader>
									<CardTitle className="text-base">Ungrouped</CardTitle>
									<CardDescription>
										Assign these statuses to a group before reordering.
									</CardDescription>
								</CardHeader>
								<CardContent className="space-y-2">
									{ungrouped.map((status) => (
										<div
											key={status.id}
											className="flex items-center justify-between gap-2 rounded-md border p-3 text-sm"
										>
											<span>{status.name}</span>
											<StatusEditorSheet
												workspaceId={workspaceId}
												groups={groups}
												teams={teams}
												scope={scope}
												status={status}
												onSubmit={onUpdateStatus}
												onDelete={setDeleteStatus}
												trigger={
													<Button
														type="button"
														variant="ghost"
														size="sm"
														disabled={readOnly}
													>
														Edit
													</Button>
												}
											/>
										</div>
									))}
								</CardContent>
							</Card>
						) : null}
					</div>
				</CardContent>
			</Card>
			<ConfirmActionDialog
				open={deleteStatus !== null}
				onOpenChange={(open) => {
					if (!open) setDeleteStatus(null);
				}}
				title={`Delete "${deleteStatus?.name ?? "status"}"?`}
				description="Issues using this status may prevent deletion."
				confirmLabel="Delete status"
				confirmingLabel="Deleting..."
				isConfirming={isDeletingStatus}
				onConfirm={async () => {
					if (!deleteStatus) return;
					const result = await onDeleteStatus({
						id: deleteStatus.id,
						workspaceId,
					});
					if ("success" in result) setDeleteStatus(null);
				}}
			/>
			<ConfirmActionDialog
				open={deleteGroup !== null}
				onOpenChange={(open) => {
					if (!open) setDeleteGroup(null);
				}}
				title={`Delete "${deleteGroup?.name ?? "group"}"?`}
				description="Only empty editable groups can be deleted."
				confirmLabel="Delete group"
				confirmingLabel="Deleting..."
				isConfirming={isDeletingGroup}
				onConfirm={async () => {
					if (!deleteGroup) return;
					const result = await onDeleteGroup({
						id: deleteGroup.id,
						workspaceId,
					});
					if ("success" in result) setDeleteGroup(null);
				}}
			/>
		</div>
	);
}
