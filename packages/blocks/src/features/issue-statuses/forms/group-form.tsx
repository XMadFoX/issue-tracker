import { Button } from "@prism/ui/components/button";
import { FieldError } from "@prism/ui/components/field";
import { useAppForm } from "@prism/ui/components/form/form-hooks";
import { cn } from "@prism/ui/lib/utils";
import type z from "zod";
import {
	type IssueStatusGroup,
	type IssueStatusGroupCreateDraft,
	type IssueStatusGroupUpdateInput,
	issueStatusGroupCreateDraftSchema,
	type SubmitHandler,
} from "../types";

type Props = {
	workspaceId: string;
	group?: IssueStatusGroup;
	onSubmit: SubmitHandler<
		IssueStatusGroupCreateDraft | IssueStatusGroupUpdateInput
	>;
	className?: string;
};

const categories = [
	{ value: "backlog", label: "Backlog" },
	{ value: "planned", label: "Planned" },
	{ value: "in_progress", label: "In progress" },
	{ value: "completed", label: "Completed" },
	{ value: "canceled", label: "Canceled" },
];

export function GroupForm({ workspaceId, group, onSubmit, className }: Props) {
	const defaultValues: z.input<typeof issueStatusGroupCreateDraftSchema> = {
		workspaceId,
		name: group?.name ?? "",
		description: group?.description ?? undefined,
		canonicalCategory: group?.canonicalCategory ?? "planned",
	};
	const form = useAppForm({
		defaultValues,
		validators: { onSubmit: issueStatusGroupCreateDraftSchema },
		onSubmit: async ({ value }) => {
			const result = await onSubmit(
				group
					? {
							id: group.id,
							workspaceId,
							name: value.name,
							description: value.description?.trim() ? value.description : null,
						}
					: value,
			);
			if ("error" in result) {
				const message =
					result.error instanceof Error
						? result.error.message
						: "Request failed. Please try again.";
				form.setErrorMap({ onSubmit: { form: message, fields: {} } });
				return { form: message };
			}
		},
	});
	return (
		<form
			className={cn("flex flex-col gap-4", className)}
			onSubmit={(event) => {
				event.preventDefault();
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
			{group ? null : (
				<form.AppField name="canonicalCategory">
					{(field) => (
						<field.Select
							label="Canonical category"
							placeholder="Select a category"
							items={categories}
							getItemValue={(category) => category.value}
							getItemLabel={(category) => category.label}
						/>
					)}
				</form.AppField>
			)}
			<form.Subscribe selector={(state) => [state.errorMap]}>
				{([errorMap]) => {
					const submitError = errorMap.onSubmit;
					const message =
						typeof submitError === "string" ? submitError : submitError?.form;
					return typeof message === "string" ? (
						<FieldError>{message}</FieldError>
					) : null;
				}}
			</form.Subscribe>
			<form.Subscribe selector={(state) => [state.isSubmitting]}>
				{([isSubmitting]) => (
					<Button type="submit" disabled={isSubmitting}>
						{group ? "Save group" : "Create group"}
					</Button>
				)}
			</form.Subscribe>
		</form>
	);
}
