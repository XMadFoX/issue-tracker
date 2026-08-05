import { afterEach, describe, expect, test } from "bun:test";
import { cleanup, render, screen } from "@testing-library/react";
import type { CycleSchedulePreview } from "../cycle-settings";
import { CycleScheduleStatus } from "./cycle-schedule-status";

afterEach(cleanup);

const preview: CycleSchedulePreview = {
	status: "ready",
	automationAvailable: false,
	workspaceTimezone: "America/New_York",
	cadenceDays: 14,
	anchorDate: "2026-01-01T14:00:00.000Z",
	currentOrDueBoundary: null,
	nextFutureBoundary: {
		utcIso: "2026-01-15T14:00:00Z",
		localDateTime: "2026-01-15T09:00:00",
		offset: "-05:00",
	},
	nextCycleEnd: null,
	actionTiming: null,
};

describe("CycleScheduleStatus", () => {
	test("distinguishes paused policy preview from worker health", () => {
		render(<CycleScheduleStatus preview={preview} />);
		expect(screen.getByText("Automation paused")).toBeTruthy();
		expect(screen.getByText(/does not indicate worker health/i)).toBeTruthy();
		expect(screen.getByText("2026-01-15T09:00:00")).toBeTruthy();
	});

	test("renders anchor-required and retry states explicitly", () => {
		render(
			<CycleScheduleStatus
				preview={{
					...preview,
					status: "anchor_required",
					nextFutureBoundary: null,
				}}
			/>,
		);
		expect(screen.getByText("Anchor required")).toBeTruthy();
		cleanup();
		const onRetry = () => undefined;
		render(<CycleScheduleStatus isError onRetry={onRetry} />);
		expect(screen.getByText("Unable to load schedule status.")).toBeTruthy();
		expect(screen.getByRole("button", { name: "Retry" })).toBeTruthy();
	});

	test("renders an explicit loading state", () => {
		render(<CycleScheduleStatus />);
		expect(screen.getByText("Loading schedule status…")).toBeTruthy();
	});
});
