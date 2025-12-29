import { ChevronDownIcon, XIcon } from "lucide-react";
import type { ComponentProps, ReactNode } from "react";

import { cn } from "@/lib/utils";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "../select";
import type { FormControlProps } from "./form-base";
import { FormBase } from "./form-base";
import { useFieldContext } from "./form-hooks";

export type FormSelectOption<TValue extends string = string> = {
	value: TValue;
	label: ReactNode;
	disabled?: boolean;
};

type FormSelectProps<TItem> = FormControlProps & {
	placeholder?: string;
	size?: ComponentProps<typeof SelectTrigger>["size"];
	clearable?: boolean;

	options?: ReadonlyArray<FormSelectOption>;
	items?: ReadonlyArray<TItem>;
	getItemValue?: (item: TItem) => string;
	getItemLabel?: (item: TItem) => ReactNode;

	children?: ReactNode;
	triggerProps?: Omit<
		ComponentProps<typeof SelectTrigger>,
		"id" | "aria-invalid" | "onBlur" | "size"
	>;
	contentProps?: ComponentProps<typeof SelectContent>;
};

export function FormSelect<TItem = never>({
	placeholder,
	size,
	clearable,
	options,
	items,
	getItemLabel,
	getItemValue,
	children,
	triggerProps,
	contentProps,
	...baseProps
}: FormSelectProps<TItem>) {
	const field = useFieldContext<string | undefined | null>();
	const isInvalid = field.state.meta.isTouched && !field.state.meta.isValid;

	const value =
		typeof field.state.value === "string" ? field.state.value : undefined;
	const hasValue = value !== undefined && value !== "";

	const handleClear = (e: React.MouseEvent | React.KeyboardEvent) => {
		e.preventDefault();
		e.stopPropagation();
		field.handleChange("");
	};

	const resolvedChildren =
		children ??
		options?.map((option) => (
			<SelectItem
				key={option.value}
				value={option.value}
				disabled={option.disabled}
			>
				{option.label}
			</SelectItem>
		)) ??
		(items && getItemLabel && getItemValue
			? items.map((item) => {
					const itemValue = getItemValue(item);
					return (
						<SelectItem key={itemValue} value={itemValue}>
							{getItemLabel(item)}
						</SelectItem>
					);
				})
			: null);

	return (
		<FormBase {...baseProps}>
			<Select
				onValueChange={(nextValue) => field.handleChange(nextValue)}
				value={value}
			>
				<SelectTrigger
					{...triggerProps}
					size={size}
					aria-invalid={isInvalid}
					id={field.name}
					onBlur={field.handleBlur}
					className={cn(
						triggerProps?.className,
						"cursor-pointer",
						clearable && "[&>svg]:hidden",
					)}
				>
					<SelectValue placeholder={placeholder} />
					<div className="flex items-center gap-1">
						{clearable && hasValue && (
							<button
								type="button"
								onPointerDown={(e) => {
									e.stopPropagation();
									e.preventDefault();
								}}
								onClick={handleClear}
								aria-label="Clear selection"
								className="flex size-4 items-center justify-center opacity-50 hover:opacity-100 cursor-pointer"
							>
								<XIcon className="size-4" />
							</button>
						)}
						<ChevronDownIcon className="size-4 opacity-50 hover:opacity-100 pointer-events-auto" />
					</div>
				</SelectTrigger>
				<SelectContent {...contentProps}>{resolvedChildren}</SelectContent>
			</Select>
		</FormBase>
	);
}
