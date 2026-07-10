import { describe, expect, test } from "bun:test";
import {
	buildIssueTypeScopeChange,
	completionRate,
	type IssueTypeMetricRow,
	normalizeIssueTypeMetrics,
} from "./metrics";

const task: IssueTypeMetricRow = {
	issueTypeId: "task",
	issueTypeName: "Task",
	issueTypeKey: "task",
	issueTypeIcon: "check",
	issueTypeColor: "blue",
	issueTypeArchivedAt: null,
	issueCount: 2,
	completedIssueCount: 1,
	totalPoints: 5,
	completedPoints: 3,
};

describe("issue type metrics", () => {
	test("merges identities, retains one-sided rows, and sorts Unclassified last", () => {
		const archived: IssueTypeMetricRow = {
			...task,
			issueTypeId: "bug",
			issueTypeName: "Bug",
			issueTypeKey: "bug",
			issueTypeArchivedAt: new Date("2026-01-01"),
			issueCount: 1,
			completedIssueCount: 1,
			totalPoints: 2,
			completedPoints: 2,
		};
		const unclassified: IssueTypeMetricRow = {
			...task,
			issueTypeId: null,
			issueTypeName: null,
			issueTypeKey: null,
			issueTypeIcon: null,
			issueTypeColor: null,
			issueCount: 1,
			completedIssueCount: 0,
			totalPoints: 1,
			completedPoints: 0,
		};
		const current = normalizeIssueTypeMetrics([unclassified, task]);
		const planned = normalizeIssueTypeMetrics([
			archived,
			{ ...task, issueCount: 1, totalPoints: 2 },
		]);
		const scopeChange = buildIssueTypeScopeChange(current, planned);

		expect(current.map((metric) => metric.issueType?.id ?? null)).toEqual([
			"task",
			null,
		]);
		expect(planned[0]?.issueType?.archivedAt).toEqual(new Date("2026-01-01"));
		expect(scopeChange).toEqual([
			expect.objectContaining({
				issueType: expect.objectContaining({ id: "bug" }),
				issueCountDelta: -1,
				pointsDelta: -2,
			}),
			expect.objectContaining({
				issueType: expect.objectContaining({ id: "task" }),
				issueCountDelta: 1,
				pointsDelta: 3,
			}),
			expect.objectContaining({
				issueType: null,
				issueCountDelta: 1,
				pointsDelta: 1,
			}),
		]);
	});

	test("uses a zero completion rate for an empty group", () => {
		expect(completionRate(0, 0)).toBe(0);
	});
});
