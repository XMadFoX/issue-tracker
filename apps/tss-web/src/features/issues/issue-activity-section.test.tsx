import type {
	IssueActivityList,
	IssueStatusList,
} from "@prism/blocks/src/features/issues/types";
import { IssueActivitySection } from "@prism/blocks/src/features/issues/view/issue-activity-section";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "bun:test";

afterEach(cleanup);

const statuses: IssueStatusList = [];

function activity({
	actionType,
	metadata,
	cycleName,
}: {
	actionType: "issue.cycle_rolled_over" | "issue.cycle_returned_to_backlog";
	metadata: IssueActivityList[number]["metadata"];
	cycleName?: string;
}): IssueActivityList[number] {
	return {
		id: `${actionType}-${cycleName ?? "missing"}`,
		workspaceId: "workspace-1",
		teamId: "team-1",
		issueId: "issue-1",
		actorId: null,
		cycleId: cycleName ? "cycle-1" : null,
		actionType,
		field: null,
		fromValue: null,
		toValue: null,
		metadata,
		createdAt: new Date("2026-07-13T12:00:00.000Z"),
		actor: null,
		cycle: cycleName
			? {
					id: "cycle-1",
					workspaceId: "workspace-1",
					teamId: "team-1",
					name: cycleName,
					sequence: 2,
					startDate: new Date("2026-07-14T00:00:00.000Z"),
					endDate: new Date("2026-07-28T00:00:00.000Z"),
					state: "planned",
					capacity: null,
					velocity: null,
					createdAt: new Date("2026-07-01T00:00:00.000Z"),
					updatedAt: new Date("2026-07-01T00:00:00.000Z"),
				}
			: null,
	};
}

describe("IssueActivitySection cycle completion activity", () => {
	it("renders rollover origin metadata and destination relation", () => {
		render(
			<IssueActivitySection
				statuses={statuses}
				activity={[
					activity({
						actionType: "issue.cycle_rolled_over",
						metadata: { fromCycleName: "Cycle 8", toCycleName: "Cycle 9" },
						cycleName: "Cycle 9",
					}),
				]}
			/>,
		);

		expect(screen.getByText("rolled over cycle")).toBeTruthy();
		expect(screen.getByText("· Cycle 8 → Cycle 9")).toBeTruthy();
	});

	it("renders the source cycle for a valid backlog return", () => {
		render(
			<IssueActivitySection
				statuses={statuses}
				activity={[
					activity({
						actionType: "issue.cycle_returned_to_backlog",
						metadata: { fromCycleName: "Cycle 8" },
						cycleName: "Cycle 8",
					}),
				]}
			/>,
		);

		expect(screen.getByText("returned to backlog")).toBeTruthy();
		expect(screen.getByText("· Cycle 8 completed")).toBeTruthy();
	});

	it("safely falls back when rollover or backlog metadata is malformed or absent", () => {
		render(
			<IssueActivitySection
				statuses={statuses}
				activity={[
					activity({
						actionType: "issue.cycle_rolled_over",
						metadata: ["unexpected"],
					}),
					activity({
						actionType: "issue.cycle_returned_to_backlog",
						metadata: null,
					}),
				]}
			/>,
		);

		expect(screen.getByText("· a previous cycle → the new cycle")).toBeTruthy();
		expect(screen.getByText("· the cycle completed")).toBeTruthy();
	});
});
