import {
	AlertDialog,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@prism/ui/components/alert-dialog";
import { Button } from "@prism/ui/components/button";
import { Label } from "@prism/ui/components/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@prism/ui/components/select";
import { useId, useState } from "react";
import type { IssueType } from "../types";

const KEEP_VALUE = "__keep__";

type Props = {
	target: IssueType | null;
	reassignTargets: IssueType[];
	isConfirming: boolean;
	onOpenChange: (open: boolean) => void;
	onConfirm: (replacementIssueTypeId: string | null) => void;
};

export function IssueTypeArchiveDialog({
	target,
	reassignTargets,
	isConfirming,
	onOpenChange,
	onConfirm,
}: Props) {
	const selectId = useId();
	const [replacementId, setReplacementId] = useState<string>(KEEP_VALUE);

	const open = target !== null;

	return (
		<AlertDialog
			open={open}
			onOpenChange={(next) => {
				if (isConfirming) {
					return;
				}
				if (!next) {
					setReplacementId(KEEP_VALUE);
				}
				onOpenChange(next);
			}}
		>
			<AlertDialogContent>
				<AlertDialogHeader>
					<AlertDialogTitle>
						{`Archive "${target?.name ?? "issue type"}"?`}
					</AlertDialogTitle>
					<AlertDialogDescription>
						Archived issue types are hidden from new issue selection. Existing
						issues keep their type unless you reassign them to another type.
					</AlertDialogDescription>
				</AlertDialogHeader>
				{reassignTargets.length > 0 ? (
					<div className="space-y-2">
						<Label htmlFor={selectId}>Reassign existing issues to</Label>
						<Select value={replacementId} onValueChange={setReplacementId}>
							<SelectTrigger id={selectId} className="w-full">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value={KEEP_VALUE}>
									Keep current type on existing issues
								</SelectItem>
								{reassignTargets.map((type) => (
									<SelectItem key={type.id} value={type.id}>
										<span className="flex items-center gap-2">
											<span>{type.icon}</span>
											{type.name}
										</span>
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>
				) : null}
				<AlertDialogFooter>
					<AlertDialogCancel disabled={isConfirming}>Cancel</AlertDialogCancel>
					<Button
						type="button"
						variant="destructive"
						disabled={isConfirming}
						onClick={() =>
							onConfirm(replacementId === KEEP_VALUE ? null : replacementId)
						}
					>
						{isConfirming ? "Archiving..." : "Archive issue type"}
					</Button>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
}
