import type { issueCreateSchema } from "@prism/api/src/features/issues/schema";
import { IssueCreateForm } from "@prism/blocks/src/features/issues/form/create";
import { Button } from "@prism/ui/components/button";
import { FieldError } from "@prism/ui/components/field";
import { useAppForm } from "@prism/ui/components/form/form-hooks";
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
			teamId: team.data?.[0]?.id,
			statusId: statuses.data?.[0]?.id,
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
			<IssueCreateForm
				workspaceId={workspace.data.id}
				teamId={team?.data?.id ?? ""}
				statuses={statuses.data ?? []}
				priorities={priorities.data ?? []}
				onSubmit={onSubmit}
			/>
		</div>
	);
}
