import { workspaceCreateSchema } from "@prism/api/src/features/workspaces/schema";
import { Button } from "@prism/ui/components/button";
import { FieldError } from "@prism/ui/components/field";
import { useAppForm } from "@prism/ui/components/form/form-hooks";
import { useMutation } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { orpc } from "src/orpc/client";

export const Route = createFileRoute("/workspace/create")({
	component: RouteComponent,
});

function RouteComponent() {
	const create = useMutation(orpc.workspace.create.mutationOptions());
	const navigate = useNavigate();
	const form = useAppForm({
		defaultValues: {
			name: "",
			slug: "",
			timezone: "UTC",
		},
		validators: {
			onSubmit: workspaceCreateSchema,
		},
		onSubmit: async ({ value }) => {
			const res = await create.mutateAsync(value, {
				onError: (err) => {
					const errMsg = err;
					form.setErrorMap({ onSubmit: { form: errMsg, fields: {} } });
					return { form: errMsg };
				},
			});
			navigate({ to: `/workspace/${res.slug}` });
		},
	});

	return (
		<div className="max-w-md mx-auto my-auto">
			<form
				className="flex flex-col gap-4"
				onSubmit={(e) => {
					e.preventDefault();
					form.handleSubmit();
				}}
			>
				<form.AppField name="name">
					{(field) => <field.Input label="Name" />}
				</form.AppField>
				<form.AppField name="slug">
					{(field) => (
						<field.Input
							label="Slug"
							description="For example 'my-workspace'"
						/>
					)}
				</form.AppField>
				{/* TODO: add combobox (select with search) */}
				<form.AppField name="timezone">
					{(field) => <field.Input label="Timezone" />}
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
