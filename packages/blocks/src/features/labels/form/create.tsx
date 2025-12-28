import { labelCreateSchema } from "@prism/api/src/features/labels/schema";
import type { Inputs, Outputs } from "@prism/api/src/router";
import { Button } from "@prism/ui/components/button";
import ColorPicker from "@prism/ui/components/color-picker";
import { FieldError } from "@prism/ui/components/field";
import { useAppForm } from "@prism/ui/components/form/form-hooks";
import { cn } from "@prism/ui/lib/utils";
import type z from "zod";

type Props = {
	workspaceId: Inputs["label"]["create"]["workspaceId"];
	teams: Outputs["team"]["listByWorkspace"];
	initialTeamId?: Inputs["label"]["create"]["teamId"];
	onSubmit: (
		label: z.input<typeof labelCreateSchema>,
	) => Promise<{ success: true } | { error: unknown }>;
	className?: string;
};

export function LabelCreateForm({
	workspaceId,
	teams,
	initialTeamId,
	onSubmit,
	className,
}: Props) {
	const form = useAppForm({
		defaultValues: {
			name: "",
			color: "#000000",
			description: undefined,
			workspaceId: workspaceId,
			teamId: initialTeamId ?? undefined,
		} as z.input<typeof labelCreateSchema>,
		validators: {
			onSubmit: labelCreateSchema,
		},
		onSubmit: async ({ value }) => {
			const res = await onSubmit(value);
			if ("error" in res) {
				const errMsg =
					(res.error instanceof Error && res?.error?.message) ??
					"Request failed. Please try again.";
				form.setErrorMap({ onSubmit: { form: errMsg, fields: {} } });
				console.error("submit error: res.error", res.error);
				return { form: errMsg };
			}
		},
	});

	return (
		<form
			className={cn("flex w-full flex-col gap-4", className)}
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
					<ColorPicker
						value={field.state.value ?? "#000000"}
						onChange={(color) => field.handleChange(color)}
						label="Color"
						showControls={false}
					/>
				)}
			</form.AppField>
			{teams.length > 0 && (
				<form.AppField name="teamId">
					{(field) => (
						<field.Select
							label="Team (optional)"
							placeholder="Select a team or leave empty for workspace label"
							items={teams}
							getItemValue={(team) => team.id}
							getItemLabel={(team) => team.name}
						/>
					)}
				</form.AppField>
			)}
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
