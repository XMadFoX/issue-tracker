import { Input } from "@prism/ui/components/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@prism/ui/components/select";
import { cn } from "@prism/ui/lib/utils";
import { useEffect, useMemo, useState } from "react";

const CYCLE_DURATION_OPTIONS = [
	{ value: 7, label: "1 week" },
	{ value: 14, label: "2 weeks" },
	{ value: 21, label: "3 weeks" },
	{ value: 28, label: "4 weeks" },
] as const;

const DEFAULT_CYCLE_DURATION = 14;
const CUSTOM_CYCLE_DURATION_VALUE = "custom";

function normalizeCycleDuration(value: number | null | undefined) {
	return value ?? DEFAULT_CYCLE_DURATION;
}

function isPresetCycleDuration(value: number) {
	return CYCLE_DURATION_OPTIONS.some((option) => option.value === value);
}

function parsePositiveInteger(value: string) {
	const parsed = Number(value);
	if (!Number.isInteger(parsed) || parsed < 1) return null;
	return parsed;
}

function getSelectDisplayValue(value: unknown) {
	if (value === CUSTOM_CYCLE_DURATION_VALUE) return "Custom days";
	return `${String(value)} days`;
}

export function formatCycleDuration(value: number | null | undefined) {
	const days = normalizeCycleDuration(value);
	const preset = CYCLE_DURATION_OPTIONS.find((option) => option.value === days);
	if (preset) return `${preset.label} (${days} days)`;
	return `${days} days`;
}

type CycleDurationControlProps = {
	value: number | null | undefined;
	onChange: (value: number) => void;
	className?: string;
	selectClassName?: string;
	customInputClassName?: string;
};

export function CycleDurationControl({
	value,
	onChange,
	className,
	selectClassName,
	customInputClassName,
}: CycleDurationControlProps) {
	const normalizedValue = normalizeCycleDuration(value);
	const [isCustomSelected, setIsCustomSelected] = useState(
		!isPresetCycleDuration(normalizedValue),
	);

	useEffect(() => {
		setIsCustomSelected(!isPresetCycleDuration(normalizedValue));
	}, [normalizedValue]);

	const selectValue = useMemo(() => {
		if (isCustomSelected) return CUSTOM_CYCLE_DURATION_VALUE;
		return String(normalizedValue);
	}, [isCustomSelected, normalizedValue]);

	return (
		<div className={cn("flex items-center gap-2", className)}>
			<Select
				value={selectValue}
				onValueChange={(nextValue) => {
					if (nextValue === null) return;

					if (nextValue === CUSTOM_CYCLE_DURATION_VALUE) {
						setIsCustomSelected(true);
						return;
					}

					const parsed = parsePositiveInteger(nextValue);
					if (parsed === null) return;

					setIsCustomSelected(false);
					onChange(parsed);
				}}
			>
				<SelectTrigger className={cn("w-36", selectClassName)}>
					<SelectValue>{getSelectDisplayValue}</SelectValue>
				</SelectTrigger>
				<SelectContent>
					{CYCLE_DURATION_OPTIONS.map((option) => (
						<SelectItem key={option.value} value={String(option.value)}>
							{option.label}
						</SelectItem>
					))}
					<SelectItem value={CUSTOM_CYCLE_DURATION_VALUE}>
						Custom days
					</SelectItem>
				</SelectContent>
			</Select>

			{isCustomSelected ? (
				<div className="flex items-center gap-2">
					<Input
						type="number"
						min={1}
						value={normalizedValue}
						onChange={(event) => {
							const parsed = parsePositiveInteger(event.target.value);
							if (parsed === null) return;
							onChange(parsed);
						}}
						className={cn("w-24", customInputClassName)}
					/>
					<span className="text-muted-foreground text-sm">days</span>
				</div>
			) : null}
		</div>
	);
}
