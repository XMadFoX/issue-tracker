import { Button } from "@prism/ui/components/button";
import { ColorPickerField } from "@prism/ui/components/color-picker-field";
import { EmojiPickerField } from "@prism/ui/components/emoji-picker-field";
import { FieldError } from "@prism/ui/components/field";
import { useAppForm } from "@prism/ui/components/form/form-hooks";
import { generateRandomColor } from "@prism/ui/lib/colors";
import { cn } from "@prism/ui/lib/utils";
import type { z } from "zod";
import {
	type IssueTypeCreateDraft,
	issueTypeCreateDraftSchema,
	type SubmitResult,
} from "../types";

type Props = {
	workspaceId: string;
	teamId: string | null;
	onSubmit: (draft: IssueTypeCreateDraft) => Promise<SubmitResult>;
	className?: string;
};

export function IssueTypeCreateForm({
	workspaceId,
	teamId,
	onSubmit,
	className,
}: Props) {
	const defaultValues: z.input<typeof issueTypeCreateDraftSchema> = {
		workspaceId,
		teamId,
		name: "",
		icon: "🏷️",
		color: generateRandomColor(),
		description: undefined,
	};

	const form = useAppForm({
		defaultValues,
		validators: {
			onSubmit: issueTypeCreateDraftSchema,
		},
		onSubmit: async ({ value }) => {
			const res = await onSubmit(value);
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
			<div className="flex items-end gap-3">
				<form.AppField name="icon">
					{(field) => (
						<EmojiPickerField
							value={field.state.value ?? ""}
							onChange={(emoji) => field.handleChange(emoji)}
						/>
					)}
				</form.AppField>
				<div className="min-w-0 flex-1">
					<form.AppField name="name">
						{(field) => <field.Input label="Name" />}
					</form.AppField>
				</div>
			</div>
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
				A key is generated from the name. New issue types are added at the end
				of the current ordering.
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
						Create issue type
					</Button>
				)}
			</form.Subscribe>
		</form>
	);
}
