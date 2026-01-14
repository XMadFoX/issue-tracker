import type { issueCreateSchema } from "@prism/api/src/features/issues/schema";
import { IssueCreateForm } from "@prism/blocks/src/features/issues/form/create";
import {
	skipToken,
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
	const { slug, teamSlug } = Route.useParams();
	const workspace = useSuspenseQuery(
		orpc.workspace.getBySlug.queryOptions({ input: { slug } }),
	);
	const workspaceId = workspace.data?.id;

	const team = useQuery(
		orpc.team.getBySlug.queryOptions({
			input: workspaceId
				? { key: teamSlug, workspaceId: workspace?.data?.id }
				: skipToken,
			enabled: !!workspace?.data?.id,
		}),
	);
	const priorities = useQuery(
		orpc.priority.list.queryOptions({
			input: workspaceId ? { workspaceId: workspace.data.id } : skipToken,
		}),
	);
	const statuses = useQuery(
		orpc.issue.status.list.queryOptions({
			input: workspaceId ? { id: workspace.data.id } : skipToken,
		}),
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
