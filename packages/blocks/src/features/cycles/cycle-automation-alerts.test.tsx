import { afterEach, describe, expect, mock, test } from "bun:test";
import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@testing-library/react";
import {
	CycleAutomationAlerts,
	type CycleAutomationProblem,
} from "./cycle-automation-alerts";

const problem = (
	overrides: Partial<CycleAutomationProblem>,
): CycleAutomationProblem => ({
	id: "job-1",
	cycleId: "cycle-1",
	cycleName: "Cycle 12",
	jobType: "start_scheduled_cycle",
	status: "blocked",
	attempts: 0,
	maxAttempts: 8,
	availableAt: "2026-08-16T10:00:00.000Z",
	scheduledBoundary: "2026-08-16T10:00:00.000Z",
	outcome: "active_cycle_blocked",
	lastErrorCode: null,
	lastErrorSummary: null,
	canRetry: false,
	...overrides,
});

afterEach(cleanup);

describe("CycleAutomationAlerts", () => {
	test("explains blocked and retrying lifecycle work with status semantics", () => {
		render(
			<CycleAutomationAlerts
				problems={[
					problem({}),
					problem({
						id: "job-2",
						status: "queued",
						jobType: "complete_scheduled_cycle",
						attempts: 2,
					}),
				]}
				workspaceTimezone="UTC"
			/>,
		);
		expect(screen.getByText("Automatic start waiting")).toBeTruthy();
		expect(
			screen.getByText(/until the current active cycle is completed/i),
		).toBeTruthy();
		expect(screen.getByText("Automation retry scheduled")).toBeTruthy();
		expect(screen.getByText(/attempt 3 of 8/i)).toBeTruthy();
		expect(screen.getAllByRole("status")).toHaveLength(2);
	});

	test("renders a bounded failure and retries only when authorized", async () => {
		const onRetry = mock(async () => {});
		render(
			<CycleAutomationAlerts
				problems={[
					problem({
						status: "failed",
						canRetry: true,
						lastErrorCode: "TRANSIENT_RUNTIME_ERROR",
						lastErrorSummary: "Lifecycle processing failed",
					}),
					problem({
						id: "job-2",
						status: "failed",
						canRetry: false,
						lastErrorSummary: "Completion failed",
					}),
				]}
				workspaceTimezone="UTC"
				onRetry={onRetry}
			/>,
		);
		expect(screen.getAllByRole("alert")).toHaveLength(2);
		expect(screen.queryByText("TRANSIENT_RUNTIME_ERROR")).toBeNull();
		const retry = screen.getByRole("button", { name: "Retry" });
		fireEvent.click(retry);
		await waitFor(() => expect(onRetry).toHaveBeenCalledWith("job-1"));
		expect(screen.getAllByRole("button", { name: "Retry" })).toHaveLength(1);
	});

	test("uses pending, loading, and error states without stale controls", () => {
		const failed = problem({ status: "failed", canRetry: true });
		const { rerender } = render(
			<CycleAutomationAlerts
				problems={[failed]}
				workspaceTimezone="UTC"
				retryingJobId="job-1"
				onRetry={async () => {}}
			/>,
		);
		expect(screen.getByRole("button", { name: "Retrying…" })).toHaveProperty(
			"disabled",
			true,
		);
		rerender(
			<CycleAutomationAlerts
				problems={[failed]}
				workspaceTimezone="UTC"
				isLoading
			/>,
		);
		expect(screen.getByText(/loading automation status/i)).toBeTruthy();
		expect(screen.queryByRole("button")).toBeNull();
		rerender(
			<CycleAutomationAlerts
				problems={[failed]}
				workspaceTimezone="UTC"
				hasError
			/>,
		);
		expect(screen.getByRole("alert").textContent).toMatch(/unavailable/i);
		expect(screen.queryByText(/failed/i)).toBeNull();
	});
});
