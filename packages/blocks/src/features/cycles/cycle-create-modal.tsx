import type { Inputs } from "@prism/api/src/router";
import { Button } from "@prism/ui/components/button";
import { Plus } from "lucide-react";
import { type ReactElement, useState } from "react";
import { CycleFormDialog } from "./cycle-form-dialog";

type CycleCreateModalProps = {
	trigger?: ReactElement;
	cycleDuration?: number | null;
	onSubmit: (
		value: Pick<
			Inputs["cycle"]["create"],
			"name" | "startDate" | "endDate" | "capacity"
		>,
	) => Promise<void>;
};

function toDateInputValue(value: Date) {
	const year = value.getFullYear();
	const month = String(value.getMonth() + 1).padStart(2, "0");
	const day = String(value.getDate()).padStart(2, "0");

	return `${year}-${month}-${day}`;
}

function getDefaultEndDate(cycleDuration: number | null | undefined) {
	const date = new Date();
	date.setDate(date.getDate() + (cycleDuration ?? 14));

	return toDateInputValue(date);
}

export function CycleCreateModal({
	trigger,
	cycleDuration,
	onSubmit,
}: CycleCreateModalProps) {
	const [open, setOpen] = useState(false);

	return (
		<CycleFormDialog
			open={open}
			onOpenChange={setOpen}
			title="Create planned cycle"
			trigger={
				trigger ?? (
					<Button size="sm">
						<Plus className="size-4" />
						Create cycle
					</Button>
				)
			}
			defaultStartDate={toDateInputValue(new Date())}
			defaultEndDate={getDefaultEndDate(cycleDuration)}
			onSubmit={onSubmit}
		/>
	);
}
