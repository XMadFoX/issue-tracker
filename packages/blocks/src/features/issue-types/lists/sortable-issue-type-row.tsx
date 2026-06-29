"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Badge } from "@prism/ui/components/badge";
import { Button } from "@prism/ui/components/button";
import { InlineEdit } from "@prism/ui/components/inline-edit";
import { TableCell, TableRow } from "@prism/ui/components/table";
import { getRelativeTime } from "@prism/ui/lib/utils";
import { GripVertical, Star } from "lucide-react";
import { IssueTypeAppearanceControl } from "../components/issue-type-appearance-control";
import { IssueTypeRowMenu } from "../components/issue-type-row-menu";
import type {
	IssueType,
	IssueTypeHideForTeamInput,
	IssueTypeScopeValue,
	IssueTypeUpdateInput,
} from "../types";

type Props = {
	type: IssueType;
	managed: boolean;
	scope: IssueTypeScopeValue;
	/** Whether to show the per-row scope badge (only when the list mixes scopes). */
	showScopeBadge: boolean;
	workspaceId: string;
	onUpdate: (input: IssueTypeUpdateInput) => void;
	onSetDefault: (input: { id: string; workspaceId: string }) => void;
	onArchive: (type: IssueType) => void;
	onHide: (input: IssueTypeHideForTeamInput) => void;
	onReplaceStart: (type: IssueType) => void;
};

export function SortableIssueTypeRow({
	type,
	managed,
	scope,
	showScopeBadge,
	workspaceId,
	onUpdate,
	onSetDefault,
	onArchive,
	onHide,
	onReplaceStart,
}: Props) {
	const {
		attributes,
		listeners,
		setNodeRef,
		transform,
		transition,
		isDragging,
	} = useSortable({ id: type.id, disabled: !managed });

	const style = {
		transform: CSS.Transform.toString(transform),
		transition,
		opacity: isDragging ? 0.5 : undefined,
	};

	return (
		<TableRow ref={setNodeRef} style={style} className="group">
			<TableCell className="w-[40px] px-2 py-3">
				{managed ? (
					<button
						{...attributes}
						{...listeners}
						type="button"
						aria-label="Reorder type"
						className="cursor-grab rounded p-1 text-muted-foreground opacity-0 transition-opacity hover:bg-muted focus-visible:opacity-100 active:cursor-grabbing group-hover:opacity-100"
					>
						<GripVertical className="size-4" />
					</button>
				) : null}
			</TableCell>
			<TableCell className="px-2 py-3">
				<div className="flex items-center gap-3">
					<IssueTypeAppearanceControl
						icon={type.icon}
						color={type.color}
						disabled={!managed}
						onIconChange={(icon) =>
							onUpdate({ id: type.id, workspaceId, icon })
						}
						onColorChange={(color) =>
							onUpdate({ id: type.id, workspaceId, color })
						}
					/>
					<div className="min-w-0 flex-1 space-y-0.5">
						{managed ? (
							<InlineEdit
								value={type.name}
								onSave={(name) => onUpdate({ id: type.id, workspaceId, name })}
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
										onUpdate({
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
							{showScopeBadge ? (
								<Badge variant="outline">
									{type.teamId === null ? "Workspace" : "Team"}
								</Badge>
							) : null}
						</div>
					</div>
				</div>
			</TableCell>
			<TableCell className="max-w-lg px-6 py-3">
				{managed ? (
					<InlineEdit
						value={type.description ?? ""}
						onSave={(description) =>
							onUpdate({
								id: type.id,
								workspaceId,
								description: description.trim() ? description : null,
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
				) : managed ? (
					<Button
						type="button"
						variant="ghost"
						size="sm"
						onClick={() => onSetDefault({ id: type.id, workspaceId })}
					>
						Set default
					</Button>
				) : (
					<span className="text-muted-foreground">—</span>
				)}
			</TableCell>
			<TableCell className="px-6 py-3 text-right text-muted-foreground">
				{getRelativeTime(type.updatedAt)}
			</TableCell>
			<TableCell className="px-6 py-3">
				<div className="flex items-center justify-end">
					<IssueTypeRowMenu
						type={type}
						managed={managed}
						scope={scope}
						workspaceId={workspaceId}
						onArchive={onArchive}
						onHide={onHide}
						onReplaceStart={onReplaceStart}
					/>
				</div>
			</TableCell>
		</TableRow>
	);
}
