import { workspaceCreateSchema } from "@prism/api/src/features/workspaces/schema";
import { Button } from "@prism/ui/components/button";
import { FieldError } from "@prism/ui/components/field";
import { FormBase } from "@prism/ui/components/form/form-base";
import { useAppForm } from "@prism/ui/components/form/form-hooks";
import { Input } from "@prism/ui/components/input";
import { useMutation } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useRef } from "react";
import { orpc } from "src/orpc/client";

export const Route = createFileRoute("/workspace/create")({
	component: RouteComponent,
});

function slugifyWorkspaceName(name: string) {
	return name
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "");
}

function RouteComponent() {
	const create = useMutation(orpc.workspace.create.mutationOptions());
	const navigate = useNavigate();
	const slugManuallyEditedRef = useRef(false);
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
					{(field) => {
						const isInvalid =
							field.state.meta.isTouched && !field.state.meta.isValid;

						return (
							<FormBase label="Name">
								<Input
									id={field.name}
									name={field.name}
									value={field.state.value}
									onBlur={field.handleBlur}
									onChange={(e) => {
										const name = e.target.value;
										field.handleChange(name);

										if (!slugManuallyEditedRef.current) {
											form.setFieldValue("slug", slugifyWorkspaceName(name));
										}
									}}
									aria-invalid={isInvalid}
								/>
							</FormBase>
						);
					}}
				</form.AppField>
				<form.AppField name="slug">
					{(field) => {
						const isInvalid =
							field.state.meta.isTouched && !field.state.meta.isValid;

						return (
							<FormBase label="Slug" description="For example 'my-workspace'">
								<Input
									id={field.name}
									name={field.name}
									value={field.state.value}
									onBlur={field.handleBlur}
									onChange={(e) => {
										slugManuallyEditedRef.current = true;
										field.handleChange(e.target.value);
									}}
									aria-invalid={isInvalid}
								/>
							</FormBase>
						);
					}}
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
