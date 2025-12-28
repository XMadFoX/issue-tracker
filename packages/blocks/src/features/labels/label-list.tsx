import type { Inputs, Outputs } from "@prism/api/src/router";
import { Button } from "@prism/ui/components/button";
import ColorPicker from "@prism/ui/components/color-picker";
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
	type ColumnDef,
	flexRender,
	getCoreRowModel,
	useReactTable,
} from "@tanstack/react-table";
import { PlusIcon } from "lucide-react";
import { useCallback, useMemo } from "react";
import { LabelCreateModal } from "./modal/create-modal";

type Label = Outputs["label"]["list"][0];
type LabelListInput = Inputs["label"]["list"];
type TeamId = Extract<LabelListInput, { scope: "team" }>["teamId"];
type UpdateLabel = Inputs["label"]["update"];
type CreateLabel = Inputs["label"]["create"];
type SubmitResult = { success: true } | { error: unknown };
export type ScopeSelectorValue = "workspace" | "all" | TeamId;

interface LabelListProps {
	labels: Label[];
	teams: Outputs["team"]["listByWorkspace"];
	onScopeChange: (value: ScopeSelectorValue) => void;
	currentScopeValue: ScopeSelectorValue;
	updateLabel?: (input: UpdateLabel) => Promise<void>;
	createLabel?: (input: CreateLabel) => Promise<SubmitResult>;
	workspaceId: string;
}

export const createColumns = (
	updateLabel?: LabelListProps["updateLabel"],
): ColumnDef<Label>[] => [
	{
		accessorKey: "name",
		header: "Name",
		cell: ({ row }) => {
			const label = row.original;
			return (
				<div className="flex items-center gap-2">
					<ColorPicker
						value={label.color ?? "#000000"}
						onChange={(color) => updateLabel?.({ id: label.id, color })}
						showControls={false}
						trigger={
							<div
								className="size-3 rounded-full border-2 cursor-pointer"
								style={{ backgroundColor: label.color ?? "transparent" }}
							/>
						}
					/>
					<InlineEdit
						value={label.name}
						onSave={(name) => updateLabel?.({ id: label.id, name })}
						placeholder="Unnamed label"
					/>
				</div>
			);
		},
	},
	{
		accessorKey: "description",
		header: "Description",
		cell: ({ row }) => {
			const label = row.original;
			return (
				<InlineEdit
					value={label.description ?? ""}
					onSave={(description) => updateLabel?.({ id: label.id, description })}
					multiline
					placeholder="Add description..."
				/>
			);
		},
	},
	{
		accessorKey: "updatedAt",
		header: "Updated At",
		cell: ({ row }) => {
			const label = row.original;
			return getRelativeTime(label.updatedAt);
		},
	},
	{
		accessorKey: "createdAt",
		header: "Created At",
		cell: ({ row }) => {
			const label = row.original;
			return new Date(label.createdAt).toLocaleDateString();
		},
	},
];

export function LabelList({
	labels,
	teams,
	onScopeChange,
	currentScopeValue,
	updateLabel,
	createLabel,
	workspaceId,
}: LabelListProps) {
	const columns = useMemo(() => createColumns(updateLabel), [updateLabel]);

	const table = useReactTable({
		data: labels,
		columns,
		getCoreRowModel: getCoreRowModel(),
	});

	const handleCreateLabel = useCallback(
		async (
			input: CreateLabel,
		): Promise<{ success: true } | { error: unknown }> => {
			if (!createLabel) {
				return { error: new Error("createLabel not provided") };
			}
			try {
				await createLabel(input);
				return { success: true };
			} catch (error) {
				return { error };
			}
		},
		[createLabel],
	);

	const initialTeamId =
		currentScopeValue !== "workspace" && currentScopeValue !== "all"
			? currentScopeValue
			: undefined;

	return (
		<div className="space-y-4 w-full">
			<div className="flex items-center justify-between gap-4">
				<Select
					value={currentScopeValue}
					onValueChange={(value) => onScopeChange(value as ScopeSelectorValue)}
				>
					<SelectTrigger className="w-[200px]">
						<SelectValue placeholder="Scope" />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value="workspace">Workspace</SelectItem>
						<SelectItem value="all">Workspace & all teams</SelectItem>
						{teams.map((team) => (
							<SelectItem key={team.id} value={team.id}>
								{team.name}
							</SelectItem>
						))}
					</SelectContent>
				</Select>

				{createLabel && (
					<LabelCreateModal
						workspaceId={workspaceId}
						teams={teams}
						initialTeamId={initialTeamId}
						onSubmit={handleCreateLabel}
						trigger={
							<Button size="sm">
								<PlusIcon className="size-4" />
								Create label
							</Button>
						}
					/>
				)}
			</div>

			<div className="rounded-md border">
				<Table>
					<TableHeader>
						{table.getHeaderGroups().map((headerGroup) => (
							<TableRow key={headerGroup.id}>
								{headerGroup.headers.map((header) => {
									return (
										<TableHead key={header.id}>
											{header.isPlaceholder
												? null
												: flexRender(
														header.column.columnDef.header,
														header.getContext(),
													)}
										</TableHead>
									);
								})}
							</TableRow>
						))}
					</TableHeader>
					<TableBody>
						{table.getRowModel().rows?.length ? (
							table.getRowModel().rows.map((row) => (
								<TableRow
									key={row.id}
									data-state={row.getIsSelected() && "selected"}
								>
									{row.getVisibleCells().map((cell) => (
										<TableCell key={cell.id}>
											{flexRender(
												cell.column.columnDef.cell,
												cell.getContext(),
											)}
										</TableCell>
									))}
								</TableRow>
							))
						) : (
							<TableRow>
								<TableCell
									colSpan={columns.length}
									className="h-24 text-center"
								>
									No results.
								</TableCell>
							</TableRow>
						)}
					</TableBody>
				</Table>
			</div>
		</div>
	);
}
