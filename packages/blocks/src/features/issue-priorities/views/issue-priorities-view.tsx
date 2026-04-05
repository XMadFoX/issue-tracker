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
import { ConfirmActionDialog } from "@prism/ui/components/confirm-action-dialog";
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
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { PriorityCreateModal } from "../modals/priority-create-modal";
import type {
	IssuePriority,
	IssuePriorityCreateDraft,
	IssuePriorityDeleteInput,
	IssuePriorityReorderInput,
	IssuePriorityUpdateInput,
	SubmitResult,
} from "../types";

type Props = {
	workspaceId: string;
	priorities: IssuePriority[];
	onCreatePriority: (
		priority: IssuePriorityCreateDraft,
	) => Promise<SubmitResult>;
	onUpdatePriority: (input: IssuePriorityUpdateInput) => Promise<void>;
	onDeletePriority: (input: IssuePriorityDeleteInput) => Promise<SubmitResult>;
	onReorderPriorities: (input: IssuePriorityReorderInput) => Promise<void>;
};

function movePriorityIds(
	priorities: IssuePriority[],
	priorityId: string,
	direction: -1 | 1,
): string[] | null {
	const currentIndex = priorities.findIndex(
		(priority) => priority.id === priorityId,
	);
	if (currentIndex === -1) {
		return null;
	}

	const targetIndex = currentIndex + direction;
	if (targetIndex < 0 || targetIndex >= priorities.length) {
		return null;
	}

	const orderedIds = priorities.map((priority) => priority.id);
	const [movedPriorityId] = orderedIds.splice(currentIndex, 1);
	orderedIds.splice(targetIndex, 0, movedPriorityId);
	return orderedIds;
}

export function IssuePrioritiesView({
	workspaceId,
	priorities,
	onCreatePriority,
	onUpdatePriority,
	onDeletePriority,
	onReorderPriorities,
}: Props) {
	const [pendingDeletePriority, setPendingDeletePriority] =
		useState<IssuePriority | null>(null);
	const [isDeletingPriority, setIsDeletingPriority] = useState(false);

	const handleMovePriority = async (priorityId: string, direction: -1 | 1) => {
		const orderedIds = movePriorityIds(priorities, priorityId, direction);
		if (!orderedIds) {
			return;
		}

		await onReorderPriorities({ workspaceId, orderedIds });
	};

	const handleConfirmDelete = async () => {
		if (!pendingDeletePriority || isDeletingPriority) {
			return;
		}

		setIsDeletingPriority(true);
		const result = await onDeletePriority({
			id: pendingDeletePriority.id,
			workspaceId,
		});
		setIsDeletingPriority(false);

		if ("success" in result) {
			setPendingDeletePriority(null);
		}
	};

	return (
		<div className="w-full p-6">
			<div className="mx-auto flex w-full flex-col gap-6">
				<Card className="">
					<CardHeader className="border-b px-6">
						<div className="flex flex-col gap-1.5 md:flex-row md:items-start md:justify-between">
							<div className="space-y-0.5">
								<CardTitle className="flex flex-wrap items-center gap-2">
									<span>Priority configuration</span>
									<Badge variant="outline">
										{priorities.length} priorities
									</Badge>
								</CardTitle>
								<CardDescription>
									Shape the priority ladder used throughout the issue tracker.
									Inline edits update the shared list immediately, and the row
									controls keep ordering explicit.
								</CardDescription>
							</div>
							<div className="flex items-center gap-3">
								<PriorityCreateModal
									workspaceId={workspaceId}
									onSubmit={onCreatePriority}
									trigger={
										<Button size="sm" className="shrink-0">
											<Plus className="size-4" />
											Create priority
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
									<TableHead className="w-[320px] px-6 py-3">
										Priority
									</TableHead>
									<TableHead className="px-6 py-3">Description</TableHead>
									<TableHead className="w-30 px-6 py-3">Created</TableHead>
									<TableHead className="w-30 px-6 text-right">
										Updated
									</TableHead>
									<TableHead className="w-40 px-6 text-right">
										Actions
									</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{priorities.length > 0 ? (
									priorities.map((priority, index) => (
										<TableRow key={priority.id}>
											<TableCell className="px-6 py-3">
												<div className="flex items-center gap-3">
													<ColorPicker
														value={priority.color ?? "#000000"}
														onChange={(color) => {
															void onUpdatePriority({
																id: priority.id,
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
																		priority.color ?? "transparent",
																}}
																title="Edit priority color"
															/>
														}
													/>
													<div className="min-w-0 flex-1 space-y-0.5">
														<InlineEdit
															value={priority.name}
															onSave={(name) => {
																void onUpdatePriority({
																	id: priority.id,
																	workspaceId,
																	name,
																});
															}}
															placeholder="Unnamed priority"
														/>
														<div className="text-xs text-muted-foreground">
															Rank {index + 1}
														</div>
													</div>
												</div>
											</TableCell>
											<TableCell className="max-w-lg px-6 py-3">
												<InlineEdit
													value={priority.description ?? ""}
													onSave={(description) => {
														void onUpdatePriority({
															id: priority.id,
															workspaceId,
															description: description.trim()
																? description
																: null,
														});
													}}
													multiline
													placeholder="Add description..."
												/>
											</TableCell>
											<TableCell className="px-6 py-3 text-muted-foreground">
												{new Date(priority.createdAt).toLocaleDateString()}
											</TableCell>
											<TableCell className="px-6 py-3 text-right text-muted-foreground">
												{getRelativeTime(priority.updatedAt)}
											</TableCell>
											<TableCell className="px-6 py-3">
												<div className="flex items-center justify-end gap-1">
													<Button
														type="button"
														variant="ghost"
														size="icon-sm"
														disabled={index === 0}
														onClick={() => {
															void handleMovePriority(priority.id, -1);
														}}
														aria-label="Move priority up"
													>
														<ArrowUp className="size-4" />
													</Button>
													<Button
														type="button"
														variant="ghost"
														size="icon-sm"
														disabled={index === priorities.length - 1}
														onClick={() => {
															void handleMovePriority(priority.id, 1);
														}}
														aria-label="Move priority down"
													>
														<ArrowDown className="size-4" />
													</Button>
													<Button
														type="button"
														variant="ghost"
														size="icon-sm"
														onClick={() => setPendingDeletePriority(priority)}
														aria-label="Delete priority"
													>
														<Trash2 className="size-4" />
													</Button>
												</div>
											</TableCell>
										</TableRow>
									))
								) : (
									<TableRow>
										<TableCell colSpan={5} className="h-24 px-6 text-center">
											<div className="space-y-2">
												<p className="font-medium">No priorities yet.</p>
												<p className="text-sm text-muted-foreground">
													Create the first priority to seed the ladder used by
													issue forms and detail views.
												</p>
											</div>
										</TableCell>
									</TableRow>
								)}
							</TableBody>
						</Table>
					</CardContent>
				</Card>
			</div>

			<ConfirmActionDialog
				open={pendingDeletePriority !== null}
				onOpenChange={(open) => {
					if (!open) {
						setPendingDeletePriority(null);
					}
				}}
				title={`Delete "${pendingDeletePriority?.name ?? "priority"}"?`}
				description={
					pendingDeletePriority
						? "Issues using this priority will keep their issue records, but the priority reference will be cleared."
						: "Delete this priority?"
				}
				confirmLabel="Delete priority"
				confirmingLabel="Deleting..."
				onConfirm={handleConfirmDelete}
				isConfirming={isDeletingPriority}
			/>
		</div>
	);
}
