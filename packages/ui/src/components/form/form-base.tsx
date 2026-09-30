import { type ComponentProps, type ReactNode, useId } from "react";
import {
	Field,
	FieldContent,
	FieldDescription,
	FieldError,
	FieldLabel,
} from "../field";
import { useFieldContext } from "./form-hooks";

export type FormControlProps = {
	label: string;
	description?: string;
	type?: ComponentProps<"input">["type"];
	placeholder?: string;
	autoComplete?: ComponentProps<"input">["autoComplete"];
	announceErrors?: boolean;
};

type FormControlAccessibilityProps = {
	id: string;
	"aria-invalid": boolean;
	"aria-describedby": string | undefined;
};

type FormBaseProps = FormControlProps & {
	children: (props: FormControlAccessibilityProps) => ReactNode;
	horizontal?: boolean;
	controlFirst?: boolean;
};

export function FormBase({
	children,
	label,
	description,
	controlFirst,
	horizontal,
	announceErrors = true,
}: FormBaseProps) {
	const field = useFieldContext();
	const id = useId();
	const descriptionId = `${id}-description`;
	const errorId = `${id}-error`;
	const isInvalid = field.state.meta.isTouched && !field.state.meta.isValid;
	const describedBy =
		[description && descriptionId, isInvalid && errorId]
			.filter(Boolean)
			.join(" ") || undefined;
	const labelElement = (
		<>
			<FieldLabel htmlFor={id}>{label}</FieldLabel>
			{description && (
				<FieldDescription id={descriptionId}>{description}</FieldDescription>
			)}
		</>
	);
	const errorElem = isInvalid && (
		<FieldError
			id={errorId}
			errors={field.state.meta.errors}
			role={announceErrors ? "alert" : undefined}
		/>
	);
	const control = children({
		id,
		"aria-invalid": isInvalid,
		"aria-describedby": describedBy,
	});

	return (
		<Field
			data-invalid={isInvalid}
			orientation={horizontal ? "horizontal" : undefined}
		>
			{controlFirst ? (
				<>
					{control}
					<FieldContent>
						{labelElement}
						{errorElem}
					</FieldContent>
				</>
			) : (
				<>
					<FieldContent>{labelElement}</FieldContent>
					{control}
					{errorElem}
				</>
			)}
		</Field>
	);
}
