import { teamCreateSchema } from "@prism/api/src/features/teams/schema";
import type { Inputs } from "@prism/api/src/router";
import { Button } from "@prism/ui/components/button";
import { ColorPickerField } from "@prism/ui/components/color-picker-field";
import { FieldError } from "@prism/ui/components/field";
import { useAppForm } from "@prism/ui/components/form/form-hooks";
import { generateRandomColor } from "@prism/ui/lib/colors";
import { cn } from "@prism/ui/lib/utils";
import type z from "zod";

type Props = {
	workspaceId: Inputs["team"]["create"]["workspaceId"];
	onSubmit: (
		team: z.input<typeof teamCreateSchema>,
	) => Promise<{ success: true } | { error: unknown }>;
	className?: string;
};

export function TeamCreateForm({ workspaceId, onSubmit, className }: Props) {
	const form = useAppForm({
		defaultValues: {
			name: "",
			key: "",
			color: generateRandomColor(),
			privacy: "private",
			workspaceId: workspaceId,
		} as z.input<typeof teamCreateSchema>,
		validators: { onSubmit: teamCreateSchema },
		onSubmit: async ({ value }) => {
			const res = await onSubmit(value);
			console.log("res", res);
			if ("error" in res) {
				const errMsg =
					(res.error instanceof Error && res.error.message) ??
					"Request failed. Please try again.";
				form.setErrorMap({ onSubmit: { form: errMsg, fields: {} } });
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
			<form.AppField name="key">
				{(field) => (
					<field.Input label="Key" placeholder="Auto-generated from name" />
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
						Create
					</Button>
				)}
			</form.Subscribe>
		</form>
	);
}
