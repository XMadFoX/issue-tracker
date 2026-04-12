import { PaletteDialog } from "@prism/blocks/features/search/palette-dialog";
import { skipToken, useQuery } from "@tanstack/react-query";
import { useMatchRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { orpc } from "src/orpc/client";

const MIN_PALETTE_QUERY_LENGTH = 2;

export function AppPaletteDialog() {
	const [query, setQuery] = useState("");
	const matchRoute = useMatchRoute();
	const navigate = useNavigate();
	const issuesRouteParams = matchRoute({
		to: "/workspace/$slug/teams/$teamSlug/issues",
		fuzzy: true,
	});
	const workspaceSlug = issuesRouteParams ? issuesRouteParams.slug : undefined;
	const teamSlug = issuesRouteParams ? issuesRouteParams.teamSlug : undefined;
	const normalizedQuery = query.trim();

	const workspace = useQuery(
		orpc.workspace.getBySlug.queryOptions({
			input: workspaceSlug ? { slug: workspaceSlug } : skipToken,
		}),
	);

	const workspaceId = workspace.data?.id;

	const team = useQuery(
		orpc.team.getBySlug.queryOptions({
			input:
				workspaceId && teamSlug ? { key: teamSlug, workspaceId } : skipToken,
		}),
	);

	const teamId = team.data?.id;

	const searchResults = useQuery(
		orpc.issue.search.queryOptions({
			input:
				workspaceId &&
				teamId &&
				normalizedQuery.length >= MIN_PALETTE_QUERY_LENGTH
					? {
							workspaceId,
							query: normalizedQuery,
							mode: "hybrid",
							filters: { teamId },
							options: { includeTeam: true },
							includeArchived: false,
						}
					: skipToken,
		}),
	);

	return (
		<PaletteDialog
			workspaceId={workspaceId}
			query={query}
			onQueryChange={setQuery}
			issues={searchResults.data?.issues ?? []}
			isSearching={searchResults.isFetching}
			hasSearched={searchResults.isFetched}
			minQueryLength={MIN_PALETTE_QUERY_LENGTH}
			onIssueSelect={(issueId) => {
				if (!workspaceSlug || !teamSlug) return;

				navigate({
					to: "/workspace/$slug/teams/$teamSlug/issues",
					params: { slug: workspaceSlug, teamSlug },
					search: { selectedIssue: issueId },
				});
			}}
		/>
	);
}
