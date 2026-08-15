import { describe, expect, test } from "bun:test";
import { getTableConfig } from "drizzle-orm/pg-core";
import {
	cycleScheduleJob,
	cycleScheduleJobStatusEnum,
	cycleScheduleJobTypeEnum,
} from "./cycle-schedule-jobs.schema";

describe("cycle schedule job schema", () => {
	test("includes scheduled lifecycle event types and business blocking", () => {
		expect(cycleScheduleJobTypeEnum.enumValues).toEqual([
			"generate_planned_cycles",
			"send_cycle_reminder",
			"create_cycle_confirmation_required",
			"start_scheduled_cycle",
			"complete_scheduled_cycle",
		]);
		expect(cycleScheduleJobStatusEnum.enumValues).toEqual([
			"queued",
			"started",
			"blocked",
			"succeeded",
			"failed",
		]);
	});

	test("retains the per-cycle event identity and validates blocked state", () => {
		const config = getTableConfig(cycleScheduleJob);
		const eventIdentity = config.indexes.find(
			(index) => index.config.name === "cycle_schedule_job_event_identity_key",
		);
		expect(eventIdentity?.config.unique).toBe(true);
		expect(
			eventIdentity?.config.columns.map((column) =>
				"name" in column ? column.name : null,
			),
		).toEqual([
			"cycle_id",
			"job_type",
			"scheduled_boundary",
			"event_revision_at",
		]);
		expect(config.checks.map((check) => check.name)).toContain(
			"cycle_schedule_job_blocked_state_check",
		);
	});
});
