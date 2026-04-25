import { createFileRoute } from "@tanstack/react-router";
import { IssuePageContainer } from "@/features/issues/issue-page-container";
import { loadIssuePageRoute } from "@/features/issues/loaders";

export const Route = createFileRoute(
	"/workspace/$slug/teams/$teamSlug/issue/$issueId",
)({
	loader: ({ context, params }) =>
		loadIssuePageRoute({
			queryClient: context.queryClient,
			slug: params.slug,
			teamSlug: params.teamSlug,
			issueId: params.issueId,
		}),
	component: RouteComponent,
});

function RouteComponent() {
	const { issueId, slug, teamSlug } = Route.useParams();

	return (
		<IssuePageContainer issueId={issueId} slug={slug} teamSlug={teamSlug} />
	);
}
