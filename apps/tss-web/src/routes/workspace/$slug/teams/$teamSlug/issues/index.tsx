import type { issueCreateSchema } from "@prism/api/src/features/issues/schema";
import { IssueList } from "@prism/blocks/src/features/issues/list/issue-list";
import {
	skipToken,
	useMutation,
	useQuery,
	useQueryClient,
} from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import { orpc } from "src/orpc/client";
import type z from "zod";

export const Route = createFileRoute(
	"/workspace/$slug/teams/$teamSlug/issues/",
)({
	component: RouteComponent,
});

type SubmitResult = { success: true } | { error: unknown };

function RouteComponent() {
	const { slug, teamSlug } = Route.useParams();
	const workspace = useQuery(
		orpc.workspace.getBySlug.queryOptions({ input: { slug } }),
	);

	const workspaceId = workspace.data?.id;

	const team = useQuery(
		orpc.team.getBySlug.queryOptions({
			input: workspaceId ? { slug: teamSlug, workspaceId } : skipToken,
			enabled: !!workspace?.data?.id,
		}),
	);
	const priorities = useQuery(
		orpc.priority.list.queryOptions({
			input: workspaceId ? { workspaceId } : skipToken,
		}),
	);

	const issues = useQuery(
		orpc.issue.list.queryOptions({
			input: workspace.data?.id
				? { workspaceId: workspace.data.id }
				: skipToken,
		}),
	);

	const labels = useQuery(
		orpc.label.list.queryOptions({
			input:
				workspace.data?.id && team.data?.id
					? {
							workspaceId: workspace.data.id,
							teamId: team.data.id,
							scope: "all",
						}
					: skipToken,
		}),
	);

	const statuses = useQuery(
		orpc.issue.status.list.queryOptions({
			input: workspace.data?.id ? { id: workspace.data.id } : skipToken,
		}),
	);

	const qc = useQueryClient();
	const createIssue = useMutation(orpc.issue.create.mutationOptions());

	const onIssueSubmit = async (
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

	if (workspace.isLoading || issues.isLoading || statuses.isLoading) {
		return (
			<div className="flex items-center justify-center h-full">
				<div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
			</div>
		);
	}

	return (
		<div className="p-6 space-y-8 w-full">
			<div className="flex items-center justify-between">
				<h1 className="text-2xl font-bold">Issues</h1>
			</div>

			<IssueList
				issues={issues.data ?? []}
				statuses={statuses.data ?? []}
				teamId={team?.data?.id ?? ""}
				priorities={priorities.data ?? []}
				workspaceId={workspaceId ?? ""}
				onIssueSubmit={onIssueSubmit}
			/>
		</div>
	);
}
