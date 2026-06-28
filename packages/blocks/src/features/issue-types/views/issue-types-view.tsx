import { Badge } from "@prism/ui/components/badge";
import { Button } from "@prism/ui/components/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@prism/ui/components/card";
import ColorPicker from "@prism/ui/components/color-picker";
import { EmojiPickerField } from "@prism/ui/components/emoji-picker-field";
import { InlineEdit } from "@prism/ui/components/inline-edit";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@prism/ui/components/select";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@prism/ui/components/table";
import { getRelativeTime } from "@prism/ui/lib/utils";
import {
	ArrowDown,
	ArrowUp,
	EyeOff,
	Plus,
	Replace,
	Star,
	Trash2,
} from "lucide-react";
import { useState } from "react";
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

const WORKSPACE_SCOPE = "__workspace__";

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

type RowActionsProps = {
	type: IssueType;
	managed: boolean;
	scope: IssueTypeScopeValue;
	scopeIndex: number;
	scopeCount: number;
	workspaceId: string;
	onMove: (id: string, direction: -1 | 1) => void;
	onArchive: (type: IssueType) => void;
	onHide: (input: IssueTypeHideForTeamInput) => void;
	onReplaceStart: (type: IssueType) => void;
};

function RowActions({
	type,
	managed,
	scope,
	scopeIndex,
	scopeCount,
	workspaceId,
	onMove,
	onArchive,
	onHide,
	onReplaceStart,
}: RowActionsProps) {
	if (managed) {
		return (
			<>
				<Button
					type="button"
					variant="ghost"
					size="icon-sm"
					disabled={scopeIndex === 0}
					onClick={() => onMove(type.id, -1)}
					aria-label="Move up"
				>
					<ArrowUp className="size-4" />
				</Button>
				<Button
					type="button"
					variant="ghost"
					size="icon-sm"
					disabled={scopeIndex === scopeCount - 1}
					onClick={() => onMove(type.id, 1)}
					aria-label="Move down"
				>
					<ArrowDown className="size-4" />
				</Button>
				<Button
					type="button"
					variant="ghost"
					size="icon-sm"
					onClick={() => onArchive(type)}
					aria-label="Archive type"
				>
					<Trash2 className="size-4" />
				</Button>
			</>
		);
	}

	if (scope.kind === "team") {
		const teamId = scope.teamId;
		return (
			<>
				<Button
					type="button"
					variant="ghost"
					size="icon-sm"
					onClick={() =>
						onHide({ workspaceId, teamId, sourceIssueTypeId: type.id })
					}
					aria-label="Hide for team"
					title="Hide for this team"
				>
					<EyeOff className="size-4" />
				</Button>
				<Button
					type="button"
					variant="ghost"
					size="icon-sm"
					onClick={() => onReplaceStart(type)}
					aria-label="Replace for team"
					title="Replace for this team"
				>
					<Replace className="size-4" />
				</Button>
			</>
		);
	}

	return null;
}

function moveWithinScope(
	issueTypes: IssueType[],
	id: string,
	direction: -1 | 1,
): { teamId: string | null; orderedIds: string[] } | null {
	const row = issueTypes.find((type) => type.id === id);
	if (!row) {
		return null;
	}
	const scopeRows = issueTypes.filter((type) => type.teamId === row.teamId);
	const currentIndex = scopeRows.findIndex((type) => type.id === id);
	const targetIndex = currentIndex + direction;
	if (targetIndex < 0 || targetIndex >= scopeRows.length) {
		return null;
	}
	const orderedIds = scopeRows.map((type) => type.id);
	const [moved] = orderedIds.splice(currentIndex, 1);
	orderedIds.splice(targetIndex, 0, moved);
	return { teamId: row.teamId, orderedIds };
}

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

	const handleMove = async (id: string, direction: -1 | 1) => {
		const result = moveWithinScope(issueTypes, id, direction);
		if (!result) {
			return;
		}
		await onReorderIssueTypes({
			workspaceId,
			teamId: result.teamId,
			orderedIds: result.orderedIds,
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

	const scopeSelectValue =
		scope.kind === "workspace" ? WORKSPACE_SCOPE : scope.teamId;

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
								<Select
									value={scopeSelectValue}
									onValueChange={(value) =>
										onScopeChange(
											value && value !== WORKSPACE_SCOPE
												? { kind: "team", teamId: value }
												: { kind: "workspace" },
										)
									}
								>
									<SelectTrigger className="w-44">
										<SelectValue />
									</SelectTrigger>
									<SelectContent>
										<SelectItem value={WORKSPACE_SCOPE}>Workspace</SelectItem>
										{teams.map((team) => (
											<SelectItem key={team.id} value={team.id}>
												{team.name}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
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
						<Table>
							<TableHeader>
								<TableRow className="hover:bg-transparent">
									<TableHead className="w-[340px] px-6 py-3">Type</TableHead>
									<TableHead className="px-6 py-3">Description</TableHead>
									<TableHead className="w-24 px-6 py-3">Default</TableHead>
									<TableHead className="w-30 px-6 text-right">
										Updated
									</TableHead>
									<TableHead className="w-44 px-6 text-right">
										Actions
									</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{issueTypes.length > 0 ? (
									issueTypes.map((type) => {
										const managed = isManagedRow(type);
										const scopeRows = issueTypes.filter(
											(row) => row.teamId === type.teamId,
										);
										const scopeIndex = scopeRows.findIndex(
											(row) => row.id === type.id,
										);
										return (
											<TableRow key={type.id}>
												<TableCell className="px-6 py-3">
													<div className="flex items-center gap-3">
														<EmojiPickerField
															label=""
															value={type.icon}
															onChange={(icon) => {
																if (!managed) {
																	return;
																}
																void onUpdateIssueType({
																	id: type.id,
																	workspaceId,
																	icon,
																});
															}}
														/>
														<ColorPicker
															value={type.color ?? "#000000"}
															onChange={(color) => {
																if (!managed) {
																	return;
																}
																void onUpdateIssueType({
																	id: type.id,
																	workspaceId,
																	color,
																});
															}}
															showControls={false}
															trigger={
																<div
																	className="size-3.5 shrink-0 rounded-full border"
																	style={{
																		backgroundColor:
																			type.color ?? "transparent",
																	}}
																	title="Edit color"
																/>
															}
														/>
														<div className="min-w-0 flex-1 space-y-0.5">
															{managed ? (
																<InlineEdit
																	value={type.name}
																	onSave={(name) =>
																		void onUpdateIssueType({
																			id: type.id,
																			workspaceId,
																			name,
																		})
																	}
																	placeholder="Unnamed type"
																/>
															) : (
																<span className="font-medium">{type.name}</span>
															)}
															<div className="flex items-center gap-2 text-xs text-muted-foreground">
																{managed && type.isEditable ? (
																	<InlineEdit
																		value={type.key}
																		onSave={(key) =>
																			void onUpdateIssueType({
																				id: type.id,
																				workspaceId,
																				key: key.trim().toLowerCase(),
																			})
																		}
																		placeholder="key"
																	/>
																) : (
																	<span>{type.key}</span>
																)}
																{type.teamId === null ? (
																	<Badge variant="outline">Workspace</Badge>
																) : (
																	<Badge variant="outline">Team</Badge>
																)}
															</div>
														</div>
													</div>
												</TableCell>
												<TableCell className="max-w-lg px-6 py-3">
													{managed ? (
														<InlineEdit
															value={type.description ?? ""}
															onSave={(description) =>
																void onUpdateIssueType({
																	id: type.id,
																	workspaceId,
																	description: description.trim()
																		? description
																		: null,
																})
															}
															multiline
															placeholder="Add description..."
														/>
													) : (
														<span className="text-sm text-muted-foreground">
															{type.description ?? "—"}
														</span>
													)}
												</TableCell>
												<TableCell className="px-6 py-3">
													{type.isDefault ? (
														<Badge variant="secondary">
															<Star className="size-3 fill-current" />
															Default
														</Badge>
													) : null}
													{!type.isDefault && managed ? (
														<Button
															type="button"
															variant="ghost"
															size="sm"
															onClick={() =>
																void onSetDefault({ id: type.id, workspaceId })
															}
														>
															Set default
														</Button>
													) : null}
													{!type.isDefault && !managed ? (
														<span className="text-muted-foreground">—</span>
													) : null}
												</TableCell>
												<TableCell className="px-6 py-3 text-right text-muted-foreground">
													{getRelativeTime(type.updatedAt)}
												</TableCell>
												<TableCell className="px-6 py-3">
													<div className="flex items-center justify-end gap-1">
														<RowActions
															type={type}
															managed={managed}
															scope={scope}
															scopeIndex={scopeIndex}
															scopeCount={scopeRows.length}
															workspaceId={workspaceId}
															onMove={(id, direction) =>
																void handleMove(id, direction)
															}
															onArchive={setPendingArchive}
															onHide={(input) => void onHideForTeam(input)}
															onReplaceStart={setPendingReplace}
														/>
													</div>
												</TableCell>
											</TableRow>
										);
									})
								) : (
									<TableRow>
										<TableCell colSpan={5} className="h-24 px-6 text-center">
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
