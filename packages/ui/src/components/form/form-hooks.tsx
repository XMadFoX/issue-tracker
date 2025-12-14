import { createFormHook, createFormHookContexts } from "@tanstack/react-form";

import { FormInput } from "./form-input";
import { FormSelect } from "./form-select";

const { fieldContext, formContext, useFieldContext, useFormContext } =
	createFormHookContexts();

const { useAppForm } = createFormHook({
	fieldComponents: {
		Input: FormInput,
		Select: FormSelect,
	},
	formComponents: {},
	fieldContext,
	formContext,
});

export { useAppForm, useFieldContext, useFormContext };
