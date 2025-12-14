import { ReactNode } from "react";
import { Input } from "../input";
import { Select, SelectContent, SelectTrigger, SelectValue } from "../select";
import { FormBase, FormControlProps } from "./form-base";
import { useFieldContext } from "./form-hooks";

export function FormSelect(props: FormControlProps & { children: ReactNode }) {
  const field = useFieldContext<string>();
  const isInvalid = field.state.meta.isTouched && !field.state.meta.isValid;

  return (
    <FormBase {...props}>
      <Select
        onValueChange={(e) => field.handleChange(e)}
        value={field.state.value}
      >
        <SelectTrigger
          aria-invalid={isInvalid}
          id={field.name}
          onBlur={field.handleBlur}
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>{props.children}</SelectContent>
      </Select>
    </FormBase>
  );
}
