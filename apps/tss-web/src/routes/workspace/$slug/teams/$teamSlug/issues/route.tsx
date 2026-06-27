import { createFileRoute } from "@tanstack/react-router";
import z from "zod";
import { IssuesRouteContainer } from "@/features/issues/issues-route-container";
import { loadTeamIssuesRoute } from "@/features/issues/loaders";

const searchParamsSchema = z.object({
	selectedIssue: z.string().optional(),
	archivedFilter: z
		.enum(["unarchived", "archived", "all"])
		.default("unarchived"),
	issueTypeId: z.string().optional(),
});

export const Route = createFileRoute("/workspace/$slug/teams/$teamSlug/issues")(
	{
		validateSearch: searchParamsSchema,
		loaderDeps: ({ search }) => ({
			archivedFilter: search.archivedFilter,
			issueTypeId: search.issueTypeId,
		}),
		loader: ({ context, params, deps }) =>
			loadTeamIssuesRoute({
				queryClient: context.queryClient,
				slug: params.slug,
				teamSlug: params.teamSlug,
				archivedFilter: deps.archivedFilter,
				issueTypeId: deps.issueTypeId,
			}),
		component: RouteComponent,
	},
);

function RouteComponent() {
	const { slug, teamSlug } = Route.useParams();
	const search = Route.useSearch();

	return (
		<IssuesRouteContainer
			slug={slug}
			teamSlug={teamSlug}
			selectedIssueId={search.selectedIssue}
			archivedFilter={search.archivedFilter}
			issueTypeId={search.issueTypeId}
		/>
	);
}
