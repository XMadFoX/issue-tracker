import type { ComponentProps, ReactNode } from "react";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../select";
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

	options?: ReadonlyArray<FormSelectOption>;
	items?: ReadonlyArray<TItem>;
	getItemValue?: (item: TItem) => string;
	getItemLabel?: (item: TItem) => ReactNode;

	children?: ReactNode;
	triggerProps?: Omit<ComponentProps<typeof SelectTrigger>, "id" | "aria-invalid" | "onBlur" | "size">;
	contentProps?: ComponentProps<typeof SelectContent>;
};

export function FormSelect<TItem = never>({
	placeholder,
	size,
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

	const value = typeof field.state.value === "string" ? field.state.value : undefined;

	const resolvedChildren =
		children ??
		options?.map((option) => (
			<SelectItem key={option.value} value={option.value} disabled={option.disabled}>
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
				>
					<SelectValue placeholder={placeholder} />
				</SelectTrigger>
				<SelectContent {...contentProps}>{resolvedChildren}</SelectContent>
			</Select>
		</FormBase>
	);
}
