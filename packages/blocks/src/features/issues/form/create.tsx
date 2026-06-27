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
import { useStore } from "@tanstack/react-form";
import { useCallback, useEffect, useMemo } from "react";
import type z from "zod";
import { DescriptionEditor } from "@/components/description-editor";
import { LabelMultiSelect } from "@/features/labels/components/label-multi-select";
import type { IssueTypeAllowedStatusIdsByType } from "../types";

type Props = {
	workspaceId: string;
	teamId: string;
	priorities: Outputs["priority"]["list"];
	statuses: Outputs["issue"]["status"]["list"];
	issueTypes?: Outputs["issueType"]["list"];
	allowedStatusesByIssueTypeId?: IssueTypeAllowedStatusIdsByType;
	assignees?: Outputs["teamMembership"]["list"];
	labels?: Outputs["label"]["list"];
	onSubmit: (
		issue: z.input<typeof issueCreateSchema>,
	) => Promise<{ success: true } | { error: unknown }>;
	className?: string;
	initialStatusId?: Outputs["issue"]["status"]["list"][0]["id"];
	initialIssueTypeId?: z.input<typeof issueCreateSchema>["issueTypeId"];
	initialParentIssueId?: z.input<typeof issueCreateSchema>["parentIssueId"];
	initialTitle?: string;
	initialDescription?: z.input<typeof issueCreateSchema>["description"];
};

export function IssueCreateForm({
	workspaceId,
	teamId,
	statuses,
	priorities,
	issueTypes,
	allowedStatusesByIssueTypeId,
	assignees,
	labels,
	onSubmit,
	className,
	initialStatusId,
	initialIssueTypeId,
	initialParentIssueId = null,
	initialTitle = "",
	initialDescription = [],
}: Props) {
	const isStatusAllowedForIssueType = useCallback(
		(issueTypeId: string | undefined, statusId: string | undefined) => {
			if (!issueTypeId || !statusId) return true;

			const allowedStatusIds = allowedStatusesByIssueTypeId?.[issueTypeId];
			return (
				allowedStatusIds === undefined ||
				allowedStatusIds.length === 0 ||
				allowedStatusIds.includes(statusId)
			);
		},
		[allowedStatusesByIssueTypeId],
	);

	const initialStatusCompatibleIssueTypes = initialStatusId
		? issueTypes?.filter((type) =>
				isStatusAllowedForIssueType(type.id, initialStatusId),
			)
		: issueTypes;
	const requestedIssueTypeId =
		initialIssueTypeId ?? issueTypes?.find((t) => t.isDefault)?.id;
	const defaultIssueTypeId = isStatusAllowedForIssueType(
		requestedIssueTypeId,
		initialStatusId,
	)
		? requestedIssueTypeId
		: (initialStatusCompatibleIssueTypes?.find((type) => type.isDefault)?.id ??
			initialStatusCompatibleIssueTypes?.[0]?.id);
	const defaultStatusId = isStatusAllowedForIssueType(
		defaultIssueTypeId,
		initialStatusId,
	)
		? initialStatusId
		: undefined;

	const defaultValues: z.input<typeof issueCreateSchema> = {
		title: initialTitle,
		description: initialDescription ?? [],
		workspaceId: workspaceId,
		teamId: teamId,
		statusId: defaultStatusId,
		issueTypeId: defaultIssueTypeId,
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

	const selectedIssueTypeId = useStore(
		form.store,
		(state) => state.values.issueTypeId,
	);
	const selectedStatusId = useStore(
		form.store,
		(state) => state.values.statusId,
	);
	const allowedStatuses = useMemo(
		() =>
			selectedIssueTypeId
				? statuses.filter((status) =>
						isStatusAllowedForIssueType(selectedIssueTypeId, status.id),
					)
				: statuses,
		[statuses, selectedIssueTypeId, isStatusAllowedForIssueType],
	);
	const compatibleIssueTypes = useMemo(
		() =>
			selectedStatusId
				? issueTypes?.filter((type) =>
						isStatusAllowedForIssueType(type.id, selectedStatusId),
					)
				: issueTypes,
		[issueTypes, selectedStatusId, isStatusAllowedForIssueType],
	);

	useEffect(() => {
		if (
			selectedStatusId &&
			!isStatusAllowedForIssueType(selectedIssueTypeId, selectedStatusId)
		) {
			form.setFieldValue("statusId", undefined);
		}
	}, [
		form,
		selectedIssueTypeId,
		selectedStatusId,
		isStatusAllowedForIssueType,
	]);

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
						items={allowedStatuses}
						getItemValue={(status) => status.id}
						getItemLabel={(status) => status.name}
					/>
				)}
			</form.AppField>
			{issueTypes && issueTypes.length > 0 ? (
				<form.AppField name="issueTypeId">
					{(field) => (
						<field.Select
							label="Type"
							placeholder="Select a type"
							items={compatibleIssueTypes ?? []}
							getItemValue={(type) => type.id}
							getItemLabel={(type) => `${type.icon} ${type.name}`}
						/>
					)}
				</form.AppField>
			) : null}
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
