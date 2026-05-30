import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@prism/ui/components/dialog";
import type { ReactElement } from "react";
import type { Cycle } from "./cycle-card";
import { CycleForm, type CycleFormValue } from "./cycle-form";

type CycleFormDialogProps = {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	title: string;
	trigger?: ReactElement;
	cycle?: Cycle;
	defaultStartDate?: string;
	defaultEndDate?: string;
	disableStartDate?: boolean;
	onSubmit: (value: CycleFormValue) => Promise<void>;
};

export function CycleFormDialog({
	open,
	onOpenChange,
	title,
	trigger,
	cycle,
	defaultStartDate,
	defaultEndDate,
	disableStartDate = false,
	onSubmit,
}: CycleFormDialogProps) {
	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			{trigger ? <DialogTrigger render={trigger} /> : null}
			<DialogContent>
				<DialogHeader>
					<DialogTitle>{title}</DialogTitle>
				</DialogHeader>
				<CycleForm
					key={cycle?.id ?? (open ? "open" : "closed")}
					cycle={cycle}
					defaultStartDate={defaultStartDate}
					defaultEndDate={defaultEndDate}
					disableStartDate={disableStartDate}
					onCancel={() => onOpenChange(false)}
					onSubmit={async (value) => {
						await onSubmit(value);
						onOpenChange(false);
					}}
				/>
			</DialogContent>
		</Dialog>
	);
}
