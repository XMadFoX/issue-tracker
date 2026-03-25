import { roleCreateSchema } from "@prism/api/src/features/roles/schema";
import { Button } from "@prism/ui/components/button";
import { FieldError } from "@prism/ui/components/field";
import { useAppForm } from "@prism/ui/components/form/form-hooks";
import { cn } from "@prism/ui/lib/utils";
import type { CreateWorkspaceRoleInput, SubmitResult } from "../types";

type Props = {
	workspaceId: string;
	onSubmit: (role: CreateWorkspaceRoleInput) => Promise<SubmitResult>;
	className?: string;
};

export function RoleCreateForm({ workspaceId, onSubmit, className }: Props) {
	const defaultValues: CreateWorkspaceRoleInput = {
		workspaceId,
		scopeLevel: "workspace",
		name: "",
		description: undefined,
		attributes: {},
	};

	const form = useAppForm({
		defaultValues,
		validators: {
			onSubmit: roleCreateSchema,
		},
		onSubmit: async ({ value }) => {
			const result = await onSubmit(value);

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
			className={cn("flex w-full min-w-0 flex-col gap-4", className)}
			onSubmit={(event) => {
				event.preventDefault();
				form.handleSubmit();
			}}
		>
			<form.AppField name="name">
				{(field) => <field.Input label="Role name" placeholder="Admin" />}
			</form.AppField>
			<form.AppField name="description">
				{(field) => (
					<field.Textarea
						label="Description"
						placeholder="What should this role be able to do?"
						rows={4}
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
						Create role
					</Button>
				)}
			</form.Subscribe>
		</form>
	);
}
