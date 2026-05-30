import type { Inputs } from "@prism/api/src/router";
import { Button } from "@prism/ui/components/button";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@prism/ui/components/dialog";
import { Plus } from "lucide-react";
import { type ReactElement, useState } from "react";
import { CycleForm } from "./cycle-form";

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
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogTrigger
				render={
					trigger ?? (
						<Button size="sm">
							<Plus className="size-4" />
							Create cycle
						</Button>
					)
				}
			/>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Create planned cycle</DialogTitle>
				</DialogHeader>
				<CycleForm
					key={open ? "open" : "closed"}
					defaultStartDate={toDateInputValue(new Date())}
					defaultEndDate={getDefaultEndDate(cycleDuration)}
					onCancel={() => setOpen(false)}
					onSubmit={async (value) => {
						await onSubmit(value);
						setOpen(false);
					}}
				/>
			</DialogContent>
		</Dialog>
	);
}
