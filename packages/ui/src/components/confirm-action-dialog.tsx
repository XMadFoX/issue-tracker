import * as React from "react";
import {
	AlertDialog,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@/components/alert-dialog";
import { Button } from "@/components/button";
import { Checkbox } from "@/components/checkbox";
import { Label } from "@/components/label";

type Props = {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	title: React.ReactNode;
	description: React.ReactNode;
	confirmLabel: string;
	confirmingLabel?: string;
	cancelLabel?: string;
	onConfirm: () => void | Promise<void>;
	isConfirming?: boolean;
	showRememberChoice?: boolean;
	rememberChoice?: boolean;
	onRememberChoiceChange?: (checked: boolean) => void;
	rememberChoiceLabel?: string;
};

export function ConfirmActionDialog({
	open,
	onOpenChange,
	title,
	description,
	confirmLabel,
	confirmingLabel = confirmLabel,
	cancelLabel = "Cancel",
	onConfirm,
	isConfirming = false,
	showRememberChoice = false,
	rememberChoice = false,
	onRememberChoiceChange,
	rememberChoiceLabel = "Don't show this confirmation again",
}: Props) {
	const rememberChoiceId = React.useId();

	return (
		<AlertDialog
			open={open}
			onOpenChange={(nextOpen) => {
				if (isConfirming) {
					return;
				}

				onOpenChange(nextOpen);
			}}
		>
			<AlertDialogContent>
				<AlertDialogHeader>
					<AlertDialogTitle>{title}</AlertDialogTitle>
					<AlertDialogDescription>{description}</AlertDialogDescription>
				</AlertDialogHeader>
				{showRememberChoice ? (
					<div className="flex items-start gap-3">
						<Checkbox
							id={rememberChoiceId}
							checked={rememberChoice}
							disabled={isConfirming}
							onCheckedChange={(checked) =>
								onRememberChoiceChange?.(checked === true)
							}
						/>
						<Label
							htmlFor={rememberChoiceId}
							className="leading-5 font-normal"
						>
							{rememberChoiceLabel}
						</Label>
					</div>
				) : null}
				<AlertDialogFooter>
					<AlertDialogCancel asChild>
						<Button type="button" variant="outline" disabled={isConfirming}>
							{cancelLabel}
						</Button>
					</AlertDialogCancel>
					<Button
						type="button"
						variant="destructive"
						disabled={isConfirming}
						onClick={() => {
							void onConfirm();
						}}
					>
						{isConfirming ? confirmingLabel : confirmLabel}
					</Button>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
}
