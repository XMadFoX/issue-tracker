import {
	afterAll,
	beforeAll,
	beforeEach,
	describe,
	expect,
	test,
} from "bun:test";
import { eq, sql } from "drizzle-orm";
import setupDb from "../../utils/prepare-tests";
import type { IssueActivityActionType } from "../issues/activity";
import type { CycleBaselineActionType, CycleBaselineActivity } from "./metrics";

let db: typeof import("db").db;
let completeCycle: typeof import("./completion").completeCycle;
let getCyclePlannedBaseline: typeof import("./metrics").getCyclePlannedBaseline;
let cycle: typeof import("db/features/tracker/cycles.schema").cycle;
let issueActivity: typeof import("db/features/tracker/issue-activities.schema").issueActivity;
let issueStatus: typeof import("db/features/tracker/issue-statuses.schema").issueStatus;
let issueStatusGroup: typeof import("db/features/tracker/issue-statuses.schema").issueStatusGroup;
let issueType: typeof import("db/features/tracker/issue-types.schema").issueType;
let issue: typeof import("db/features/tracker/issues.schema").issue;
let team: typeof import("db/features/tracker/tracker.schema").team;
let workspace: typeof import("db/features/tracker/tracker.schema").workspace;
let user: typeof import("db/features/auth/auth.schema").user;

let teardown: Awaited<ReturnType<typeof setupDb>>;

const ids = {
	actor: "completion-test-actor",
	source: "completion-test-source",
	target: "completion-test-target",
	team: "completion-test-team",
	type: "completion-test-type",
	workspace: "completion-test-workspace",
};

const categories = [
	"backlog",
	"planned",
	"in_progress",
	"completed",
	"canceled",
] as const;

type Category = (typeof categories)[number];

type PersistedActivity = {
	actionType: IssueActivityActionType;
	createdAt: Date;
	id: string;
	issueId: string;
};

function isCycleBaselineAction(
	actionType: IssueActivityActionType,
): actionType is CycleBaselineActionType {
	return (
		actionType === "issue.cycle_assigned" ||
		actionType === "issue.cycle_unassigned" ||
		actionType === "issue.cycle_rolled_over" ||
		actionType === "issue.cycle_returned_to_backlog"
	);
}

function toBaselineActivities(
	activities: PersistedActivity[],
): CycleBaselineActivity[] {
	const baselineActivities: CycleBaselineActivity[] = [];
	for (const activity of activities) {
		if (isCycleBaselineAction(activity.actionType)) {
			baselineActivities.push({
				issueId: activity.issueId,
				actionType: activity.actionType,
				createdAt: activity.createdAt,
				id: activity.id,
			});
		}
	}
	return baselineActivities;
}

beforeAll(async () => {
	teardown = await setupDb();
	({ db } = await import("db"));
	({ completeCycle } = await import("./completion"));
	({ getCyclePlannedBaseline } = await import("./metrics"));
	({ cycle } = await import("db/features/tracker/cycles.schema"));
	({ issueActivity } = await import(
		"db/features/tracker/issue-activities.schema"
	));
	({ issueStatus, issueStatusGroup } = await import(
		"db/features/tracker/issue-statuses.schema"
	));
	({ issueType } = await import("db/features/tracker/issue-types.schema"));
	({ issue } = await import("db/features/tracker/issues.schema"));
	({ team, workspace } = await import("db/features/tracker/tracker.schema"));
	({ user } = await import("db/features/auth/auth.schema"));
}, 30_000);

afterAll(async () => {
	if (teardown) await teardown();
});

beforeEach(async () => {
	await db.execute(
		sql`truncate table issue_activity, issue, cycle, issue_status, issue_status_group, issue_type, team, workspace, "user" cascade`,
	);
});

async function seedFixture() {
	const sourceStart = new Date("2025-01-10T00:00:00.000Z");
	const sourceEnd = new Date("2025-01-24T00:00:00.000Z");
	const targetStart = new Date("2030-02-01T00:00:00.000Z");
	await db.insert(user).values({
		id: ids.actor,
		name: "Completion Actor",
		email: "completion-actor@example.test",
	});
	await db.insert(workspace).values({
		id: ids.workspace,
		name: "Completion Workspace",
		slug: "completion-workspace",
		timezone: "UTC",
	});
	await db.insert(team).values({
		id: ids.team,
		workspaceId: ids.workspace,
		name: "Completion Team",
		key: "CMP",
		privacy: "public",
	});
	await db.insert(issueType).values({
		id: ids.type,
		workspaceId: ids.workspace,
		teamId: ids.team,
		name: "Task",
		key: "task",
		icon: "check",
		color: "blue",
		orderIndex: 0,
	});
	for (const [index, category] of categories.entries()) {
		await db.insert(issueStatusGroup).values({
			id: `completion-group-${category}`,
			workspaceId: ids.workspace,
			key: category,
			name: category,
			canonicalCategory: category,
			orderIndex: index,
		});
		await db.insert(issueStatus).values({
			id: `completion-status-${category}`,
			workspaceId: ids.workspace,
			statusGroupId: `completion-group-${category}`,
			name: category,
			orderIndex: index,
		});
	}
	await db.insert(cycle).values([
		{
			id: ids.source,
			workspaceId: ids.workspace,
			teamId: ids.team,
			name: "Source Cycle",
			sequence: 1,
			state: "active",
			startDate: sourceStart,
			endDate: sourceEnd,
		},
		{
			id: ids.target,
			workspaceId: ids.workspace,
			teamId: ids.team,
			name: "Target Cycle",
			sequence: 2,
			state: "planned",
			startDate: targetStart,
			endDate: new Date("2030-02-15T00:00:00.000Z"),
		},
	]);
	for (const [index, category] of categories.entries()) {
		await db.insert(issue).values({
			id: `completion-issue-${category}`,
			workspaceId: ids.workspace,
			teamId: ids.team,
			number: index + 1,
			title: `${category} issue`,
			statusId: `completion-status-${category}`,
			issueTypeId: ids.type,
			cycleId: ids.source,
			estimate: index + 1,
			creatorId: ids.actor,
			sortOrder: `a0${index}`,
		});
	}
	return { sourceStart, targetStart };
}

async function getIssueCycle(category: Category) {
	const [row] = await db
		.select({ cycleId: issue.cycleId })
		.from(issue)
		.where(eq(issue.id, `completion-issue-${category}`));
	return row?.cycleId;
}

describe("completeCycle", () => {
	test("carries only planned and in-progress work, writes audited activities, and preserves metric baselines", async () => {
		const { sourceStart, targetStart } = await seedFixture();
		await db.insert(issueActivity).values({
			id: "completion-initial-planned-assignment",
			workspaceId: ids.workspace,
			teamId: ids.team,
			issueId: "completion-issue-planned",
			cycleId: ids.source,
			actionType: "issue.cycle_assigned",
			field: "cycleId",
			fromValue: null,
			toValue: ids.source,
			metadata: { estimate: 2, issueTypeId: ids.type, cycleId: ids.source },
			createdAt: new Date(sourceStart.getTime() - 1_000),
		});

		const result = await completeCycle({
			actorId: ids.actor,
			workspaceId: ids.workspace,
			teamId: ids.team,
			cycleId: ids.source,
			disposition: { type: "carryOver", targetCycleId: ids.target },
			reason: "manual",
		});
		expect(result).toMatchObject({
			ok: true,
			counts: {
				carriedOver: 2,
				returnedToBacklog: 1,
				completed: 1,
				canceled: 1,
			},
			destinationCycleId: ids.target,
		});
		expect(await getIssueCycle("planned")).toBe(ids.target);
		expect(await getIssueCycle("in_progress")).toBe(ids.target);
		expect(await getIssueCycle("backlog")).toBeNull();
		expect(await getIssueCycle("completed")).toBe(ids.source);
		expect(await getIssueCycle("canceled")).toBe(ids.source);

		const activities = await db
			.select()
			.from(issueActivity)
			.where(eq(issueActivity.workspaceId, ids.workspace));
		expect(activities).toHaveLength(4);
		const rollover = activities.filter(
			(activity) => activity.actionType === "issue.cycle_rolled_over",
		);
		expect(rollover).toHaveLength(2);
		for (const activity of rollover) {
			expect(activity.cycleId).toBe(ids.target);
			expect(activity.metadata).toMatchObject({
				fromCycleId: ids.source,
				fromCycleName: "Source Cycle",
				toCycleId: ids.target,
				toCycleName: "Target Cycle",
				reason: "manual",
				issueTypeId: ids.type,
			});
		}
		const [backlogReturn] = activities.filter(
			(activity) => activity.actionType === "issue.cycle_returned_to_backlog",
		);
		expect(backlogReturn?.cycleId).toBe(ids.source);
		expect(backlogReturn?.metadata).toMatchObject({
			fromCycleId: ids.source,
			fromCycleName: "Source Cycle",
			reason: "manual",
			issueTypeId: ids.type,
			estimate: 1,
		});

		const sourceActivities = toBaselineActivities(
			activities
				.filter((activity) => activity.cycleId === ids.source)
				.map((activity) => ({
					issueId: activity.issueId,
					actionType: activity.actionType,
					createdAt: activity.createdAt,
					id: activity.id,
				})),
		);
		const targetActivities = toBaselineActivities(
			activities
				.filter((activity) => activity.cycleId === ids.target)
				.map((activity) => ({
					issueId: activity.issueId,
					actionType: activity.actionType,
					createdAt: activity.createdAt,
					id: activity.id,
				})),
		);
		expect(
			getCyclePlannedBaseline(sourceActivities, new Date()).filter(
				(activity) => activity.actionType === "issue.cycle_assigned",
			),
		).toHaveLength(1);
		expect(getCyclePlannedBaseline(targetActivities, targetStart)).toHaveLength(
			2,
		);
	});

	test("moves every open member to backlog when requested", async () => {
		await seedFixture();
		const result = await completeCycle({
			actorId: ids.actor,
			workspaceId: ids.workspace,
			teamId: ids.team,
			cycleId: ids.source,
			disposition: { type: "moveToBacklog" },
			reason: "manual",
		});
		expect(result).toMatchObject({
			ok: true,
			counts: {
				carriedOver: 0,
				returnedToBacklog: 3,
				completed: 1,
				canceled: 1,
			},
		});
		expect(await getIssueCycle("backlog")).toBeNull();
		expect(await getIssueCycle("planned")).toBeNull();
		expect(await getIssueCycle("in_progress")).toBeNull();
		expect(await getIssueCycle("completed")).toBe(ids.source);
		expect(await getIssueCycle("canceled")).toBe(ids.source);
		const activities = await db.select().from(issueActivity);
		expect(activities).toHaveLength(3);
		expect(
			activities.every(
				(activity) =>
					activity.actionType === "issue.cycle_returned_to_backlog" &&
					activity.cycleId === ids.source,
			),
		).toBeTrue();
	});

	test("rejects invalid targets atomically", async () => {
		await seedFixture();
		await db.insert(team).values({
			id: "completion-other-team",
			workspaceId: ids.workspace,
			name: "Other Team",
			key: "OTH",
			privacy: "public",
		});
		await db.insert(cycle).values([
			{
				id: "completion-completed-target",
				workspaceId: ids.workspace,
				teamId: ids.team,
				name: "Completed target",
				sequence: 3,
				state: "completed",
				startDate: new Date("2030-03-01T00:00:00.000Z"),
				endDate: new Date("2030-03-15T00:00:00.000Z"),
			},
			{
				id: "completion-canceled-target",
				workspaceId: ids.workspace,
				teamId: ids.team,
				name: "Canceled target",
				sequence: 4,
				state: "canceled",
				startDate: new Date("2030-04-01T00:00:00.000Z"),
				endDate: new Date("2030-04-15T00:00:00.000Z"),
			},
			{
				id: "completion-cross-team-target",
				workspaceId: ids.workspace,
				teamId: "completion-other-team",
				name: "Other team target",
				sequence: 1,
				state: "planned",
				startDate: new Date("2030-05-01T00:00:00.000Z"),
				endDate: new Date("2030-05-15T00:00:00.000Z"),
			},
		]);
		const invalidTargets = [
			{ targetCycleId: ids.source, expected: "INVALID_ROLLOVER_TARGET" },
			{ targetCycleId: "missing-cycle", expected: "INVALID_ROLLOVER_TARGET" },
			{
				targetCycleId: "completion-completed-target",
				expected: "INVALID_ROLLOVER_TARGET",
			},
			{
				targetCycleId: "completion-canceled-target",
				expected: "INVALID_ROLLOVER_TARGET",
			},
			{
				targetCycleId: "completion-cross-team-target",
				expected: "TEAM_MISMATCH",
			},
		] as const;
		for (const { targetCycleId, expected } of invalidTargets) {
			const result = await completeCycle({
				actorId: ids.actor,
				workspaceId: ids.workspace,
				teamId: ids.team,
				cycleId: ids.source,
				disposition: { type: "carryOver", targetCycleId },
				reason: "manual",
			});
			expect(result).toEqual({ ok: false, code: expected });
			expect(await getIssueCycle("planned")).toBe(ids.source);
			expect(await db.select().from(issueActivity)).toHaveLength(0);
		}
	});

	test("returns typed errors for non-active source states", async () => {
		await seedFixture();
		for (const state of ["planned", "canceled", "completed"] as const) {
			await db.update(cycle).set({ state }).where(eq(cycle.id, ids.source));
			const result = await completeCycle({
				actorId: ids.actor,
				workspaceId: ids.workspace,
				teamId: ids.team,
				cycleId: ids.source,
				disposition: { type: "moveToBacklog" },
				reason: "manual",
			});
			expect(result).toEqual({
				ok: false,
				code:
					state === "completed" ? "CYCLE_ALREADY_COMPLETED" : "CYCLE_CLOSED",
			});
			await db
				.update(cycle)
				.set({ state: "active" })
				.where(eq(cycle.id, ids.source));
		}
	});

	test("serializes repeated completion calls without duplicate activities", async () => {
		await seedFixture();
		const results = await Promise.all([
			completeCycle({
				actorId: ids.actor,
				workspaceId: ids.workspace,
				teamId: ids.team,
				cycleId: ids.source,
				disposition: { type: "moveToBacklog" },
				reason: "manual",
			}),
			completeCycle({
				actorId: ids.actor,
				workspaceId: ids.workspace,
				teamId: ids.team,
				cycleId: ids.source,
				disposition: { type: "moveToBacklog" },
				reason: "manual",
			}),
		]);
		expect(results.filter((result) => result.ok)).toHaveLength(1);
		expect(
			results.filter(
				(result) => !result.ok && result.code === "CYCLE_ALREADY_COMPLETED",
			),
		).toHaveLength(1);
		expect(await db.select().from(issueActivity)).toHaveLength(3);
	});
});
