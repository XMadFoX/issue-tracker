import { IssueList } from "@prism/blocks/src/features/issues/list/issue-list";
import { skipToken, useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { orpc } from "src/orpc/client";

export const Route = createFileRoute(
	"/workspace/$slug/teams/$teamSlug/issues/",
)({
	component: RouteComponent,
});

function RouteComponent() {
	const { slug } = Route.useParams();
	const workspace = useQuery(
		orpc.workspace.getBySlug.queryOptions({ input: { slug } }),
	);

	const issues = useQuery(
		orpc.issue.list.queryOptions({
			input: workspace.data?.id
				? { workspaceId: workspace.data.id }
				: skipToken,
		}),
	);

	const statuses = useQuery(
		orpc.issue.status.list.queryOptions({
			input: workspace.data?.id ? { id: workspace.data.id } : skipToken,
		}),
	);

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

			<IssueList issues={issues.data ?? []} statuses={statuses.data ?? []} />
		</div>
	);
}
