import type { IssueLinkTarget } from "@prism/blocks/src/features/issues";

export type IssueUrlParams = {
	slug: string;
	teamSlug: string;
	issue: IssueLinkTarget;
};

export function buildIssueUrl({
	slug,
	teamSlug,
	issue,
}: IssueUrlParams): `/${string}` {
	const nextTeamSlug = issue.team?.key ?? teamSlug;
	return `/workspace/${slug}/teams/${nextTeamSlug}/issue/${issue.id}`;
}
