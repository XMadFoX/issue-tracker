import {
	Alert,
	AlertDescription,
	AlertTitle,
} from "@prism/ui/components/alert";
import { Button } from "@prism/ui/components/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardFooter,
	CardHeader,
	CardTitle,
} from "@prism/ui/components/card";
import { FieldError } from "@prism/ui/components/field";
import { useAppForm } from "@prism/ui/components/form/form-hooks";
import { cn } from "@prism/ui/lib/utils";
import { TriangleAlertIcon } from "lucide-react";
import {
	type SubmitHandler,
	type Workspace,
	type WorkspaceGeneralUpdateInput,
	workspaceGeneralDraftSchema,
} from "../types";

type WorkspaceGeneralFormProps = {
	workspace: Workspace;
	onSubmit: SubmitHandler<WorkspaceGeneralUpdateInput>;
	className?: string;
};

export function WorkspaceGeneralForm({
	workspace,
	onSubmit,
	className,
}: WorkspaceGeneralFormProps) {
	const form = useAppForm({
		defaultValues: {
			name: workspace.name,
			slug: workspace.slug,
			timezone: workspace.timezone,
		},
		validators: { onSubmit: workspaceGeneralDraftSchema },
		onSubmit: async ({ value }) => {
			const result = await onSubmit({ id: workspace.id, ...value });
			if ("error" in result) {
				const message =
					result.error instanceof Error
						? result.error.message
						: "Request failed. Please try again.";
				form.setErrorMap({ onSubmit: { form: message, fields: {} } });
				return { form: message };
			}
			form.reset(value);
		},
	});

	return (
		<form
			className={cn(className)}
			onSubmit={(event) => {
				event.preventDefault();
				form.handleSubmit();
			}}
		>
			<Card>
				<CardHeader>
					<CardTitle>General</CardTitle>
					<CardDescription>
						Your workspace's name, URL and timezone.
					</CardDescription>
				</CardHeader>
				<CardContent className="flex flex-col gap-5">
					<form.AppField name="name">
						{(field) => <field.Input label="Name" placeholder="Acme Inc." />}
					</form.AppField>
					<form.AppField name="slug">
						{(field) => (
							<div className="flex flex-col gap-3">
								<field.Input
									label="Slug"
									placeholder="acme"
									description="Used in your workspace URL. Lowercase letters, numbers and hyphens only."
								/>
								{field.state.value !== workspace.slug ? (
									<Alert className="border-amber-600/40 bg-amber-500/5 text-amber-700 dark:border-amber-400/30 dark:text-amber-400">
										<TriangleAlertIcon />
										<AlertTitle>
											Changing the slug breaks existing links
										</AlertTitle>
										<AlertDescription className="text-amber-700/80 dark:text-amber-400/80">
											Every URL containing “{workspace.slug}” — bookmarks,
											shared links and integrations — will stop working after
											you save.
										</AlertDescription>
									</Alert>
								) : null}
							</div>
						)}
					</form.AppField>
					<form.AppField name="timezone">
						{(field) => (
							<field.Input
								label="Timezone"
								placeholder="Europe/Berlin"
								description="IANA timezone name, e.g. UTC or America/New_York. Used for cycle schedules and date calculations."
							/>
						)}
					</form.AppField>
				</CardContent>
				<CardFooter className="justify-between gap-4 border-t">
					<form.Subscribe selector={(state) => [state.errorMap]}>
						{([errorMap]) => {
							const submitError = errorMap.onSubmit;
							const message =
								typeof submitError === "string"
									? submitError
									: submitError?.form;
							return typeof message === "string" ? (
								<FieldError>{message}</FieldError>
							) : (
								<span />
							);
						}}
					</form.Subscribe>
					<form.Subscribe
						selector={(state) => [state.isSubmitting, state.isDirty]}
					>
						{([isSubmitting, isDirty]) => (
							<Button type="submit" disabled={isSubmitting || !isDirty}>
								{isSubmitting ? "Saving…" : "Save changes"}
							</Button>
						)}
					</form.Subscribe>
				</CardFooter>
			</Card>
		</form>
	);
}
