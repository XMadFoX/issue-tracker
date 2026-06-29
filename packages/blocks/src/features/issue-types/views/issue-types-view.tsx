import {
	closestCenter,
	DndContext,
	type DragEndEvent,
	KeyboardSensor,
	PointerSensor,
	useSensor,
	useSensors,
} from "@dnd-kit/core";
import {
	arrayMove,
	SortableContext,
	sortableKeyboardCoordinates,
	verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { Badge } from "@prism/ui/components/badge";
import { Button } from "@prism/ui/components/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@prism/ui/components/card";
import {
	ScopeSelect,
	type ScopeValue,
} from "@prism/ui/components/scope-select";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@prism/ui/components/table";
import { Plus } from "lucide-react";
import { useState } from "react";
import { SortableIssueTypeRow } from "../lists/sortable-issue-type-row";
import { IssueTypeArchiveDialog } from "../modals/issue-type-archive-dialog";
import { IssueTypeCreateModal } from "../modals/issue-type-create-modal";
import { IssueTypeReplaceDialog } from "../modals/issue-type-replace-dialog";
import type {
	IssueType,
	IssueTypeArchiveInput,
	IssueTypeCreateDraft,
	IssueTypeHideForTeamInput,
	IssueTypeReassignAndArchiveInput,
	IssueTypeReorderInput,
	IssueTypeReplaceForTeamInput,
	IssueTypeRestoreForTeamInput,
	IssueTypeScopeValue,
	IssueTypeSetDefaultInput,
	IssueTypeUpdateInput,
	SubmitResult,
	Team,
} from "../types";

type Props = {
	workspaceId: string;
	teams: Team[];
	scope: IssueTypeScopeValue;
	issueTypes: IssueType[];
	hiddenGlobalTypes: IssueType[];
	onScopeChange: (scope: IssueTypeScopeValue) => void;
	onCreateIssueType: (draft: IssueTypeCreateDraft) => Promise<SubmitResult>;
	onUpdateIssueType: (input: IssueTypeUpdateInput) => Promise<void>;
	onArchiveIssueType: (input: IssueTypeArchiveInput) => Promise<SubmitResult>;
	onReassignAndArchive: (
		input: IssueTypeReassignAndArchiveInput,
	) => Promise<SubmitResult>;
	onReorderIssueTypes: (input: IssueTypeReorderInput) => Promise<void>;
	onSetDefault: (input: IssueTypeSetDefaultInput) => Promise<void>;
	onHideForTeam: (input: IssueTypeHideForTeamInput) => Promise<void>;
	onReplaceForTeam: (input: IssueTypeReplaceForTeamInput) => Promise<void>;
	onRestoreForTeam: (input: IssueTypeRestoreForTeamInput) => Promise<void>;
};

export function IssueTypesView({
	workspaceId,
	teams,
	scope,
	issueTypes,
	hiddenGlobalTypes,
	onScopeChange,
	onCreateIssueType,
	onUpdateIssueType,
	onArchiveIssueType,
	onReassignAndArchive,
	onReorderIssueTypes,
	onSetDefault,
	onHideForTeam,
	onReplaceForTeam,
	onRestoreForTeam,
}: Props) {
	const [pendingArchive, setPendingArchive] = useState<IssueType | null>(null);
	const [isArchiving, setIsArchiving] = useState(false);
	const [pendingReplace, setPendingReplace] = useState<IssueType | null>(null);
	const [isReplacing, setIsReplacing] = useState(false);

	const scopeTeamId = scope.kind === "team" ? scope.teamId : null;
	const createTeamId = scopeTeamId;

	const isManagedRow = (row: IssueType) =>
		scope.kind === "workspace"
			? row.teamId === null
			: row.teamId === scopeTeamId;

	const teamReplacementOptions = issueTypes.filter(
		(type) => type.teamId === scopeTeamId && type.archivedAt === null,
	);

	// Only show per-row scope badges when the list actually mixes scopes
	// (e.g. team view shows inherited workspace types alongside team types).
	const hasMixedScopes =
		issueTypes.some((type) => type.teamId === null) &&
		issueTypes.some((type) => type.teamId !== null);

	const managedIds = issueTypes
		.filter((type) => isManagedRow(type))
		.map((type) => type.id);

	const sensors = useSensors(
		useSensor(PointerSensor),
		useSensor(KeyboardSensor, {
			coordinateGetter: sortableKeyboardCoordinates,
		}),
	);

	const handleDragEnd = async (event: DragEndEvent) => {
		const { active, over } = event;
		if (!over || active.id === over.id) {
			return;
		}
		const fromIndex = managedIds.indexOf(String(active.id));
		const toIndex = managedIds.indexOf(String(over.id));
		if (fromIndex === -1 || toIndex === -1) {
			return;
		}
		const orderedIds = arrayMove(managedIds, fromIndex, toIndex);
		await onReorderIssueTypes({
			workspaceId,
			teamId: scopeTeamId,
			orderedIds,
		});
	};

	const handleConfirmArchive = async (
		replacementIssueTypeId: string | null,
	) => {
		if (!pendingArchive || isArchiving) {
			return;
		}
		setIsArchiving(true);
		const result = replacementIssueTypeId
			? await onReassignAndArchive({
					id: pendingArchive.id,
					workspaceId,
					replacementIssueTypeId,
				})
			: await onArchiveIssueType({ id: pendingArchive.id, workspaceId });
		setIsArchiving(false);
		if ("success" in result) {
			setPendingArchive(null);
		}
	};

	const handleConfirmReplace = async (replacementIssueTypeId: string) => {
		if (!pendingReplace || scope.kind !== "team" || isReplacing) {
			return;
		}
		setIsReplacing(true);
		try {
			await onReplaceForTeam({
				workspaceId,
				teamId: scope.teamId,
				sourceIssueTypeId: pendingReplace.id,
				replacementIssueTypeId,
			});
			setPendingReplace(null);
		} finally {
			setIsReplacing(false);
		}
	};

	const scopeSelectValue: ScopeValue =
		scope.kind === "workspace"
			? { kind: "workspace" }
			: { kind: "team", teamId: scope.teamId };

	return (
		<div className="w-full p-6">
			<div className="mx-auto flex w-full flex-col gap-6">
				<Card>
					<CardHeader className="border-b px-6">
						<div className="flex flex-col gap-1.5 md:flex-row md:items-start md:justify-between">
							<div className="space-y-0.5">
								<CardTitle className="flex flex-wrap items-center gap-2">
									<span>Issue types</span>
									<Badge variant="outline">{issueTypes.length} types</Badge>
								</CardTitle>
								<CardDescription>
									Manage the issue types used across the tracker. Workspace
									admins manage global types; team leads can add team types or
									hide and replace workspace types for their team.
								</CardDescription>
							</div>
							<div className="flex items-center gap-3">
								<ScopeSelect
									value={scopeSelectValue}
									onValueChange={(value) =>
										onScopeChange(
											value.kind === "team"
												? { kind: "team", teamId: value.teamId }
												: { kind: "workspace" },
										)
									}
									teams={teams}
									className="w-48"
								/>
								<IssueTypeCreateModal
									workspaceId={workspaceId}
									teamId={createTeamId}
									onSubmit={onCreateIssueType}
									trigger={
										<Button size="sm" className="shrink-0">
											<Plus className="size-4" />
											Create type
										</Button>
									}
								/>
							</div>
						</div>
					</CardHeader>
					<CardContent className="p-0">
						<DndContext
							sensors={sensors}
							collisionDetection={closestCenter}
							onDragEnd={(event) => void handleDragEnd(event)}
						>
							<Table>
								<TableHeader>
									<TableRow className="hover:bg-transparent">
										<TableHead className="w-[40px] px-2 py-3" />
										<TableHead className="w-[300px] px-2 py-3">Type</TableHead>
										<TableHead className="px-6 py-3">Description</TableHead>
										<TableHead className="w-24 px-6 py-3">Default</TableHead>
										<TableHead className="w-30 px-6 text-right">
											Updated
										</TableHead>
										<TableHead className="w-16 px-6 text-right" />
									</TableRow>
								</TableHeader>
								<TableBody>
									{issueTypes.length > 0 ? (
										<SortableContext
											items={managedIds}
											strategy={verticalListSortingStrategy}
										>
											{issueTypes.map((type) => (
												<SortableIssueTypeRow
													key={type.id}
													type={type}
													managed={isManagedRow(type)}
													scope={scope}
													showScopeBadge={hasMixedScopes}
													workspaceId={workspaceId}
													onUpdate={(input) => void onUpdateIssueType(input)}
													onSetDefault={(input) => void onSetDefault(input)}
													onArchive={setPendingArchive}
													onHide={(input) => void onHideForTeam(input)}
													onReplaceStart={setPendingReplace}
												/>
											))}
										</SortableContext>
									) : (
										<TableRow>
											<TableCell colSpan={6} className="h-24 px-6 text-center">
												<div className="space-y-2">
													<p className="font-medium">No issue types yet.</p>
													<p className="text-sm text-muted-foreground">
														Create the first issue type to use it in issue forms
														and detail views.
													</p>
												</div>
											</TableCell>
										</TableRow>
									)}
								</TableBody>
							</Table>
						</DndContext>
					</CardContent>
				</Card>

				{scope.kind === "team" && hiddenGlobalTypes.length > 0 ? (
					<Card>
						<CardHeader className="border-b px-6">
							<CardTitle className="text-base">Hidden for this team</CardTitle>
							<CardDescription>
								Workspace types hidden or replaced for this team. Existing
								issues keep these types. Restore to make them selectable again.
							</CardDescription>
						</CardHeader>
						<CardContent className="p-0">
							<Table>
								<TableBody>
									{hiddenGlobalTypes.map((type) => (
										<TableRow key={type.id}>
											<TableCell className="px-6 py-3">
												<span className="flex items-center gap-2">
													<span>{type.icon}</span>
													<span className="font-medium">{type.name}</span>
													<Badge variant="outline">Workspace</Badge>
												</span>
											</TableCell>
											<TableCell className="px-6 py-3 text-right">
												<Button
													type="button"
													variant="ghost"
													size="sm"
													onClick={() =>
														void onRestoreForTeam({
															workspaceId,
															teamId: scopeTeamId ?? "",
															sourceIssueTypeId: type.id,
														})
													}
												>
													Restore
												</Button>
											</TableCell>
										</TableRow>
									))}
								</TableBody>
							</Table>
						</CardContent>
					</Card>
				) : null}
			</div>

			<IssueTypeArchiveDialog
				target={pendingArchive}
				reassignTargets={
					pendingArchive
						? issueTypes.filter(
								(type) =>
									type.id !== pendingArchive.id &&
									type.archivedAt === null &&
									isManagedRow(type),
							)
						: []
				}
				isConfirming={isArchiving}
				onOpenChange={(open) => {
					if (!open) {
						setPendingArchive(null);
					}
				}}
				onConfirm={(replacementIssueTypeId) =>
					void handleConfirmArchive(replacementIssueTypeId)
				}
			/>

			<IssueTypeReplaceDialog
				target={pendingReplace}
				replacementOptions={teamReplacementOptions}
				isConfirming={isReplacing}
				onOpenChange={(open) => {
					if (!open) {
						setPendingReplace(null);
					}
				}}
				onConfirm={(replacementIssueTypeId) =>
					void handleConfirmReplace(replacementIssueTypeId)
				}
			/>
		</div>
	);
}
