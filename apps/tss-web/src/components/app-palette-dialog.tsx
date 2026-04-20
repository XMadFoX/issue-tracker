import { PaletteDialog } from "@prism/blocks/features/search/palette-dialog";
import { useDebouncedValue } from "@tanstack/react-pacer";
import { skipToken, useQuery } from "@tanstack/react-query";
import { useMatchRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { orpc } from "src/orpc/client";

const TEXT_PALETTE_QUERY_MIN_LENGTH = 2;
const ISSUE_NUMBER_QUERY_MIN_LENGTH = 1;
const PALETTE_QUERY_DEBOUNCE_MS = 300;
const ISSUE_NUMBER_QUERY_REGEX = /^\d+$/;

function isIssueNumberQuery(query: string) {
	return ISSUE_NUMBER_QUERY_REGEX.test(query);
}

function isCrossTeamIssueReferenceQuery(
	query: string,
	readableTeamKeys: Array<string>,
) {
	if (isIssueNumberQuery(query)) return true;

	const normalizedQuery = query.trim().toLowerCase();
	if (normalizedQuery.length === 0) return false;

	const separatorIndex = normalizedQuery.lastIndexOf("-");
	if (separatorIndex > 0 && separatorIndex < normalizedQuery.length - 1) {
		const teamKey = normalizedQuery.slice(0, separatorIndex);
		const issueNumber = normalizedQuery.slice(separatorIndex + 1);

		if (isIssueNumberQuery(issueNumber) && readableTeamKeys.includes(teamKey)) {
			return true;
		}
	}

	return readableTeamKeys.some((teamKey) => {
		if (!normalizedQuery.startsWith(teamKey)) return false;

		return isIssueNumberQuery(normalizedQuery.slice(teamKey.length));
	});
}

function getMinPaletteQueryLength(query: string) {
	return isIssueNumberQuery(query)
		? ISSUE_NUMBER_QUERY_MIN_LENGTH
		: TEXT_PALETTE_QUERY_MIN_LENGTH;
}

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
	const [debouncedQuery, debouncer] = useDebouncedValue(
		normalizedQuery,
		{ wait: PALETTE_QUERY_DEBOUNCE_MS },
		(state) => ({ isPending: state.isPending }),
	);
	const minQueryLength = getMinPaletteQueryLength(normalizedQuery);
	const debouncedMinQueryLength = getMinPaletteQueryLength(debouncedQuery);
	const canSearch = debouncedQuery.length >= debouncedMinQueryLength;
	const isDebouncing = debouncer.state.isPending;

	const workspace = useQuery(
		orpc.workspace.getBySlug.queryOptions({
			input: workspaceSlug ? { slug: workspaceSlug } : skipToken,
		}),
	);

	const workspaceId = workspace.data?.id;
	const readableTeams = useQuery(
		orpc.team.listReadableByWorkspace.queryOptions({
			input: workspaceId ? { id: workspaceId } : skipToken,
		}),
	);

	const team = useQuery(
		orpc.team.getBySlug.queryOptions({
			input:
				workspaceId && teamSlug ? { key: teamSlug, workspaceId } : skipToken,
		}),
	);

	const teamId = team.data?.id;
	const readableTeamKeys = (readableTeams.data ?? []).map((readableTeam) =>
		readableTeam.key.toLowerCase(),
	);
	const shouldSearchAcrossTeams = isCrossTeamIssueReferenceQuery(
		debouncedQuery,
		readableTeamKeys,
	);
	const filters = shouldSearchAcrossTeams || !teamId ? undefined : { teamId };
	const canSearchIssues = Boolean(
		workspaceId && canSearch && (shouldSearchAcrossTeams || filters),
	);

	const searchResults = useQuery(
		orpc.issue.search.queryOptions({
			input:
				workspaceId && canSearchIssues
					? {
							workspaceId,
							query: debouncedQuery,
							mode: "hybrid",
							...(filters ? { filters } : {}),
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
			issues={isDebouncing ? [] : (searchResults.data?.issues ?? [])}
			isSearching={isDebouncing || searchResults.isFetching}
			hasSearched={searchResults.isFetched}
			minQueryLength={minQueryLength}
			onIssueSelect={(issue) => {
				const nextTeamSlug = issue.team?.key ?? teamSlug;
				if (!workspaceSlug || !nextTeamSlug) return;

				navigate({
					to: "/workspace/$slug/teams/$teamSlug/issues",
					params: { slug: workspaceSlug, teamSlug: nextTeamSlug },
					search: { selectedIssue: issue.id },
				});
			}}
		/>
	);
}
