import { Input } from "../input";
import { FormBase, type FormControlProps } from "./form-base";
import { useFieldContext } from "./form-hooks";

export function FormInput(props: FormControlProps) {
	const field = useFieldContext<string>();

	return (
		<FormBase {...props}>
			{(controlProps) => (
				<Input
					{...controlProps}
					name={field.name}
					value={field.state.value}
					onBlur={field.handleBlur}
					onChange={(e) => field.handleChange(e.target.value)}
					type={props.type}
					placeholder={props.placeholder}
					autoComplete={props.autoComplete}
				/>
			)}
		</FormBase>
	);
}
