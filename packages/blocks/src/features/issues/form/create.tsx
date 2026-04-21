import { issueCreateSchema } from "@prism/api/src/features/issues/schema";
import type { Outputs } from "@prism/api/src/router";
import { Button } from "@prism/ui/components/button";
import {
	Field,
	FieldContent,
	FieldError,
	FieldLabel,
} from "@prism/ui/components/field";
import { useAppForm } from "@prism/ui/components/form/form-hooks";
import { cn } from "@prism/ui/lib/utils";
import type z from "zod";
import { DescriptionEditor } from "@/components/description-editor";
import { LabelMultiSelect } from "@/features/labels/components/label-multi-select";

type Props = {
	workspaceId: string;
	teamId: string;
	priorities: Outputs["priority"]["list"];
	statuses: Outputs["issue"]["status"]["list"];
	assignees?: Outputs["teamMembership"]["list"];
	labels?: Outputs["label"]["list"];
	onSubmit: (
		issue: z.input<typeof issueCreateSchema>,
	) => Promise<{ success: true } | { error: unknown }>;
	className?: string;
	initialStatusId?: Outputs["issue"]["status"]["list"][0]["id"];
	initialParentIssueId?: z.input<typeof issueCreateSchema>["parentIssueId"];
	initialTitle?: string;
	initialDescription?: z.input<typeof issueCreateSchema>["description"];
};

export function IssueCreateForm({
	workspaceId,
	teamId,
	statuses,
	priorities,
	assignees,
	labels,
	onSubmit,
	className,
	initialStatusId,
	initialParentIssueId = null,
	initialTitle = "",
	initialDescription = [],
}: Props) {
	const defaultValues: z.input<typeof issueCreateSchema> = {
		title: initialTitle,
		description: initialDescription ?? [],
		workspaceId: workspaceId,
		teamId: teamId,
		statusId: initialStatusId ?? statuses[0]?.id ?? "",
		priorityId: undefined,
		assigneeId: undefined,
		labelIds: [],
		parentIssueId: initialParentIssueId,
	};

	const form = useAppForm({
		defaultValues,
		validators: {
			onSubmit: issueCreateSchema,
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
			<form.AppField name="title">
				{(field) => <field.Input label="Title" />}
			</form.AppField>
			<form.AppField name="description">
				{(field) => {
					const isInvalid =
						field.state.meta.isTouched && !field.state.meta.isValid;

					return (
						<Field data-invalid={isInvalid}>
							<FieldContent>
								<FieldLabel>Description</FieldLabel>
							</FieldContent>
							<DescriptionEditor
								value={field.state.value}
								onChange={field.handleChange}
								placeholder="Describe the issue..."
								containerVariant="select"
								editorVariant="select"
								className="min-h-32"
								editorClassName="min-h-32"
							/>
							{isInvalid ? (
								<FieldError errors={field.state.meta.errors} />
							) : null}
						</Field>
					);
				}}
			</form.AppField>
			<form.AppField name="statusId">
				{(field) => (
					<field.Select
						label="Status"
						placeholder="Select a status"
						items={statuses ?? []}
						getItemValue={(status) => status.id}
						getItemLabel={(status) => status.name}
					/>
				)}
			</form.AppField>
			<form.AppField name="priorityId">
				{(field) => (
					<field.Select
						label="Priority"
						placeholder="Select a priority"
						items={priorities ?? []}
						getItemValue={(priority) => priority.id}
						getItemLabel={(priority) => priority.name}
					/>
				)}
			</form.AppField>
			<form.AppField name="assigneeId">
				{(field) => (
					<field.Select
						label="Assignee"
						placeholder="Select an assignee"
						items={assignees ?? []}
						getItemValue={(member) => member.user.id}
						getItemLabel={(member) => member.user.name}
					/>
				)}
			</form.AppField>
			<form.AppField name="labelIds">
				{(field) => (
					<LabelMultiSelect
						label="Labels"
						labels={labels ?? []}
						value={(field.state.value ?? []) as unknown as string[]}
						onChange={field.handleChange}
						className="w-full"
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
