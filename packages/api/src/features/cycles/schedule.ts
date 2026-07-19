import { isValidIanaTimezone } from "../../lib/timezone";
import { Temporal } from "./temporal";

export type ScheduleStatus = "disabled" | "anchor_required" | "ready";

export type ScheduleBoundary = {
	utcIso: string;
	localDateTime: string;
	offset: string;
};

export type ScheduleSettings = {
	cadenceEnabled: boolean;
	cadenceDays: number;
	anchorDate: Date | null;
	endBehavior: "automatic" | "confirmation_required" | "reminder_only";
	gracePeriodMinutes: number;
	reminderLeadMinutes: number;
};

export type ScheduleActionTiming = {
	endBehavior: ScheduleSettings["endBehavior"];
	automaticCompletionDue: ScheduleBoundary | null;
	managerConfirmationRequiredAt: ScheduleBoundary | null;
	reminderCandidateAt: ScheduleBoundary;
};

export type SchedulePreview = {
	status: ScheduleStatus;
	automationAvailable: false;
	workspaceTimezone: string;
	cadenceDays: number;
	anchorDate: string | null;
	currentOrDueBoundary: ScheduleBoundary | null;
	nextFutureBoundary: ScheduleBoundary | null;
	nextCycleEnd: ScheduleBoundary | null;
	actionTiming: ScheduleActionTiming | null;
};

export class InvalidWorkspaceTimezoneError extends Error {
	constructor(timezone: string) {
		super(`Invalid workspace timezone: ${timezone}`);
		this.name = "InvalidWorkspaceTimezoneError";
	}
}

function toBoundary(value: Temporal.ZonedDateTime): ScheduleBoundary {
	return {
		utcIso: value.toInstant().toString(),
		localDateTime: value.toPlainDateTime().toString(),
		offset: value.offset,
	};
}

function addCalendarDays(
	value: Temporal.ZonedDateTime,
	days: number,
): Temporal.ZonedDateTime {
	return value
		.toPlainDateTime()
		.add({ days })
		.toZonedDateTime(value.timeZoneId, { disambiguation: "compatible" });
}

function addMinutes(
	value: Temporal.ZonedDateTime,
	minutes: number,
): Temporal.ZonedDateTime {
	return value.add({ minutes });
}

function buildUnavailablePreview({
	status,
	workspaceTimezone,
	settings,
}: {
	status: Exclude<ScheduleStatus, "ready">;
	workspaceTimezone: string;
	settings: ScheduleSettings;
}): SchedulePreview {
	return {
		status,
		automationAvailable: false,
		workspaceTimezone,
		cadenceDays: settings.cadenceDays,
		anchorDate: settings.anchorDate?.toISOString() ?? null,
		currentOrDueBoundary: null,
		nextFutureBoundary: null,
		nextCycleEnd: null,
		actionTiming: null,
	};
}

function getCurrentBoundaryIndex({
	anchor,
	now,
	cadenceDays,
}: {
	anchor: Temporal.ZonedDateTime;
	now: Temporal.ZonedDateTime;
	cadenceDays: number;
}): number | null {
	const calendarDays = anchor
		.toPlainDate()
		.until(now.toPlainDate(), { largestUnit: "days" }).days;
	let index = Math.floor(calendarDays / cadenceDays);
	if (index < 0) return null;

	let boundary = addCalendarDays(anchor, index * cadenceDays);
	if (Temporal.ZonedDateTime.compare(boundary, now) > 0) {
		index -= 1;
		if (index < 0) return null;
		boundary = addCalendarDays(anchor, index * cadenceDays);
	}

	return Temporal.ZonedDateTime.compare(boundary, now) <= 0 ? index : null;
}

function getActionTiming({
	end,
	settings,
}: {
	end: Temporal.ZonedDateTime;
	settings: ScheduleSettings;
}): ScheduleActionTiming {
	const automaticCompletionDue =
		settings.endBehavior === "automatic"
			? addMinutes(end, settings.gracePeriodMinutes)
			: null;
	const managerConfirmationRequiredAt =
		settings.endBehavior === "confirmation_required" ? end : null;
	const reminderCandidateAt = addMinutes(end, -settings.reminderLeadMinutes);

	return {
		endBehavior: settings.endBehavior,
		automaticCompletionDue: automaticCompletionDue
			? toBoundary(automaticCompletionDue)
			: null,
		managerConfirmationRequiredAt: managerConfirmationRequiredAt
			? toBoundary(managerConfirmationRequiredAt)
			: null,
		reminderCandidateAt: toBoundary(reminderCandidateAt),
	};
}

export function deriveSchedulePreview({
	workspaceTimezone,
	settings,
	now,
}: {
	workspaceTimezone: string;
	settings: ScheduleSettings;
	now: Date;
}): SchedulePreview {
	if (!isValidIanaTimezone(workspaceTimezone)) {
		throw new InvalidWorkspaceTimezoneError(workspaceTimezone);
	}
	if (!settings.cadenceEnabled) {
		return buildUnavailablePreview({
			status: "disabled",
			workspaceTimezone,
			settings,
		});
	}
	if (!settings.anchorDate) {
		return buildUnavailablePreview({
			status: "anchor_required",
			workspaceTimezone,
			settings,
		});
	}

	const anchor = Temporal.Instant.from(
		settings.anchorDate.toISOString(),
	).toZonedDateTimeISO(workspaceTimezone);
	const currentNow = Temporal.Instant.from(
		now.toISOString(),
	).toZonedDateTimeISO(workspaceTimezone);
	const currentBoundaryIndex = getCurrentBoundaryIndex({
		anchor,
		now: currentNow,
		cadenceDays: settings.cadenceDays,
	});
	const nextBoundaryIndex = (currentBoundaryIndex ?? -1) + 1;
	const nextBoundary = addCalendarDays(
		anchor,
		nextBoundaryIndex * settings.cadenceDays,
	);
	const nextCycleEnd = addCalendarDays(
		anchor,
		(nextBoundaryIndex + 1) * settings.cadenceDays,
	);

	return {
		status: "ready",
		automationAvailable: false,
		workspaceTimezone,
		cadenceDays: settings.cadenceDays,
		anchorDate: settings.anchorDate.toISOString(),
		currentOrDueBoundary:
			currentBoundaryIndex === null
				? null
				: toBoundary(
						addCalendarDays(
							anchor,
							currentBoundaryIndex * settings.cadenceDays,
						),
					),
		nextFutureBoundary: toBoundary(nextBoundary),
		nextCycleEnd: toBoundary(nextCycleEnd),
		actionTiming: getActionTiming({ end: nextCycleEnd, settings }),
	};
}
