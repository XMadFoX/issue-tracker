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
let teamCycleSettings: typeof import("db/features/tracker/team-cycle-settings.schema").teamCycleSettings;
let team: typeof import("db/features/tracker/tracker.schema").team;
let workspace: typeof import("db/features/tracker/tracker.schema").workspace;
let teardown: Awaited<ReturnType<typeof setupDb>>;

const ids = {
	workspace: createId(),
	team: createId(),
};
const now = new Date("2026-07-15T10:00:00.000Z");

beforeAll(async () => {
	teardown = await setupDb();
	({ db } = await import("db"));
	({ cycle } = await import("db/features/tracker/cycles.schema"));
	({ teamCycleSettings } = await import(
		"db/features/tracker/team-cycle-settings.schema"
	));
	({ team, workspace } = await import("db/features/tracker/tracker.schema"));
}, 30_000);

afterAll(async () => {
	if (teardown) await teardown();
}, 30_000);

beforeEach(async () => {
	await db.execute(sql`truncate table team, workspace cascade`);
	await db.insert(workspace).values({
		id: ids.workspace,
		name: "Generation Workspace",
		slug: "generation-workspace",
		timezone: "UTC",
	});
	await db.insert(team).values({
		id: ids.team,
		workspaceId: ids.workspace,
		name: "Generation Team",
		key: "GEN",
		privacy: "public",
	});
	await db.insert(teamCycleSettings).values({
		teamId: ids.team,
		cadenceEnabled: true,
		cadenceDays: 7,
		anchorDate: new Date("2026-07-01T10:00:00.000Z"),
		planningHorizon: 2,
		endBehavior: "automatic",
		gracePeriodMinutes: 0,
		defaultRolloverPolicy: "carry_over",
		reminderLeadMinutes: 60,
		updatedBy: null,
	});
});

async function maintain() {
	const { maintainPlannedCycleHorizon } = await import("./generation");
	return await maintainPlannedCycleHorizon({
		workspaceId: ids.workspace,
		teamId: ids.team,
		now,
	});
}

async function scheduledCycles() {
	return await db
		.select()
		.from(cycle)
		.where(
			and(
				eq(cycle.workspaceId, ids.workspace),
				eq(cycle.teamId, ids.team),
				eq(cycle.origin, "scheduled"),
			),
		)
		.orderBy(cycle.sequence);
}

describe("maintainPlannedCycleHorizon", () => {
	test("returns inert outcomes without writing cycles", async () => {
		await db
			.update(teamCycleSettings)
			.set({ cadenceEnabled: false })
			.where(eq(teamCycleSettings.teamId, ids.team));
		expect(await maintain()).toEqual({ status: "disabled" });

		await db
			.update(teamCycleSettings)
			.set({ cadenceEnabled: true, anchorDate: null })
			.where(eq(teamCycleSettings.teamId, ids.team));
		expect(await maintain()).toEqual({ status: "anchor_required" });
		expect(await scheduledCycles()).toHaveLength(0);
	});

	test("maintains the planned horizon idempotently with scheduled provenance", async () => {
		const first = await maintain();
		expect(first.status).toBe("created");
		const rows = await scheduledCycles();
		expect(rows).toHaveLength(2);
		expect(rows.map((row) => row.name)).toEqual(["Cycle 1", "Cycle 2"]);
		expect(rows.map((row) => row.origin)).toEqual(["scheduled", "scheduled"]);
		expect(rows.map((row) => row.scheduledBoundary?.toISOString())).toEqual([
			"2026-07-15T10:00:00.000Z",
			"2026-07-22T10:00:00.000Z",
		]);
		expect(rows.map((row) => row.endDate.toISOString())).toEqual([
			"2026-07-22T10:00:00.000Z",
			"2026-07-29T10:00:00.000Z",
		]);
		const [firstCycle] = rows;
		if (!firstCycle?.scheduledBoundary) {
			throw new Error("expected a scheduled boundary");
		}
		let duplicateRejected = false;
		try {
			await db.insert(cycle).values({
				id: createId(),
				workspaceId: ids.workspace,
				teamId: ids.team,
				name: "Duplicate boundary",
				sequence: 99,
				startDate: firstCycle.startDate,
				endDate: firstCycle.endDate,
				origin: "scheduled",
				scheduledBoundary: firstCycle.scheduledBoundary,
			});
		} catch {
			duplicateRejected = true;
		}
		expect(duplicateRejected).toBeTrue();

		expect((await maintain()).status).toBe("already_satisfied");
		expect(await scheduledCycles()).toHaveLength(2);
	});

	test("returns a manual conflict without partially creating a horizon", async () => {
		await db.insert(cycle).values({
			id: createId(),
			workspaceId: ids.workspace,
			teamId: ids.team,
			name: "Manual overlap",
			sequence: 1,
			startDate: new Date("2026-07-15T10:00:00.000Z"),
			endDate: new Date("2026-07-22T10:00:00.000Z"),
		});
		const [manualCycle] = await db
			.select()
			.from(cycle)
			.where(eq(cycle.teamId, ids.team));
		expect(manualCycle?.origin).toBe("manual");
		expect(manualCycle?.scheduledBoundary).toBeNull();
		const result = await maintain();
		expect(result.status).toBe("manual_cycle_conflict");
		expect(await scheduledCycles()).toHaveLength(0);
	});

	test("preserves edited and canceled scheduled boundaries while maintaining future coverage", async () => {
		await maintain();
		const [first, second] = await scheduledCycles();
		if (!first || !second) throw new Error("expected seeded scheduled cycles");
		await db
			.update(cycle)
			.set({
				name: "Edited by manager",
				startDate: new Date("2026-07-14T10:00:00.000Z"),
				endDate: new Date("2026-07-21T10:00:00.000Z"),
			})
			.where(eq(cycle.id, first.id));
		expect((await maintain()).status).toBe("already_satisfied");
		const [edited] = await scheduledCycles();
		expect(edited?.name).toBe("Edited by manager");

		await db
			.update(cycle)
			.set({ state: "canceled" })
			.where(eq(cycle.id, second.id));
		expect((await maintain()).status).toBe("created");
		const rows = await scheduledCycles();
		expect(rows).toHaveLength(3);
		expect(rows.map((row) => row.scheduledBoundary?.toISOString())).toContain(
			"2026-07-29T10:00:00.000Z",
		);
		expect(
			rows.filter(
				(row) =>
					row.scheduledBoundary?.toISOString() === "2026-07-22T10:00:00.000Z",
			),
		).toHaveLength(1);
	});

	test("uses current cadence, anchor, and timezone without counting old provenance", async () => {
		await maintain();
		const oldRows = await scheduledCycles();
		const oldSnapshots = oldRows.map((row) => ({
			id: row.id,
			name: row.name,
			sequence: row.sequence,
			startDate: row.startDate,
			endDate: row.endDate,
			state: row.state,
			origin: row.origin,
			scheduledBoundary: row.scheduledBoundary,
		}));
		await db
			.update(workspace)
			.set({ timezone: "America/New_York" })
			.where(eq(workspace.id, ids.workspace));
		await db
			.update(teamCycleSettings)
			.set({
				cadenceDays: 3,
				anchorDate: new Date("2026-08-01T14:00:00.000Z"),
			})
			.where(eq(teamCycleSettings.teamId, ids.team));
		const { maintainPlannedCycleHorizon } = await import("./generation");
		const result = await maintainPlannedCycleHorizon({
			workspaceId: ids.workspace,
			teamId: ids.team,
			now: new Date("2026-08-01T14:00:00.000Z"),
		});
		expect(result.status).toBe("created");
		const rows = await scheduledCycles();
		expect(rows).toHaveLength(4);
		expect(
			rows.slice(0, 2).map((row) => ({
				id: row.id,
				name: row.name,
				sequence: row.sequence,
				startDate: row.startDate,
				endDate: row.endDate,
				state: row.state,
				origin: row.origin,
				scheduledBoundary: row.scheduledBoundary,
			})),
		).toEqual(oldSnapshots);
		expect(
			rows.slice(2).map((row) => row.scheduledBoundary?.toISOString()),
		).toEqual(["2026-08-01T14:00:00.000Z", "2026-08-04T14:00:00.000Z"]);
		expect(
			result.status === "created" ? result.scheduledBoundaries : [],
		).toEqual([
			new Date("2026-08-01T14:00:00.000Z"),
			new Date("2026-08-04T14:00:00.000Z"),
		]);
	});

	test("reports an overlapping old identity without writing after settings change", async () => {
		await maintain();
		const [oldRow] = await scheduledCycles();
		if (!oldRow) throw new Error("expected an old scheduled cycle");
		await db
			.update(workspace)
			.set({ timezone: "America/New_York" })
			.where(eq(workspace.id, ids.workspace));
		await db
			.update(teamCycleSettings)
			.set({
				cadenceDays: 3,
				anchorDate: new Date("2026-08-01T14:00:00.000Z"),
			})
			.where(eq(teamCycleSettings.teamId, ids.team));
		await db
			.update(cycle)
			.set({
				startDate: new Date("2026-08-01T14:00:00.000Z"),
				endDate: new Date("2026-08-04T14:00:00.000Z"),
			})
			.where(eq(cycle.id, oldRow.id));
		const before = await scheduledCycles();
		const { maintainPlannedCycleHorizon } = await import("./generation");
		const result = await maintainPlannedCycleHorizon({
			workspaceId: ids.workspace,
			teamId: ids.team,
			now: new Date("2026-08-01T14:00:00.000Z"),
		});
		expect(result).toEqual({
			status: "scheduled_cycle_conflict",
			cycleId: oldRow.id,
			scheduledBoundary: new Date("2026-08-01T14:00:00.000Z"),
		});
		expect(await scheduledCycles()).toEqual(before);
	});

	test("rolls back earlier candidates when a later manual conflict blocks the horizon", async () => {
		await db.insert(cycle).values({
			id: createId(),
			workspaceId: ids.workspace,
			teamId: ids.team,
			name: "Later manual conflict",
			sequence: 1,
			startDate: new Date("2026-07-22T10:00:00.000Z"),
			endDate: new Date("2026-07-29T10:00:00.000Z"),
		});
		expect((await maintain()).status).toBe("manual_cycle_conflict");
		expect(await scheduledCycles()).toHaveLength(0);
		await db
			.update(cycle)
			.set({ state: "canceled" })
			.where(eq(cycle.teamId, ids.team));
		expect((await maintain()).status).toBe("created");
		const firstRetryRows = await scheduledCycles();
		expect(firstRetryRows).toHaveLength(2);
		expect(
			firstRetryRows.map((row) => row.scheduledBoundary?.toISOString()),
		).toEqual(["2026-07-15T10:00:00.000Z", "2026-07-22T10:00:00.000Z"]);
		const firstRetryIdentities = firstRetryRows.map((row) => ({
			id: row.id,
			boundary: row.scheduledBoundary?.toISOString(),
		}));
		const rowCount = firstRetryRows.length;
		const secondRetry = await maintain();
		expect(secondRetry.status).toBe("already_satisfied");
		expect(
			secondRetry.status === "already_satisfied"
				? secondRetry.scheduledBoundaries.map((boundary) =>
						boundary.toISOString(),
					)
				: [],
		).toEqual(["2026-07-15T10:00:00.000Z", "2026-07-22T10:00:00.000Z"]);
		const secondRetryRows = await scheduledCycles();
		expect(secondRetryRows).toHaveLength(rowCount);
		expect(
			secondRetryRows.map((row) => ({
				id: row.id,
				boundary: row.scheduledBoundary?.toISOString(),
			})),
		).toEqual(firstRetryIdentities);
	});

	test("continues past more than one hundred canceled identities", async () => {
		await db
			.update(teamCycleSettings)
			.set({
				cadenceDays: 1,
				anchorDate: new Date("2026-07-01T10:00:00.000Z"),
			})
			.where(eq(teamCycleSettings.teamId, ids.team));
		await db.insert(cycle).values(
			Array.from({ length: 101 }, (_, index): typeof cycle.$inferInsert => {
				const boundary = new Date("2026-07-01T10:00:00.000Z");
				boundary.setUTCDate(boundary.getUTCDate() + index);
				const endDate = new Date(boundary);
				endDate.setUTCDate(endDate.getUTCDate() + 1);
				return {
					id: createId(),
					workspaceId: ids.workspace,
					teamId: ids.team,
					name: `Cycle ${index + 1}`,
					sequence: index + 1,
					startDate: boundary,
					endDate,
					state: "canceled",
					origin: "scheduled",
					scheduledBoundary: boundary,
				};
			}),
		);
		const { maintainPlannedCycleHorizon } = await import("./generation");
		const result = await maintainPlannedCycleHorizon({
			workspaceId: ids.workspace,
			teamId: ids.team,
			now: new Date("2026-07-01T10:00:00.000Z"),
		});
		expect(result.status).toBe("created");
		expect(
			(await scheduledCycles()).filter((row) => row.state === "planned"),
		).toHaveLength(2);
	});

	test("serializes manual creation with horizon maintenance", async () => {
		const { getNextCycleSequence, getOverlappingCycle, lockCycleTeam } =
			await import("./mutation");
		const manualCreate = db.transaction(async (tx) => {
			await lockCycleTeam({
				tx,
				workspaceId: ids.workspace,
				teamId: ids.team,
			});
			const startDate = new Date("2026-07-15T10:00:00.000Z");
			const endDate = new Date("2026-07-22T10:00:00.000Z");
			const overlap = await getOverlappingCycle({
				tx,
				workspaceId: ids.workspace,
				teamId: ids.team,
				startDate,
				endDate,
			});
			if (overlap) return "overlap";
			const sequence = await getNextCycleSequence({
				tx,
				workspaceId: ids.workspace,
				teamId: ids.team,
			});
			await tx.insert(cycle).values({
				id: createId(),
				workspaceId: ids.workspace,
				teamId: ids.team,
				name: `Cycle ${sequence}`,
				sequence,
				startDate,
				endDate,
			});
			return "created";
		});
		const [manualResult, generatedResult] = await Promise.all([
			manualCreate,
			maintain(),
		]);
		const rows = await db
			.select()
			.from(cycle)
			.where(eq(cycle.teamId, ids.team));
		expect(new Set(rows.map((row) => row.sequence)).size).toBe(rows.length);
		if (manualResult === "created") {
			expect(generatedResult.status).toBe("manual_cycle_conflict");
			expect(rows.map((row) => row.origin)).toEqual(["manual"]);
		} else {
			expect(generatedResult.status).toBe("created");
			expect(rows.map((row) => row.origin)).toEqual(["scheduled", "scheduled"]);
		}
	});

	test("preserves the earlier local fall DST fold through generation", async () => {
		await db
			.update(workspace)
			.set({ timezone: "America/New_York" })
			.where(eq(workspace.id, ids.workspace));
		await db
			.update(teamCycleSettings)
			.set({
				cadenceDays: 1,
				anchorDate: new Date("2026-10-31T05:30:00.000Z"),
			})
			.where(eq(teamCycleSettings.teamId, ids.team));
		const { maintainPlannedCycleHorizon } = await import("./generation");
		await maintainPlannedCycleHorizon({
			workspaceId: ids.workspace,
			teamId: ids.team,
			now: new Date("2026-11-01T06:00:00.000Z"),
		});
		expect((await scheduledCycles())[0]?.scheduledBoundary?.toISOString()).toBe(
			"2026-11-01T05:30:00.000Z",
		);
	});

	test("serializes concurrent retries and preserves the local DST calendar", async () => {
		await db
			.update(workspace)
			.set({ timezone: "America/New_York" })
			.where(eq(workspace.id, ids.workspace));
		await db
			.update(teamCycleSettings)
			.set({
				cadenceDays: 1,
				anchorDate: new Date("2026-03-07T07:30:00.000Z"),
			})
			.where(eq(teamCycleSettings.teamId, ids.team));
		const { maintainPlannedCycleHorizon } = await import("./generation");
		const input = {
			workspaceId: ids.workspace,
			teamId: ids.team,
			now: new Date("2026-03-08T08:00:00.000Z"),
		};
		await Promise.all([
			maintainPlannedCycleHorizon(input),
			maintainPlannedCycleHorizon(input),
		]);
		const rows = await scheduledCycles();
		expect(rows).toHaveLength(2);
		expect(rows[0]?.scheduledBoundary?.toISOString()).toBe(
			"2026-03-08T07:30:00.000Z",
		);
		expect(new Set(rows.map((row) => row.sequence)).size).toBe(2);
	});
});
