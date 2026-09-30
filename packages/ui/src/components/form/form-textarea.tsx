import type { ComponentProps } from "react";
import { Textarea } from "../textarea";
import { FormBase, type FormControlProps } from "./form-base";
import { useFieldContext } from "./form-hooks";

type FormTextareaProps = FormControlProps &
	Omit<
		ComponentProps<typeof Textarea>,
		"id" | "aria-invalid" | "aria-describedby"
	>;

export function FormTextarea({
	label,
	description,
	announceErrors,
	...props
}: FormTextareaProps) {
	const field = useFieldContext<string | undefined | null>();

	return (
		<FormBase
			label={label}
			description={description}
			announceErrors={announceErrors}
		>
			{(controlProps) => (
				<Textarea
					name={field.name}
					value={field.state.value ?? ""}
					onBlur={field.handleBlur}
					onChange={(e) => field.handleChange(e.target.value)}
					{...props}
					{...controlProps}
				/>
			)}
		</FormBase>
	);
}
