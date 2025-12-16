import { issueCreateSchema } from "@prism/api/src/features/issues/schema";
import type { Outputs } from "@prism/api/src/router";
import { Button } from "@prism/ui/components/button";
import { FieldError } from "@prism/ui/components/field";
import { useAppForm } from "@prism/ui/components/form/form-hooks";
import type z from "zod";

type Props = {
	workspaceId: string;
	teamId: string;
	priorities: Outputs["priority"]["list"];
	statuses: Outputs["issue"]["status"]["list"];
	onSubmit: (
		issue: z.input<typeof issueCreateSchema>,
	) => Promise<{ success: true } | { error: unknown }>;
};

export function IssueCreateForm({
	workspaceId,
	teamId,
	statuses,
	priorities,
	onSubmit,
}: Props) {
	const form = useAppForm({
		defaultValues: {
			title: "",
			description: undefined, // no support for rich text yet
			workspaceId: workspaceId,
			teamId: teamId,
			statusId: statuses[0]?.id,
			priorityId: undefined,
		} as z.input<typeof issueCreateSchema>,
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
		<div className="w-full flex flex-col items-center justify-center">
			<form
				className="flex flex-col gap-4"
				onSubmit={(e) => {
					e.preventDefault();
					form.handleSubmit();
				}}
			>
				<form.AppField name="title">
					{(field) => <field.Input label="Title" />}
				</form.AppField>
				<form.AppField name="description">
					{(field) => <field.Input label="Description" />}
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
		</div>
	);
}
