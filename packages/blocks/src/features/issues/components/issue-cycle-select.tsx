import {
	Select,
	SelectContent,
	SelectGroup,
	SelectItem,
	SelectLabel,
	SelectSeparator,
	SelectTrigger,
	SelectValue,
} from "@prism/ui/components/select";
import type { ComponentProps } from "react";
import type { CycleList } from "../types";

const NO_CYCLE_VALUE = "__no_cycle__";

type Props = {
	cycleId: string | null;
	cycles: CycleList;
	currentCycle?: CycleList[number] | null;
	onChange: (cycleId: string | null) => Promise<unknown>;
	triggerClassName?: string;
};

function getCycleLabel(cycle: CycleList[number]) {
	return cycle.name || `Cycle ${cycle.sequence}`;
}

export function IssueCycleSelect({
	cycleId,
	cycles,
	currentCycle,
	onChange,
	triggerClassName,
}: Props) {
	const activeCycles = cycles.filter((cycle) => cycle.state === "active");
	const plannedCycles = cycles.filter((cycle) => cycle.state === "planned");
	const cycleFromOptions = cycleId
		? cycles.find((cycle) => cycle.id === cycleId)
		: undefined;
	const selectedCycle =
		cycleFromOptions ??
		(currentCycle?.id === cycleId ? currentCycle : undefined);
	const selectedCycleIsSelectable = selectedCycle
		? selectedCycle.state === "active" || selectedCycle.state === "planned"
		: true;

	return (
		<Select
			value={cycleId ?? NO_CYCLE_VALUE}
			onValueChange={(value) =>
				onChange(value === NO_CYCLE_VALUE ? null : value)
			}
		>
			<SelectTrigger className={triggerClassName}>
				<SelectValue placeholder="No cycle">
					{(value) => {
						if (value === NO_CYCLE_VALUE) return "No cycle";

						const cycle = cycles.find((item) => item.id === value);
						const displayCycle =
							cycle ??
							(selectedCycle?.id === value ? selectedCycle : undefined);
						return displayCycle ? getCycleLabel(displayCycle) : value;
					}}
				</SelectValue>
			</SelectTrigger>
			<SelectContent>
				{activeCycles.length > 0 ? (
					<>
						<SelectGroup>
							<SelectLabel>Active</SelectLabel>
							{activeCycles.map((cycle) => (
								<SelectItem key={cycle.id} value={cycle.id}>
									{getCycleLabel(cycle)}
								</SelectItem>
							))}
						</SelectGroup>
						<SelectSeparator />
					</>
				) : null}
				{plannedCycles.length > 0 ? (
					<>
						<SelectGroup>
							<SelectLabel>Planned</SelectLabel>
							{plannedCycles.map((cycle) => (
								<SelectItem key={cycle.id} value={cycle.id}>
									{getCycleLabel(cycle)}
								</SelectItem>
							))}
						</SelectGroup>
						<SelectSeparator />
					</>
				) : null}
				{selectedCycle && !selectedCycleIsSelectable ? (
					<>
						<SelectGroup>
							<SelectLabel>Current</SelectLabel>
							<SelectItem value={selectedCycle.id} disabled>
								{getCycleLabel(selectedCycle)}
							</SelectItem>
						</SelectGroup>
						<SelectSeparator />
					</>
				) : null}
				<SelectItem value={NO_CYCLE_VALUE}>No cycle</SelectItem>
			</SelectContent>
		</Select>
	);
}

export type IssueCycleSelectProps = ComponentProps<typeof IssueCycleSelect>;
