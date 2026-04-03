import { Button } from "@prism/ui/components/button";
import { ColorPickerField } from "@prism/ui/components/color-picker-field";
import { FieldError } from "@prism/ui/components/field";
import { useAppForm } from "@prism/ui/components/form/form-hooks";
import { generateRandomColor } from "@prism/ui/lib/colors";
import { cn } from "@prism/ui/lib/utils";
import type z from "zod";
import {
	type IssuePriorityCreateDraft,
	issuePriorityCreateDraftSchema,
	type SubmitResult,
} from "../types";

type Props = {
	workspaceId: string;
	onSubmit: (priority: IssuePriorityCreateDraft) => Promise<SubmitResult>;
	className?: string;
};

export function IssuePriorityCreateForm({
	workspaceId,
	onSubmit,
	className,
}: Props) {
	const defaultValues: z.input<typeof issuePriorityCreateDraftSchema> = {
		name: "",
		color: generateRandomColor(),
		description: undefined,
		workspaceId,
	};

	const form = useAppForm({
		defaultValues,
		validators: {
			onSubmit: issuePriorityCreateDraftSchema,
		},
		onSubmit: async ({ value }) => {
			const res = await onSubmit(value);
			if ("error" in res) {
				const errMsg =
					(res.error instanceof Error && res.error.message) ??
					"Request failed. Please try again.";
				form.setErrorMap({ onSubmit: { form: errMsg, fields: {} } });
				console.error("submit error: res.error", res.error);
				return { form: errMsg };
			}
		},
	});

	return (
		<form
			className={cn("flex w-full min-w-0 flex-col gap-4", className)}
			onSubmit={(e) => {
				e.preventDefault();
				form.handleSubmit();
			}}
		>
			<form.AppField name="name">
				{(field) => <field.Input label="Name" />}
			</form.AppField>
			<form.AppField name="description">
				{(field) => (
					<field.Textarea
						label="Description"
						placeholder="Add a description..."
						rows={3}
					/>
				)}
			</form.AppField>
			<form.AppField name="color">
				{(field) => (
					<ColorPickerField
						value={field.state.value ?? "#000000"}
						onChange={(color) => field.handleChange(color)}
					/>
				)}
			</form.AppField>
			<p className="text-sm text-muted-foreground">
				New priorities are added at the end of the current ordering.
			</p>
			<form.Subscribe selector={(state) => [state.errorMap]}>
				{([errorMap]) =>
					errorMap.onSubmit ? (
						<FieldError className="form-error">
							{errorMap.onSubmit.toString()}
						</FieldError>
					) : null
				}
			</form.Subscribe>
			<form.Subscribe selector={(state) => [state.isSubmitting]}>
				{([isSubmitting]) => (
					<Button type="submit" disabled={isSubmitting}>
						Create priority
					</Button>
				)}
			</form.Subscribe>
		</form>
	);
}
