import { describe, expect, test } from "bun:test";
import {
	buildIssueTypeScopeChange,
	type CycleBaselineActivity,
	completionRate,
	getCyclePlannedBaseline,
	type IssueTypeMetricRow,
	isCycleBaselineAssignment,
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

const cycleStartDate = new Date("2026-07-01T00:00:00.000Z");

function plannedIssueIds(activities: CycleBaselineActivity[]) {
	return getCyclePlannedBaseline(activities, cycleStartDate)
		.filter((activity) => isCycleBaselineAssignment(activity.actionType))
		.map((activity) => activity.issueId)
		.sort();
}

describe("cycle planned baseline", () => {
	test("counts original assignments as planned scope", () => {
		expect(
			plannedIssueIds([
				{
					issueId: "issue-1",
					actionType: "issue.cycle_assigned",
					createdAt: new Date("2026-06-30T12:00:00.000Z"),
					id: "activity-1",
				},
			]),
		).toEqual(["issue-1"]);
	});

	test("removes unassigned and returned-to-backlog issues from source scope", () => {
		expect(
			plannedIssueIds([
				{
					issueId: "unassigned-issue",
					actionType: "issue.cycle_assigned",
					createdAt: new Date("2026-06-29T12:00:00.000Z"),
					id: "activity-1",
				},
				{
					issueId: "unassigned-issue",
					actionType: "issue.cycle_unassigned",
					createdAt: new Date("2026-06-30T12:00:00.000Z"),
					id: "activity-2",
				},
				{
					issueId: "backlog-issue",
					actionType: "issue.cycle_assigned",
					createdAt: new Date("2026-06-29T12:00:00.000Z"),
					id: "activity-3",
				},
				{
					issueId: "backlog-issue",
					actionType: "issue.cycle_returned_to_backlog",
					createdAt: new Date("2026-06-30T12:00:00.000Z"),
					id: "activity-4",
				},
			]),
		).toEqual([]);
	});

	test("counts a rollover as assignment in the destination cycle", () => {
		expect(
			plannedIssueIds([
				{
					issueId: "rolled-over-issue",
					actionType: "issue.cycle_rolled_over",
					createdAt: new Date("2026-06-30T12:00:00.000Z"),
					id: "activity-1",
				},
			]),
		).toEqual(["rolled-over-issue"]);
	});

	test("uses activity ID to break same-timestamp baseline ties", () => {
		expect(
			plannedIssueIds([
				{
					issueId: "issue-1",
					actionType: "issue.cycle_assigned",
					createdAt: new Date("2026-06-30T12:00:00.000Z"),
					id: "activity-a",
				},
				{
					issueId: "issue-1",
					actionType: "issue.cycle_unassigned",
					createdAt: new Date("2026-06-30T12:00:00.000Z"),
					id: "activity-b",
				},
				{
					issueId: "issue-2",
					actionType: "issue.cycle_unassigned",
					createdAt: new Date("2026-06-30T12:00:00.000Z"),
					id: "activity-a",
				},
				{
					issueId: "issue-2",
					actionType: "issue.cycle_assigned",
					createdAt: new Date("2026-06-30T12:00:00.000Z"),
					id: "activity-b",
				},
			]),
		).toEqual(["issue-2"]);
	});
});

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
