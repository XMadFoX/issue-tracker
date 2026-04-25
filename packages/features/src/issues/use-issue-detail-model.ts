import { useMemo } from "react";
import type { IssueDetailData, IssueListData } from "./types";

type Params = {
	issue: IssueDetailData | undefined;
	issues: IssueListData;
};

export function useIssueDetailModel({ issue, issues }: Params) {
	const parentIssue = useMemo(() => {
		if (!issue?.parentIssueId) return null;
		return issues.find((item) => item.id === issue.parentIssueId) ?? null;
	}, [issue?.parentIssueId, issues]);

	const subIssues = useMemo(() => {
		if (!issue) return [];
		return issues.filter((item) => item.parentIssueId === issue.id);
	}, [issue, issues]);

	return { parentIssue, subIssues };
}
