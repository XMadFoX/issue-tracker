import { Badge } from "@prism/ui/components/badge";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@prism/ui/components/select";
import type { ComponentProps } from "react";
import type { PriorityList } from "../types";

type Props = {
	priorityId: string | null;
	priorities: PriorityList;
	onChange: (priorityId: string | null) => Promise<unknown>;
	triggerClassName?: string;
	showBadge?: boolean;
};

export function IssuePrioritySelect({
	priorityId,
	priorities,
	onChange,
	triggerClassName,
	showBadge = false,
}: Props) {
	const getPriority = (value: string) =>
		priorities.find((priority) => priority.id === value);
	const selectedPriorityColor = priorityId
		? getPriority(priorityId)?.color
		: undefined;

	return (
		<Select value={priorityId ?? ""} onValueChange={(value) => onChange(value)}>
			<SelectTrigger
				className={triggerClassName}
				style={{ borderColor: selectedPriorityColor ?? undefined }}
				clearable={!!priorityId}
				onClear={() => onChange(null)}
			>
				<SelectValue placeholder="-">
					{(value) => {
						const priority = getPriority(value);
						if (showBadge) {
							return (
								<Badge
									variant="outline"
									style={{
										borderColor: priority?.color ?? undefined,
										color: priority?.color ?? undefined,
									}}
								>
									{priority?.name ?? value}
								</Badge>
							);
						}

						return priority?.name ?? value;
					}}
				</SelectValue>
			</SelectTrigger>
			<SelectContent>
				{priorities.map((priority) => (
					<SelectItem key={priority.id} value={priority.id}>
						{priority.name}
					</SelectItem>
				))}
			</SelectContent>
		</Select>
	);
}

export type IssuePrioritySelectProps = ComponentProps<
	typeof IssuePrioritySelect
>;
