import type { IssueLinkTarget } from "../types";

export function getIssueReference(issue: IssueLinkTarget) {
	if (issue.team?.key && typeof issue.number === "number") {
		return `${issue.team.key}-${issue.number}`;
	}

	if (typeof issue.number === "number") {
		return `#${issue.number}`;
	}

	return "Issue";
}

export function IssueReference({ issue }: { issue: IssueLinkTarget }) {
	return <>{getIssueReference(issue)}</>;
}
