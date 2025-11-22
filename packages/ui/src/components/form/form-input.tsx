import { Input } from "../input";
import { FormBase, FormControlProps } from "./form-base";
import { useFieldContext } from "./form-hooks";

export function FormInput(props: FormControlProps) {
  const field = useFieldContext<string>();
  const isInvalid = field.state.meta.isTouched && !field.state.meta.isValid;

  return (
    <FormBase {...props}>
      <Input
        id={field.name}
        name={field.name}
        value={field.state.value}
        onBlur={field.handleBlur}
        onChange={(e) => field.handleChange(e.target.value)}
        type={props.type}
        aria-invalid={isInvalid}
      />
    </FormBase>
  );
}
