import { Badge } from "@prism/ui/components/badge";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@prism/ui/components/select";
import type { ComponentProps } from "react";

const ESTIMATE_OPTIONS: Array<{ value: number; label: string }> = [
	{ value: 0, label: "0 pts" },
	{ value: 1, label: "1 pt" },
	{ value: 2, label: "2 pts" },
	{ value: 3, label: "3 pts" },
	{ value: 5, label: "5 pts" },
	{ value: 8, label: "8 pts" },
	{ value: 13, label: "13 pts" },
];

type Props = {
	estimate: number | null;
	onChange: (estimate: number | null) => Promise<unknown>;
	triggerClassName?: string;
	showBadge?: boolean;
};

function getEstimateLabel(estimate: number) {
	const option = ESTIMATE_OPTIONS.find((item) => item.value === estimate);
	if (option) return option.label;

	if (estimate === 1) return "1 pt";
	return `${estimate} pts`;
}

export function IssueEstimateSelect({
	estimate,
	onChange,
	triggerClassName,
	showBadge = false,
}: Props) {
	async function handleValueChange(value: string | null) {
		if (value === null) return;

		const option = ESTIMATE_OPTIONS.find(
			(item) => String(item.value) === value,
		);
		if (!option) return;

		await onChange(option.value);
	}

	return (
		<Select
			value={estimate === null ? "" : String(estimate)}
			onValueChange={handleValueChange}
		>
			<SelectTrigger
				className={triggerClassName}
				clearable={estimate !== null}
				onClear={() => onChange(null)}
			>
				<SelectValue placeholder="No estimate">
					{(value) => {
						const label = getEstimateLabel(Number(value));
						if (showBadge) {
							return <Badge variant="outline">{label}</Badge>;
						}

						return label;
					}}
				</SelectValue>
			</SelectTrigger>
			<SelectContent>
				{ESTIMATE_OPTIONS.map((option) => (
					<SelectItem key={option.value} value={String(option.value)}>
						{option.label}
					</SelectItem>
				))}
			</SelectContent>
		</Select>
	);
}

export type IssueEstimateSelectProps = ComponentProps<
	typeof IssueEstimateSelect
>;
