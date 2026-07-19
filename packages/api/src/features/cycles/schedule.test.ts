import { describe, expect, test } from "bun:test";
import {
	deriveSchedulePreview,
	InvalidWorkspaceTimezoneError,
	type ScheduleSettings,
} from "./schedule";

function settings(overrides: Partial<ScheduleSettings> = {}): ScheduleSettings {
	return {
		cadenceEnabled: true,
		cadenceDays: 7,
		anchorDate: new Date("2026-07-01T10:00:00.000Z"),
		endBehavior: "automatic",
		gracePeriodMinutes: 1440,
		reminderLeadMinutes: 1440,
		...overrides,
	};
}

function preview({
	workspaceTimezone = "UTC",
	settings: scheduleSettings = settings(),
	now = new Date("2026-07-15T10:00:00.000Z"),
}: {
	workspaceTimezone?: string;
	settings?: ScheduleSettings;
	now?: Date;
} = {}) {
	return deriveSchedulePreview({
		workspaceTimezone,
		settings: scheduleSettings,
		now,
	});
}

describe("deriveSchedulePreview", () => {
	test("describes disabled and missing-anchor schedules without inventing boundaries", () => {
		expect(
			preview({
				settings: settings({ cadenceEnabled: false, anchorDate: null }),
			}),
		).toMatchObject({
			status: "disabled",
			automationAvailable: false,
			anchorDate: null,
			currentOrDueBoundary: null,
			nextFutureBoundary: null,
			nextCycleEnd: null,
			actionTiming: null,
		});
		expect(preview({ settings: settings({ anchorDate: null }) })).toMatchObject(
			{
				status: "anchor_required",
				automationAvailable: false,
				currentOrDueBoundary: null,
				nextFutureBoundary: null,
			},
		);
	});

	test("uses UTC calendar cadence and includes an exact boundary as current or due", () => {
		const result = preview();
		expect(result).toMatchObject({
			status: "ready",
			workspaceTimezone: "UTC",
			cadenceDays: 7,
			currentOrDueBoundary: {
				utcIso: "2026-07-15T10:00:00Z",
				localDateTime: "2026-07-15T10:00:00",
				offset: "+00:00",
			},
			nextFutureBoundary: {
				utcIso: "2026-07-22T10:00:00Z",
			},
			nextCycleEnd: {
				utcIso: "2026-07-29T10:00:00Z",
			},
			actionTiming: {
				endBehavior: "automatic",
				automaticCompletionDue: { utcIso: "2026-07-30T10:00:00Z" },
				managerConfirmationRequiredAt: null,
				reminderCandidateAt: { utcIso: "2026-07-28T10:00:00Z" },
			},
		});
	});

	test("keeps the first anchor as the next boundary before it is due and advances after it", () => {
		const before = preview({ now: new Date("2026-07-01T09:59:59.000Z") });
		expect(before.currentOrDueBoundary).toBeNull();
		expect(before.nextFutureBoundary?.utcIso).toBe("2026-07-01T10:00:00Z");

		const after = preview({ now: new Date("2026-07-01T10:00:01.000Z") });
		expect(after.currentOrDueBoundary?.utcIso).toBe("2026-07-01T10:00:00Z");
		expect(after.nextFutureBoundary?.utcIso).toBe("2026-07-08T10:00:00Z");
	});

	test("preserves local wall-clock anchors in positive and negative offset workspaces", () => {
		const kolkata = preview({
			workspaceTimezone: "Asia/Kolkata",
			settings: settings({
				anchorDate: new Date("2026-07-01T04:30:00.000Z"),
			}),
			now: new Date("2026-07-08T04:30:00.000Z"),
		});
		expect(kolkata.currentOrDueBoundary).toEqual({
			utcIso: "2026-07-08T04:30:00Z",
			localDateTime: "2026-07-08T10:00:00",
			offset: "+05:30",
		});

		const newYork = preview({
			workspaceTimezone: "America/New_York",
			settings: settings({
				anchorDate: new Date("2026-01-01T15:00:00.000Z"),
			}),
			now: new Date("2026-01-08T15:00:00.000Z"),
		});
		expect(newYork.currentOrDueBoundary).toEqual({
			utcIso: "2026-01-08T15:00:00Z",
			localDateTime: "2026-01-08T10:00:00",
			offset: "-05:00",
		});
	});

	test("derives cycle ends and action timing from the anchor after a DST gap", () => {
		const result = preview({
			workspaceTimezone: "America/New_York",
			settings: settings({
				cadenceDays: 7,
				anchorDate: new Date("2026-03-01T07:30:00.000Z"),
			}),
			now: new Date("2026-03-07T12:00:00.000Z"),
		});
		expect(result.nextFutureBoundary).toEqual({
			utcIso: "2026-03-08T07:30:00Z",
			localDateTime: "2026-03-08T03:30:00",
			offset: "-04:00",
		});
		expect(result.nextCycleEnd).toEqual({
			utcIso: "2026-03-15T06:30:00Z",
			localDateTime: "2026-03-15T02:30:00",
			offset: "-04:00",
		});
		expect(result.actionTiming).toMatchObject({
			automaticCompletionDue: { utcIso: "2026-03-16T06:30:00Z" },
			reminderCandidateAt: { utcIso: "2026-03-14T06:30:00Z" },
		});
	});

	test("uses Temporal-compatible gap and fold disambiguation", () => {
		const springForward = preview({
			workspaceTimezone: "America/New_York",
			settings: settings({
				cadenceDays: 1,
				anchorDate: new Date("2026-03-07T07:30:00.000Z"),
			}),
			now: new Date("2026-03-08T08:00:00.000Z"),
		});
		expect(springForward.currentOrDueBoundary).toEqual({
			utcIso: "2026-03-08T07:30:00Z",
			localDateTime: "2026-03-08T03:30:00",
			offset: "-04:00",
		});

		const fallBack = preview({
			workspaceTimezone: "America/New_York",
			settings: settings({
				cadenceDays: 1,
				anchorDate: new Date("2026-10-31T05:30:00.000Z"),
			}),
			now: new Date("2026-11-01T06:00:00.000Z"),
		});
		expect(fallBack.currentOrDueBoundary).toEqual({
			utcIso: "2026-11-01T05:30:00Z",
			localDateTime: "2026-11-01T01:30:00",
			offset: "-04:00",
		});
	});

	test("describes grace, confirmation, and reminder timing without implying mutations", () => {
		const immediate = preview({
			settings: settings({ gracePeriodMinutes: 0, reminderLeadMinutes: 60 }),
		});
		expect(immediate.actionTiming).toMatchObject({
			automaticCompletionDue: { utcIso: "2026-07-29T10:00:00Z" },
			managerConfirmationRequiredAt: null,
			reminderCandidateAt: { utcIso: "2026-07-29T09:00:00Z" },
		});

		const confirmation = preview({
			settings: settings({ endBehavior: "confirmation_required" }),
		});
		expect(confirmation.actionTiming).toMatchObject({
			automaticCompletionDue: null,
			managerConfirmationRequiredAt: { utcIso: "2026-07-29T10:00:00Z" },
			reminderCandidateAt: { utcIso: "2026-07-28T10:00:00Z" },
		});

		const reminderOnly = preview({
			settings: settings({ endBehavior: "reminder_only" }),
		});
		expect(reminderOnly.actionTiming).toMatchObject({
			automaticCompletionDue: null,
			managerConfirmationRequiredAt: null,
			reminderCandidateAt: { utcIso: "2026-07-28T10:00:00Z" },
		});
	});

	test("rejects invalid persisted timezones and is deterministic for an injected clock", () => {
		expect(() => preview({ workspaceTimezone: "Invalid/Timezone" })).toThrow(
			InvalidWorkspaceTimezoneError,
		);
		const input = {
			workspaceTimezone: "UTC",
			settings: settings(),
			now: new Date("2026-07-15T10:00:00.000Z"),
		};
		expect(deriveSchedulePreview(input)).toEqual(deriveSchedulePreview(input));
	});
});
