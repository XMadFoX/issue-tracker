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

type Props = {
	target: IssueType | null;
	replacementOptions: IssueType[];
	isConfirming: boolean;
	onOpenChange: (open: boolean) => void;
	onConfirm: (replacementIssueTypeId: string) => void;
};

export function IssueTypeReplaceDialog({
	target,
	replacementOptions,
	isConfirming,
	onOpenChange,
	onConfirm,
}: Props) {
	const selectId = useId();
	const [replacementId, setReplacementId] = useState<string>("");

	const open = target !== null;

	return (
		<AlertDialog
			open={open}
			onOpenChange={(next) => {
				if (isConfirming) {
					return;
				}
				if (!next) {
					setReplacementId("");
				}
				onOpenChange(next);
			}}
		>
			<AlertDialogContent>
				<AlertDialogHeader>
					<AlertDialogTitle>
						{`Replace "${target?.name ?? "issue type"}" for this team`}
					</AlertDialogTitle>
					<AlertDialogDescription>
						The workspace type is hidden for new issues in this team and
						replaced by a team-specific type. Existing issues keep their current
						type.
					</AlertDialogDescription>
				</AlertDialogHeader>
				<div className="space-y-2">
					<Label htmlFor={selectId}>Replacement team type</Label>
					{replacementOptions.length > 0 ? (
						<Select value={replacementId} onValueChange={setReplacementId}>
							<SelectTrigger id={selectId} className="w-full">
								<SelectValue placeholder="Select a team type" />
							</SelectTrigger>
							<SelectContent>
								{replacementOptions.map((type) => (
									<SelectItem key={type.id} value={type.id}>
										<span className="flex items-center gap-2">
											<span>{type.icon}</span>
											{type.name}
										</span>
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					) : (
						<p className="text-sm text-muted-foreground">
							Create a team-specific issue type first to use as a replacement.
						</p>
					)}
				</div>
				<AlertDialogFooter>
					<AlertDialogCancel disabled={isConfirming}>Cancel</AlertDialogCancel>
					<Button
						type="button"
						disabled={isConfirming || replacementId === ""}
						onClick={() => onConfirm(replacementId)}
					>
						{isConfirming ? "Replacing..." : "Replace for team"}
					</Button>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
}
