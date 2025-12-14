import { issueCreateSchema } from "@prism/api/src/features/issues/schema";
import { Button } from "@prism/ui/components/button";
import { Field, FieldError, FieldLabel } from "@prism/ui/components/field";
import { useAppForm } from "@prism/ui/components/form/form-hooks";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@prism/ui/components/select";
import {
	useMutation,
	useQuery,
	useQueryClient,
	useSuspenseQuery,
} from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import { orpc } from "src/orpc/client";
import type z from "zod";

export const Route = createFileRoute(
	"/workspace/$slug/teams/$teamSlug/issues/create",
)({
	component: RouteComponent,
});

function RouteComponent() {
	const { slug } = Route.useParams();
	const workspace = useSuspenseQuery(
		orpc.workspace.getBySlug.queryOptions({ input: { slug } }),
	);
	const team = useQuery(
		orpc.team.listByWorkspace.queryOptions({
			input: { id: workspace?.data?.id },
		}),
	);
	const priorities = useQuery(
		orpc.priority.list.queryOptions({
			input: { workspaceId: workspace?.data?.id },
		}),
	);
	const statuses = useQuery(
		orpc.issue.status.list.queryOptions({ input: { id: workspace?.data?.id } }),
	);
	const qc = useQueryClient();

	const createIssue = useMutation(orpc.issue.create.mutationOptions());
	const form = useAppForm({
		defaultValues: {
			title: "",
			description: undefined, // no support for rich text yet
			workspaceId: workspace?.data?.id,
			teamId: team.data?.[0]?.id ?? "",
			statusId: statuses.data?.[0]?.id ?? "",
			priorityId: undefined,
		} as z.input<typeof issueCreateSchema>,
		validators: {
			onSubmit: issueCreateSchema,
		},
		onSubmit: async ({ value }) => {
			await createIssue.mutateAsync(value, {
				onError: (err) => {
					const errMsg = err;
					form.setErrorMap({ onSubmit: { form: errMsg, fields: {} } });
					return { form: errMsg };
				},
			});
			qc.invalidateQueries({ queryKey: orpc.issue.list.key() });
			toast.success("Issue created successfully");
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
				<form.Field name="statusId">
					{(field) => {
						const isInvalid =
							field.state.meta.isTouched && !field.state.meta.isValid;
						return (
							<Field data-invalid={isInvalid}>
								<FieldLabel htmlFor={field.name}>Status</FieldLabel>
								<Select
									onValueChange={(e) =>
										field.handleChange(
											e as NonNullable<typeof statuses.data>[number]["id"],
										)
									}
									value={field.state.value}
								>
									<SelectTrigger aria-invalid={isInvalid} id={field.name}>
										<SelectValue onBlur={field.handleBlur} />
									</SelectTrigger>
									<SelectContent>
										{statuses.data?.map((status) => (
											<SelectItem key={status.id} value={status.id}>
												{status.name}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
								{isInvalid && <FieldError errors={field.state.meta.errors} />}
							</Field>
						);
					}}
				</form.Field>
				<form.Field name="priorityId">
					{(field) => {
						const isInvalid =
							field.state.meta.isTouched && !field.state.meta.isValid;
						return (
							<Field data-invalid={isInvalid}>
								<FieldLabel htmlFor={field.name}>Priority</FieldLabel>
								<Select
									onValueChange={(e) =>
										field.handleChange(
											e as NonNullable<typeof priorities.data>[number]["id"],
										)
									}
									value={field.state.value ?? undefined} // fallbacks null to undefined
								>
									<SelectTrigger aria-invalid={isInvalid} id={field.name}>
										<SelectValue onBlur={field.handleBlur} />
									</SelectTrigger>
									<SelectContent>
										{priorities.data?.map((priority) => (
											<SelectItem key={priority.id} value={priority.id}>
												{priority.name}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
								{isInvalid && <FieldError errors={field.state.meta.errors} />}
							</Field>
						);
					}}
				</form.Field>
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
