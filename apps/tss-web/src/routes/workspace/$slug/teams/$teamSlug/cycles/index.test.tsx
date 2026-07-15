// @vitest-environment jsdom

import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type InvalidationRequest = {
	queryKey?: readonly unknown[];
	predicate?: (query: { queryKey: readonly unknown[] }) => boolean;
	exact?: boolean;
};

const invalidationRequests: InvalidationRequest[] = [];
const invalidateQueries = vi.fn(async (options: InvalidationRequest) => {
	invalidationRequests.push(options);
});
const completeMutation = vi.fn();
const toastSuccess = vi.fn();
const toastError = vi.fn();

const queryOptions = (options: { input: unknown }) => ({
	queryKey: ["query", options],
});
const mutationOptions = () => ({});

vi.mock("@tanstack/react-router", () => ({
	createFileRoute: () => (options: { component: unknown }) => ({
		...options,
		useParams: () => ({ slug: "workspace", teamSlug: "team" }),
	}),
}));

vi.mock("@tanstack/react-query", () => ({
	useMutation: () => ({ mutateAsync: completeMutation, isPending: false }),
	useQueries: () => [],
	useQueryClient: () => ({ invalidateQueries }),
	useSuspenseQuery: (options: { queryKey: readonly unknown[] }) => {
		const queryOptions = options.queryKey[1];
		if (
			typeof queryOptions === "object" &&
			queryOptions !== null &&
			"input" in queryOptions &&
			typeof queryOptions.input === "object" &&
			queryOptions.input !== null &&
			"slug" in queryOptions.input
		) {
			return { data: { id: "workspace-1" } };
		}
		if (
			typeof queryOptions === "object" &&
			queryOptions !== null &&
			"input" in queryOptions &&
			typeof queryOptions.input === "object" &&
			queryOptions.input !== null &&
			"key" in queryOptions.input
		) {
			return { data: { id: "team-1", cycleDuration: 14 } };
		}
		return { data: [] };
	},
}));

vi.mock("src/orpc/client", () => ({
	orpc: {
		workspace: { getBySlug: { queryOptions } },
		team: { getBySlug: { queryOptions } },
		cycle: {
			list: { queryOptions, key: () => ["cycle", "list"] },
			metrics: {
				queryOptions,
				queryKey: ({ input }: { input: unknown }) => [
					"cycle",
					"metrics",
					input,
				],
				key: () => ["cycle", "metrics"],
			},
			create: { mutationOptions },
			update: { mutationOptions },
			delete: { mutationOptions },
			complete: { mutationOptions },
		},
		issue: { list: { key: () => ["issue", "list"] } },
	},
}));

vi.mock("@/features/issues/issues-feature", () => ({
	issueQueryKeys: {
		issueDetail: ({ issueId }: { workspaceId: string; issueId: string }) => [
			"issue",
			"detail",
			issueId,
		],
		issueActivity: ({ issueId }: { workspaceId: string; issueId: string }) => [
			"issue",
			"activity",
			issueId,
		],
	},
	useIssueLiveUpdates: vi.fn(),
}));

vi.mock("@prism/blocks/src/features/cycles", () => ({
	CycleList: ({
		onComplete,
	}: {
		onComplete: (input: {
			cycleId: string;
			disposition: { type: "moveToBacklog" };
		}) => Promise<void>;
	}) => (
		<button
			type="button"
			onClick={() => {
				void onComplete({
					cycleId: "source-cycle",
					disposition: { type: "moveToBacklog" },
				}).catch(() => undefined);
			}}
		>
			Complete source
		</button>
	),
}));

vi.mock("sonner", () => ({
	toast: { success: toastSuccess, error: toastError },
}));

const { RouteComponent } = await import("./index");

beforeEach(async () => {
	invalidateQueries.mockClear();
	invalidationRequests.splice(0, invalidationRequests.length);
	completeMutation.mockReset();
	toastSuccess.mockClear();
	toastError.mockClear();
	completeMutation.mockResolvedValue({
		source: { id: "source-cycle", name: "Current cycle" },
		target: { id: "target-cycle", name: "Next cycle" },
		counts: { carriedOver: 2, returnedToBacklog: 1, completed: 0, canceled: 0 },
		affectedCycleIds: ["source-cycle", "target-cycle"],
		affectedIssueIds: ["issue-1", "issue-2"],
	});
});

afterEach(cleanup);

describe("cycles route completion integration", () => {
	it("submits cycle.complete and invalidates every affected cache scope", async () => {
		render(<RouteComponent />);
		fireEvent.click(screen.getByRole("button", { name: "Complete source" }));

		await waitFor(() => {
			expect(completeMutation).toHaveBeenCalledWith({
				workspaceId: "workspace-1",
				cycleId: "source-cycle",
				disposition: { type: "moveToBacklog" },
			});
		});
		expect(toastSuccess).toHaveBeenCalledWith(
			"Current cycle completed — 2 carried over to Next cycle, 1 returned to backlog",
		);
		expect(invalidateQueries).toHaveBeenCalledWith({
			queryKey: ["cycle", "list"],
		});
		expect(invalidateQueries).toHaveBeenCalledWith({
			queryKey: [
				"cycle",
				"metrics",
				{ workspaceId: "workspace-1", cycleId: "source-cycle" },
			],
		});
		expect(invalidateQueries).toHaveBeenCalledWith({
			queryKey: [
				"cycle",
				"metrics",
				{ workspaceId: "workspace-1", cycleId: "target-cycle" },
			],
		});
		expect(invalidateQueries).toHaveBeenCalledWith({
			queryKey: ["issue", "detail", "issue-1"],
			exact: true,
		});
		expect(invalidateQueries).toHaveBeenCalledWith({
			queryKey: ["issue", "activity", "issue-2"],
			exact: true,
		});
		const issueListInvalidation = invalidationRequests.find(
			(options) =>
				options.queryKey?.[0] === "issue" &&
				options.queryKey[1] === "list" &&
				typeof options.predicate === "function",
		);
		expect(issueListInvalidation).toBeDefined();
		if (
			!issueListInvalidation ||
			typeof issueListInvalidation.predicate !== "function"
		) {
			throw new Error("Expected issue-list invalidation predicate");
		}
		expect(
			issueListInvalidation.predicate({
				queryKey: [
					"issue",
					{ input: { workspaceId: "workspace-1", teamId: "team-1" } },
				],
			}),
		).toBe(true);
		expect(
			issueListInvalidation.predicate({
				queryKey: [
					"issue",
					{ input: { workspaceId: "workspace-1", teamId: "other-team" } },
				],
			}),
		).toBe(false);
		expect(
			issueListInvalidation.predicate({
				queryKey: [
					"issue",
					{ input: { workspaceId: "other-workspace", teamId: "team-1" } },
				],
			}),
		).toBe(false);
	});

	it("reports rejected completion and refreshes stale cycle state without success", async () => {
		const consoleError = vi
			.spyOn(console, "error")
			.mockImplementation(() => undefined);
		completeMutation.mockRejectedValueOnce(
			new Error("Cycle already completed"),
		);
		render(<RouteComponent />);
		fireEvent.click(screen.getByRole("button", { name: "Complete source" }));

		await waitFor(() => {
			expect(toastError).toHaveBeenCalledWith("Cycle already completed");
		});
		expect(toastSuccess).not.toHaveBeenCalled();
		expect(invalidateQueries).toHaveBeenCalledWith({
			queryKey: ["cycle", "list"],
		});
		expect(invalidateQueries).toHaveBeenCalledWith({
			queryKey: ["cycle", "metrics"],
		});
		consoleError.mockRestore();
	});
});
