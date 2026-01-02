import { labelCreateSchema } from "@prism/api/src/features/labels/schema";
import type { Inputs, Outputs } from "@prism/api/src/router";
import { Button } from "@prism/ui/components/button";
import ColorPicker from "@prism/ui/components/color-picker";
import { FieldError } from "@prism/ui/components/field";
import { useAppForm } from "@prism/ui/components/form/form-hooks";
import { Label } from "@prism/ui/components/label";
import { generateRandomColor } from "@prism/ui/lib/colors";
import { cn } from "@prism/ui/lib/utils";
import { Pipette, RefreshCcw } from "lucide-react";
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
			color: generateRandomColor(),
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
					<div className="space-y-3">
						<Label>Color</Label>
						<div className="flex w-full items-center gap-3">
							<ColorPicker
								className="shrink-0"
								value={field.state.value ?? "#000000"}
								onChange={(color) => field.handleChange(color)}
								showControls={false}
								trigger={
									<Button
										type="button"
										variant="outline"
										size="icon"
										className="size-8 shrink-0 rounded-full border-border relative overflow-hidden"
										style={{ backgroundColor: field.state.value ?? "#000000" }}
									>
										<Pipette className="absolute inset-0 m-auto size-4 text-white drop-shadow-md" />
									</Button>
								}
							/>
							<Button
								type="button"
								size="icon"
								className="size-8 shrink-0 rounded-full"
								onClick={() => {
									field.handleChange(generateRandomColor());
								}}
							>
								<RefreshCcw className="size-4" />
							</Button>
							<div className="h-8 w-px shrink-0 bg-border/50" />
							<div className="flex min-w-0 flex-1 gap-2 overflow-x-auto">
								{PRESET_COLORS.map((color) => (
									<button
										key={color}
										type="button"
										className={cn(
											"size-8 shrink-0 rounded-full border-2 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
											(field.state.value ?? "#000000") === color
												? "border-red-500"
												: "border-transparent",
										)}
										style={{ backgroundColor: color }}
										onClick={() => field.handleChange(color)}
									/>
								))}
							</div>
						</div>
					</div>
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
							clearable
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
