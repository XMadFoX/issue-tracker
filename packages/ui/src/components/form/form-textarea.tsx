import type { ComponentProps } from "react";
import { Textarea } from "../textarea";
import { FormBase, type FormControlProps } from "./form-base";
import { useFieldContext } from "./form-hooks";

type FormTextareaProps = FormControlProps & ComponentProps<typeof Textarea>;

export function FormTextarea(props: FormTextareaProps) {
	const field = useFieldContext<string | undefined | null>();
	const isInvalid = field.state.meta.isTouched && !field.state.meta.isValid;

	return (
		<FormBase {...props}>
			<Textarea
				id={field.name}
				name={field.name}
				value={field.state.value ?? ""}
				onBlur={field.handleBlur}
				onChange={(e) => field.handleChange(e.target.value)}
				aria-invalid={isInvalid}
				{...props}
			/>
		</FormBase>
	);
}
