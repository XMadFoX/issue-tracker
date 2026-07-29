import {
	afterAll,
	beforeAll,
	beforeEach,
	describe,
	expect,
	test,
} from "bun:test";
import { createId } from "@paralleldrive/cuid2";
import { and, eq, sql } from "drizzle-orm";
import setupDb from "../../utils/prepare-tests";

let db: typeof import("db").db;
let cycle: typeof import("db/features/tracker/cycles.schema").cycle;
let cycleScheduleJob: typeof import("db/features/tracker/cycle-schedule-jobs.schema").cycleScheduleJob;
let cycleActionRequired: typeof import("db/features/tracker/cycle-actions.schema").cycleActionRequired;
let cycleNotification: typeof import("db/features/tracker/cycle-notifications.schema").cycleNotification;
let team: typeof import("db/features/tracker/tracker.schema").team;
let workspace: typeof import("db/features/tracker/tracker.schema").workspace;
let teamCycleSettings: typeof import("db/features/tracker/team-cycle-settings.schema").teamCycleSettings;
let teardown: Awaited<ReturnType<typeof setupDb>>;

const ids = { workspace: createId(), team: createId(), cycle: createId() };
const boundary = new Date("2026-08-01T10:00:00.000Z");
const clock = { now: () => new Date("2026-07-15T10:00:00.000Z") };

beforeAll(async () => {
	teardown = await setupDb();
	({ db } = await import("db"));
	({ cycle } = await import("db/features/tracker/cycles.schema"));
	({ cycleScheduleJob } = await import(
		"db/features/tracker/cycle-schedule-jobs.schema"
	));
	({ cycleActionRequired } = await import(
		"db/features/tracker/cycle-actions.schema"
	));
	({ cycleNotification } = await import(
		"db/features/tracker/cycle-notifications.schema"
	));
	({ team, workspace } = await import("db/features/tracker/tracker.schema"));
	({ teamCycleSettings } = await import(
		"db/features/tracker/team-cycle-settings.schema"
	));
}, 300_000);

afterAll(async () => {
	if (teardown) await teardown();
}, 60_000);

beforeEach(async () => {
	await db.execute(sql`truncate table team, workspace cascade`);
	await db.insert(workspace).values({
		id: ids.workspace,
		name: "Notification Workspace",
		slug: `notification-${ids.workspace}`,
		timezone: "UTC",
	});
	await db.insert(team).values({
		id: ids.team,
		workspaceId: ids.workspace,
		name: "Notification Team",
		key: `N${ids.team.slice(0, 3)}`,
		privacy: "public",
	});
	await db.insert(teamCycleSettings).values({
		teamId: ids.team,
		cadenceEnabled: true,
		cadenceDays: 14,
		anchorDate: new Date("2026-07-01T10:00:00.000Z"),
		planningHorizon: 2,
		endBehavior: "confirmation_required",
		gracePeriodMinutes: 0,
		defaultRolloverPolicy: "carry_over",
		reminderLeadMinutes: 60,
	});
	await db.insert(cycle).values({
		id: ids.cycle,
		workspaceId: ids.workspace,
		teamId: ids.team,
		name: "Current scheduled cycle",
		sequence: 1,
		state: "planned",
		origin: "scheduled",
		scheduledBoundary: boundary,
		startDate: new Date("2026-07-18T10:00:00.000Z"),
		endDate: boundary,
	});
});

describe("durable notification events", () => {
	test("creates both end behaviors with a persisted settings revision", async () => {
		const { enqueueNotificationJobs } = await import("./notifications");
		const result = await enqueueNotificationJobs({ clock });
		expect(result.enqueued).toBe(2);
		const rows = await db
			.select()
			.from(cycleScheduleJob)
			.where(eq(cycleScheduleJob.cycleId, ids.cycle));
		expect(rows).toHaveLength(2);
		expect(rows.every((row) => row.eventRevisionAt !== null)).toBeTrue();
		expect(new Set(rows.map((row) => row.jobType))).toEqual(
			new Set(["send_cycle_reminder", "create_cycle_confirmation_required"]),
		);
	});

	test("enqueues reminders for automatic and reminder-only end behavior", async () => {
		const { enqueueNotificationJobs } = await import("./notifications");
		await db
			.update(teamCycleSettings)
			.set({ endBehavior: "automatic" })
			.where(eq(teamCycleSettings.teamId, ids.team));
		await enqueueNotificationJobs({ clock });
		let rows = await db
			.select()
			.from(cycleScheduleJob)
			.where(eq(cycleScheduleJob.cycleId, ids.cycle));
		expect(
			rows.filter((row) => row.jobType === "send_cycle_reminder"),
		).toHaveLength(1);
		expect(
			rows.filter(
				(row) => row.jobType === "create_cycle_confirmation_required",
			),
		).toHaveLength(0);
		await db
			.update(teamCycleSettings)
			.set({ endBehavior: "reminder_only" })
			.where(eq(teamCycleSettings.teamId, ids.team));
		await enqueueNotificationJobs({ clock });
		rows = await db
			.select()
			.from(cycleScheduleJob)
			.where(eq(cycleScheduleJob.cycleId, ids.cycle));
		expect(
			new Set(rows.map((row) => row.eventRevisionAt?.getTime())).size,
		).toBe(2);
		const latestRevision = Math.max(
			...rows.map((row) => row.eventRevisionAt?.getTime() ?? 0),
		);
		expect(
			rows
				.filter((row) => row.eventRevisionAt?.getTime() === latestRevision)
				.every((row) => row.jobType === "send_cycle_reminder"),
		).toBeTrue();
	});

	test("does not enqueue canceled or completed scheduled cycles", async () => {
		const { enqueueNotificationJobs } = await import("./notifications");
		await db
			.update(cycle)
			.set({ state: "completed" })
			.where(eq(cycle.id, ids.cycle));
		const result = await enqueueNotificationJobs({ clock });
		expect(result.enqueued).toBe(0);
		expect(await db.select().from(cycleScheduleJob)).toHaveLength(0);
	});

	test("schema constraints reject orphaned and invalid terminal artifacts", async () => {
		const badAction = {
			id: createId(),
			workspaceId: createId(),
			teamId: ids.team,
			cycleId: ids.cycle,
			kind: "completion_confirmation" as const,
			scheduledBoundary: boundary,
			eventRevisionAt: new Date(),
			dueAt: boundary,
		};
		await expect(
			db.insert(cycleActionRequired).values(badAction),
		).rejects.toThrow();
		await expect(
			db.insert(cycleActionRequired).values({
				...badAction,
				workspaceId: ids.workspace,
				status: "canceled",
			}),
		).rejects.toThrow();
		await expect(
			db.insert(cycleNotification).values({
				id: createId(),
				workspaceId: ids.workspace,
				teamId: ids.team,
				cycleId: ids.cycle,
				recipientUserId: createId(),
				kind: "end_reminder",
				scheduledBoundary: boundary,
				eventRevisionAt: new Date(),
				deliverAt: boundary,
				cycleName: "Current scheduled cycle",
				teamName: "Notification Team",
			}),
		).rejects.toThrow();
	});

	test("settings revision replacement retains old audit rows", async () => {
		const { cancelCycleArtifacts, enqueueNotificationJobs } = await import(
			"./notifications"
		);
		await enqueueNotificationJobs({ clock });
		const [before] = await db.select().from(teamCycleSettings);
		if (!before) throw new Error("settings missing");
		await db
			.update(teamCycleSettings)
			.set({
				reminderLeadMinutes: 30,
				updatedAt: new Date("2026-07-15T11:00:00Z"),
			})
			.where(eq(teamCycleSettings.teamId, ids.team));
		await db.transaction((tx) =>
			cancelCycleArtifacts(tx, {
				workspaceId: ids.workspace,
				teamId: ids.team,
				cycleId: ids.cycle,
				reason: "settings_changed",
			}),
		);
		await enqueueNotificationJobs({ clock });
		const rows = await db
			.select()
			.from(cycleScheduleJob)
			.where(eq(cycleScheduleJob.cycleId, ids.cycle));
		expect(rows).toHaveLength(4);
		expect(
			rows.filter((row) => row.outcome === "obsolete_settings"),
		).toHaveLength(2);
		expect(
			new Set(rows.map((row) => row.eventRevisionAt?.getTime())).size,
		).toBe(2);
	});

	test("a due event with no current eligible recipients is terminal and private", async () => {
		const { enqueueNotificationJobs, processNotificationJob } = await import(
			"./notifications"
		);
		await enqueueNotificationJobs({ clock });
		const [job] = await db
			.select()
			.from(cycleScheduleJob)
			.where(
				and(
					eq(cycleScheduleJob.cycleId, ids.cycle),
					eq(cycleScheduleJob.jobType, "send_cycle_reminder"),
				),
			);
		if (!job || !job.eventRevisionAt) throw new Error("event missing");
		const result = await processNotificationJob({
			job: {
				...job,
				jobType: "send_cycle_reminder",
				cycleId: ids.cycle,
			},
		});
		expect(result).toBe("no_recipients");
	});
});
