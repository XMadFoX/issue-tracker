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

type SubmitResult = { success: true } | { error: unknown };

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

	const onSubmit = async (
		issue: z.input<typeof issueCreateSchema>,
	): Promise<SubmitResult> => {
		try {
			await createIssue.mutateAsync(issue);
			// TODO: optimistic mutation, no full refetch
			qc.invalidateQueries({ queryKey: orpc.issue.list.key() });
			toast.success("Issue created successfully");
			return { success: true } as const;
		} catch (err) {
			toast.error("Issue creation failed");
			return { error: err };
		}
	};

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
