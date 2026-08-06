import { afterEach, describe, expect, it, vi } from "bun:test";
import type {
	CycleSettingsDraft,
	CycleSettingsSubmitResult,
} from "@prism/blocks/src/features/cycle-settings";
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";

const mutateAsync = vi.fn();
const invalidateQueries = vi.fn(async () => undefined);
const toastSuccess = vi.fn();
const toastError = vi.fn();
const queryOptions = (options: { input: unknown }) => ({
	queryKey: ["query", options],
});
const settings = {
	cadenceEnabled: false,
	cadenceDays: 14,
	anchorDate: null,
	planningHorizon: 2,
	endBehavior: "automatic" as const,
	gracePeriodMinutes: 1440,
	defaultRolloverPolicy: "carry_over" as const,
	reminderLeadMinutes: 1440,
	updatedBy: null,
	createdAt: new Date("2026-01-01T00:00:00.000Z"),
	updatedAt: new Date("2026-01-01T00:00:00.000Z"),
};

vi.mock("@tanstack/react-router", () => ({
	createFileRoute: () => (options: { component: unknown }) => ({
		...options,
		useParams: () => ({ slug: "workspace", teamSlug: "team" }),
	}),
}));

vi.mock("@tanstack/react-query", () => ({
	useMutation: () => ({ mutateAsync }),
	useQuery: (options: { queryKey: readonly unknown[] }) =>
		options.queryKey[1] &&
		typeof options.queryKey[1] === "object" &&
		"input" in options.queryKey[1] &&
		typeof options.queryKey[1].input === "object" &&
		options.queryKey[1].input !== null &&
		"teamId" in options.queryKey[1].input
			? {
					data: {
						status: "disabled",
						automationAvailable: false,
						workspaceTimezone: "UTC",
						cadenceDays: 14,
						anchorDate: null,
						currentOrDueBoundary: null,
						nextFutureBoundary: null,
						nextCycleEnd: null,
						actionTiming: null,
					},
					isPending: false,
					isError: false,
				}
			: {
					data: {
						settings,
						workspaceTimezone: "UTC",
						canManageSettings: true,
						automationAvailable: false,
					},
					isPending: false,
					isError: false,
				},
	useQueryClient: () => ({ invalidateQueries }),
	useSuspenseQuery: (options: { queryKey: readonly unknown[] }) =>
		options.queryKey[1] &&
		typeof options.queryKey[1] === "object" &&
		"input" in options.queryKey[1] &&
		typeof options.queryKey[1].input === "object" &&
		options.queryKey[1].input !== null &&
		"slug" in options.queryKey[1].input
			? { data: { id: "workspace-1" } }
			: { data: { id: "team-1", name: "Team" } },
}));

vi.mock("src/orpc/client", () => ({
	orpc: {
		workspace: { getBySlug: { queryOptions } },
		team: {
			getBySlug: { queryOptions, queryKey: queryOptions },
			listByWorkspace: { queryKey: queryOptions },
		},
		cycle: {
			getSettings: { queryOptions, queryKey: queryOptions },
			getSchedulePreview: { queryOptions, queryKey: queryOptions },
			updateSettings: { mutationOptions: () => ({}) },
			list: { queryKey: queryOptions },
			listPendingActions: { queryKey: queryOptions },
			listNotifications: { queryKey: queryOptions },
		},
	},
}));

vi.mock("@prism/blocks/src/features/cycle-settings", () => ({
	CycleSettingsView: (props: {
		onSubmit: (
			draft: CycleSettingsDraft,
			expectedUpdatedAt: string,
		) => Promise<CycleSettingsSubmitResult>;
	}) => (
		<button
			type="button"
			onClick={() => {
				void props.onSubmit(
					{
						cadenceEnabled: false,
						cadenceDays: 21,
						anchorDate: null,
						planningHorizon: 2,
						endBehavior: "automatic",
						gracePeriodMinutes: 1440,
						defaultRolloverPolicy: "carry_over",
						reminderLeadMinutes: 1440,
					},
					"2026-01-01T00:00:00.000Z",
				);
			}}
		>
			Save settings
		</button>
	),
}));

vi.mock("sonner", () => ({
	toast: { success: toastSuccess, error: toastError },
}));

const { RouteComponent } = await import("./index");

afterEach(() => {
	cleanup();
	mutateAsync.mockReset();
	invalidateQueries.mockClear();
	toastSuccess.mockClear();
	toastError.mockClear();
});

describe("cycle settings route", () => {
	it("submits one full replacement and refreshes scoped policy caches", async () => {
		mutateAsync.mockResolvedValue({ settings, unchanged: false });
		render(<RouteComponent />);
		fireEvent.click(document.querySelector("button") as HTMLButtonElement);
		await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(1));
		expect(mutateAsync).toHaveBeenCalledWith(
			expect.objectContaining({
				workspaceId: "workspace-1",
				teamId: "team-1",
				expectedUpdatedAt: "2026-01-01T00:00:00.000Z",
				cadenceDays: 21,
			}),
		);
		expect(invalidateQueries).toHaveBeenCalledTimes(7);
		expect(
			invalidateQueries.mock.calls
				.map((call) => JSON.stringify(call))
				.join(" "),
		).not.toContain("issue");
		expect(toastSuccess).toHaveBeenCalledWith("Cycle settings saved");
	});
});
