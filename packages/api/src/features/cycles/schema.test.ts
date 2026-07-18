import { describe, expect, test } from "bun:test";
import {
	cycleCompleteSchema,
	cycleGetSettingsSchema,
	cycleSettingsValueSchema,
	cycleUpdateSettingsSchema,
} from "./schema";

const workspaceId = "abcdefghijklmnopqrstuv";
const cycleId = "bcdefghijklmnopqrstuvw";
const targetCycleId = "cdefghijklmnopqrstuvwx";
const teamId = "defghijklmnopqrstuvwxy";

const disabledSettings = {
	cadenceEnabled: false,
	cadenceDays: 14,
	anchorDate: null,
	planningHorizon: 2,
	endBehavior: "automatic",
	gracePeriodMinutes: 1440,
	defaultRolloverPolicy: "carry_over",
	reminderLeadMinutes: 1440,
} as const;

describe("cycleCompleteSchema", () => {
	test("accepts an explicit carry-over target", () => {
		expect(
			cycleCompleteSchema.parse({
				workspaceId,
				cycleId,
				disposition: { type: "carryOver", targetCycleId },
			}),
		).toEqual({
			workspaceId,
			cycleId,
			disposition: { type: "carryOver", targetCycleId },
		});
	});

	test("accepts moving eligible work to backlog without a target", () => {
		expect(
			cycleCompleteSchema.parse({
				workspaceId,
				cycleId,
				disposition: { type: "moveToBacklog" },
			}),
		).toEqual({
			workspaceId,
			cycleId,
			disposition: { type: "moveToBacklog" },
		});
	});

	test("rejects implicit carry-over and unknown dispositions", () => {
		expect(
			cycleCompleteSchema.safeParse({
				workspaceId,
				cycleId,
				disposition: { type: "carryOver" },
			}).success,
		).toBeFalse();
		expect(
			cycleCompleteSchema.safeParse({
				workspaceId,
				cycleId,
				disposition: { type: "keep" },
			}).success,
		).toBeFalse();
	});
});

describe("cycle settings schemas", () => {
	test("accepts a complete disabled settings replacement", () => {
		expect(cycleSettingsValueSchema.parse(disabledSettings)).toEqual(
			disabledSettings,
		);
		expect(
			cycleUpdateSettingsSchema.parse({
				workspaceId,
				teamId,
				...disabledSettings,
			}),
		).toMatchObject({ workspaceId, teamId, ...disabledSettings });
	});

	test("requires an anchor before cadence can be enabled", () => {
		expect(
			cycleSettingsValueSchema.safeParse({
				...disabledSettings,
				cadenceEnabled: true,
			}).success,
		).toBeFalse();
		expect(
			cycleSettingsValueSchema.safeParse({
				...disabledSettings,
				cadenceEnabled: true,
				anchorDate: "2026-01-01T00:00:00.000Z",
			}).success,
		).toBeTrue();
	});

	test("rejects invalid ranges, enum values, dates, and server-owned fields", () => {
		for (const value of [
			{ ...disabledSettings, cadenceDays: 0 },
			{ ...disabledSettings, cadenceDays: -1 },
			{ ...disabledSettings, cadenceDays: 1.5 },
			{ ...disabledSettings, planningHorizon: 0 },
			{ ...disabledSettings, planningHorizon: 13 },
			{ ...disabledSettings, planningHorizon: 1.5 },
			{ ...disabledSettings, gracePeriodMinutes: -1 },
			{ ...disabledSettings, gracePeriodMinutes: 1.5 },
			{ ...disabledSettings, reminderLeadMinutes: -1 },
			{ ...disabledSettings, reminderLeadMinutes: 1.5 },
			{ ...disabledSettings, endBehavior: "later" },
			{ ...disabledSettings, defaultRolloverPolicy: "later" },
			{ ...disabledSettings, anchorDate: "not-a-date" },
			{ ...disabledSettings, teamId },
			{ ...disabledSettings, updatedBy: "spoofed" },
			{ ...disabledSettings, createdAt: "2026-01-01T00:00:00.000Z" },
			{ ...disabledSettings, updatedAt: "2026-01-01T00:00:00.000Z" },
			{ ...disabledSettings, workspaceTimezone: "UTC" },
		]) {
			expect(cycleSettingsValueSchema.safeParse(value).success).toBeFalse();
		}
		expect(
			cycleGetSettingsSchema.safeParse({
				workspaceId,
				teamId,
				updatedAt: "2026-01-01T00:00:00.000Z",
			}).success,
		).toBeFalse();
	});
});
