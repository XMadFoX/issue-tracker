import { afterEach, describe, expect, mock, test } from "bun:test";
import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@testing-library/react";
import { CycleScheduleAlerts } from "./cycle-schedule-alerts";

afterEach(cleanup);

describe("CycleScheduleAlerts", () => {
	test("renders kind-aware reminders and invokes dismiss from keyboard-compatible button", async () => {
		const onMarkRead = mock(async () => {});
		render(
			<CycleScheduleAlerts
				pendingActions={[]}
				notifications={[
					{
						id: "reminder",
						cycleId: "cycle",
						cycleName: "Cycle One",
						dueAt: "2026-08-01T10:00:00.000Z",
						kind: "end_reminder",
					},
				]}
				workspaceTimezone="UTC"
				onOpenCompletion={() => {}}
				onMarkRead={onMarkRead}
			/>,
		);
		expect(screen.getByText("Cycle ends soon")).toBeTruthy();
		const dismiss = screen.getByRole("button", { name: /mark cycle one/i });
		fireEvent.keyDown(dismiss, { key: "Enter" });
		fireEvent.click(dismiss);
		await waitFor(() => expect(onMarkRead).toHaveBeenCalledWith("reminder"));
	});

	test("renders loading and error states without exposing stale alerts", () => {
		render(
			<CycleScheduleAlerts
				pendingActions={[]}
				notifications={[]}
				workspaceTimezone="Invalid/Timezone"
				onOpenCompletion={() => {}}
				isLoading
			/>,
		);
		expect(screen.getByText(/loading cycle alerts/i)).toBeTruthy();
		cleanup();
		render(
			<CycleScheduleAlerts
				pendingActions={[]}
				notifications={[
					{
						id: "stale",
						cycleId: "cycle",
						cycleName: "Stale",
						dueAt: "2026-08-01T10:00:00.000Z",
					},
				]}
				workspaceTimezone="Invalid/Timezone"
				onOpenCompletion={() => {}}
				hasError
			/>,
		);
		expect(screen.getByRole("alert").textContent).toMatch(/unavailable/i);
		expect(screen.queryByText("Stale")).toBeNull();
	});

	test("dedupes confirmation notification and explains planned action", () => {
		render(
			<CycleScheduleAlerts
				pendingActions={[
					{
						id: "action",
						cycleId: "cycle",
						cycleName: "Planned Cycle",
						dueAt: new Date("2026-08-01T10:00:00.000Z"),
						cycleState: "planned",
					},
				]}
				notifications={[
					{
						id: "confirmation",
						cycleId: "cycle",
						cycleName: "Planned Cycle",
						dueAt: "2026-08-01T10:00:00.000Z",
						kind: "completion_confirmation",
						actionRequiredId: "action",
					},
				]}
				workspaceTimezone="UTC"
				onOpenCompletion={() => {}}
			/>,
		);
		expect(
			screen.getAllByText("Completion confirmation required"),
		).toHaveLength(1);
		expect(screen.getByRole("button", { name: "Review cycle" })).toHaveProperty(
			"disabled",
			true,
		);
		expect(screen.getByText(/not active/i)).toBeTruthy();
	});
});
