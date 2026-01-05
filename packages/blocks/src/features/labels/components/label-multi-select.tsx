import type { Outputs } from "@prism/api/src/router";
import { Badge } from "@prism/ui/components/badge";
import { FieldLabel } from "@prism/ui/components/field";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@prism/ui/components/select";
import color from "color";

/**
 * Props for the LabelMultiSelect component.
 * Used in forms to select multiple labels for an entity.
 */
type Props = {
	/** List of available labels to choose from */
	labels: Outputs["label"]["list"];
	/** Currently selected label IDs */
	value: string[];
	/** Callback when the selection changes */
	onChange: (value: string[]) => void;
	/** Optional label text displayed above the select */
	label?: string;
	/** Additional CSS classes for the trigger element */
	className?: string;
};

function getAccessibleTextColor(
	bgColor: string | undefined,
): string | undefined {
	if (!bgColor) return undefined;
	const bg = color(bgColor);
	const whiteContrast = bg.contrast(color("#ffffff"));
	const blackContrast = bg.contrast(color("#000000"));

	return whiteContrast > blackContrast ? "#ffffff" : "#000000";
}

/**
 * A multi-select component for selecting labels.
 * Displays selected labels as colored badges and supports clearable selection.
 * Used in forms where labels need to be submitted as an array of IDs.
 */
export function LabelMultiSelect({
	labels,
	value,
	onChange,
	label,
	className,
}: Props) {
	return (
		<div className="flex flex-col gap-1.5">
			{label && <FieldLabel>{label}</FieldLabel>}
			<Select multiple value={value} onValueChange={onChange}>
				<SelectTrigger
					className={className}
					clearable={value.length > 0}
					onClear={(e) => {
						e.preventDefault();
						e.stopPropagation();
						onChange([]);
					}}
				>
					<SelectValue
						placeholder="Select labels..."
						className="flex items-center gap-1"
					>
						{(selectedValues: string[]) => {
							if (selectedValues.length === 0) return "Select labels...";
							return selectedValues.map((labelId) => {
								const label = labels.find((l) => l.id === labelId);
								if (!label) return null;
								return (
									<Badge
										key={label.id}
										className="px-2 text-xs font-medium"
										style={{
											backgroundColor: label.color ?? undefined,
											color: getAccessibleTextColor(label.color ?? undefined),
										}}
									>
										{label.name}
									</Badge>
								);
							});
						}}
					</SelectValue>
				</SelectTrigger>
				<SelectContent>
					{labels.map((label) => (
						<SelectItem key={label.id} value={label.id}>
							<span className="flex items-center gap-2">
								<span
									className="size-2 rounded-full"
									style={{ backgroundColor: label.color ?? "#ccc" }}
								/>
								{label.name}
							</span>
						</SelectItem>
					))}
				</SelectContent>
			</Select>
		</div>
	);
}
