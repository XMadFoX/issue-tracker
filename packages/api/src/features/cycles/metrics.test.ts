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

	test("calculates non-zero rates and orders named types deterministically", () => {
		const bug: IssueTypeMetricRow = {
			...task,
			issueTypeId: "bug",
			issueTypeName: "Bug",
			issueTypeKey: "bug",
		};
		const feature: IssueTypeMetricRow = {
			...task,
			issueTypeId: "feature",
			issueTypeName: "Feature",
			issueTypeKey: "feature",
		};

		const metrics = normalizeIssueTypeMetrics([task, feature, bug]);

		expect(metrics.map((metric) => metric.issueType?.id)).toEqual([
			"bug",
			"feature",
			"task",
		]);
		expect(metrics[2]?.completionRate).toBe(0.5);
	});

	test("uses a zero completion rate for an empty group", () => {
		expect(completionRate(0, 0)).toBe(0);
	});
});
