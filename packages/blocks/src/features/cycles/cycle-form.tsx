import type { Inputs } from "@prism/api/src/router";
import { Button } from "@prism/ui/components/button";
import { Input } from "@prism/ui/components/input";
import { Label } from "@prism/ui/components/label";
import { useState } from "react";
import type { Cycle } from "./cycle-card";

type CycleFormValue = Pick<
	Inputs["cycle"]["create"],
	"name" | "startDate" | "endDate" | "capacity"
> & {
	velocity?: number | null;
};

type CycleFormProps = {
	cycle?: Cycle;
	defaultStartDate?: string;
	defaultEndDate?: string;
	onSubmit: (value: CycleFormValue) => Promise<void>;
	onCancel?: () => void;
};

function toDateInputValue(value?: Date | string) {
	if (!value) return "";
	return new Date(value).toISOString().slice(0, 10);
}

function toIsoDate(value: string) {
	return new Date(`${value}T00:00:00.000Z`).toISOString();
}

export function CycleForm({
	cycle,
	defaultStartDate = "",
	defaultEndDate = "",
	onSubmit,
	onCancel,
}: CycleFormProps) {
	const [name, setName] = useState(cycle?.name ?? "");
	const [startDate, setStartDate] = useState(
		toDateInputValue(cycle?.startDate) || defaultStartDate,
	);
	const [endDate, setEndDate] = useState(
		toDateInputValue(cycle?.endDate) || defaultEndDate,
	);
	const [capacity, setCapacity] = useState(cycle?.capacity?.toString() ?? "");
	const [velocity, setVelocity] = useState(cycle?.velocity?.toString() ?? "");
	const [isSubmitting, setIsSubmitting] = useState(false);

	return (
		<form
			className="space-y-4"
			onSubmit={async (event) => {
				event.preventDefault();
				setIsSubmitting(true);
				try {
					await onSubmit({
						name: name || undefined,
						startDate: toIsoDate(startDate),
						endDate: endDate ? toIsoDate(endDate) : undefined,
						capacity: capacity ? Number(capacity) : null,
						velocity: velocity ? Number(velocity) : null,
					});
				} finally {
					setIsSubmitting(false);
				}
			}}
		>
			<div className="space-y-2">
				<Label htmlFor="cycle-name">Name</Label>
				<Input
					id="cycle-name"
					value={name}
					onChange={(event) => setName(event.target.value)}
					placeholder="Cycle 9"
				/>
			</div>
			<div className="grid gap-4 sm:grid-cols-2">
				<div className="space-y-2">
					<Label htmlFor="cycle-start">Start date</Label>
					<Input
						id="cycle-start"
						type="date"
						value={startDate}
						onChange={(event) => setStartDate(event.target.value)}
						required
					/>
				</div>
				<div className="space-y-2">
					<Label htmlFor="cycle-end">End date</Label>
					<Input
						id="cycle-end"
						type="date"
						value={endDate}
						onChange={(event) => setEndDate(event.target.value)}
					/>
				</div>
			</div>
			<div className="grid gap-4 sm:grid-cols-2">
				<div className="space-y-2">
					<Label htmlFor="cycle-capacity">Capacity</Label>
					<Input
						id="cycle-capacity"
						type="number"
						min={0}
						value={capacity}
						onChange={(event) => setCapacity(event.target.value)}
						placeholder="50"
					/>
				</div>
				<div className="space-y-2">
					<Label htmlFor="cycle-velocity">Velocity</Label>
					<Input
						id="cycle-velocity"
						type="number"
						min={0}
						value={velocity}
						onChange={(event) => setVelocity(event.target.value)}
						placeholder="Optional"
					/>
				</div>
			</div>
			<div className="flex justify-end gap-2">
				{onCancel ? (
					<Button type="button" variant="outline" onClick={onCancel}>
						Cancel
					</Button>
				) : null}
				<Button type="submit" disabled={isSubmitting}>
					{cycle ? "Save" : "Create cycle"}
				</Button>
			</div>
		</form>
	);
}
