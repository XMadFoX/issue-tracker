import { Button } from "@prism/ui/components/button";
import { ColorPickerField } from "@prism/ui/components/color-picker-field";
import { FieldError } from "@prism/ui/components/field";
import { useAppForm } from "@prism/ui/components/form/form-hooks";
import { generateRandomColor } from "@prism/ui/lib/colors";
import { cn } from "@prism/ui/lib/utils";
import type z from "zod";
import {
	type IssueStatus,
	type IssueStatusCreateDraft,
	type IssueStatusGroup,
	type IssueStatusUpdateInput,
	issueStatusCreateDraftSchema,
	type SubmitHandler,
	type Team,
	type WorkflowScopeValue,
} from "../types";

type Props = {
	workspaceId: string;
	groups: IssueStatusGroup[];
	status?: IssueStatus;
	defaultGroupId?: string;
	scope: WorkflowScopeValue;
	teams: Team[];
	onSubmit: SubmitHandler<IssueStatusCreateDraft | IssueStatusUpdateInput>;
	className?: string;
};

export function StatusForm({
	workspaceId,
	groups,
	status,
	defaultGroupId,
	scope,
	teams,
	onSubmit,
	className,
}: Props) {
	const defaultValues: z.input<typeof issueStatusCreateDraftSchema> = {
		workspaceId,
		teamId: null,
		statusGroupId:
			status?.statusGroupId ?? defaultGroupId ?? groups[0]?.id ?? "",
		name: status?.name ?? "",
		color: status?.color ?? generateRandomColor(),
		description: status?.description ?? undefined,
	};
	const form = useAppForm({
		defaultValues,
		validators: { onSubmit: issueStatusCreateDraftSchema },
		onSubmit: async ({ value }) => {
			const result = await onSubmit(
				status
					? {
							id: status.id,
							workspaceId,
							name: value.name,
							statusGroupId: value.statusGroupId,
							color: value.color ?? null,
							description: value.description?.trim() ? value.description : null,
							teamId: null,
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
	const scopeLabel =
		scope.kind === "workspace"
			? "Workspace default"
			: (teams.find((team) => team.id === scope.teamId)?.name ??
				"Team preview");
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
			<form.AppField name="statusGroupId">
				{(field) => (
					<field.Select
						label="Group"
						placeholder="Select a group"
						items={groups}
						getItemValue={(group) => group.id}
						getItemLabel={(group) => group.name}
					/>
				)}
			</form.AppField>
			<form.AppField name="color">
				{(field) => (
					<ColorPickerField
						value={field.state.value ?? "#000000"}
						onChange={field.handleChange}
					/>
				)}
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
			<div className="rounded-md border p-3 text-sm text-muted-foreground">
				Scope: {scopeLabel}
			</div>
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
						{status ? "Save status" : "Create status"}
					</Button>
				)}
			</form.Subscribe>
		</form>
	);
}
