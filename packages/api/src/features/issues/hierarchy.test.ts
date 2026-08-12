import { describe, expect, it } from "bun:test";
import {
	MAX_ISSUE_HIERARCHY_DEPTH,
	validateIssueParentAssignment,
} from "./hierarchy";

describe("validateIssueParentAssignment", () => {
	it("returns ok when parentIssueId is null or undefined", async () => {
		const mockDb = {} as any;
		const resNull = await validateIssueParentAssignment(mockDb, {
			workspaceId: "ws-1",
			teamId: "team-1",
			parentIssueId: null,
		});
		expect(resNull).toEqual({ ok: true });

		const resUndefined = await validateIssueParentAssignment(mockDb, {
			workspaceId: "ws-1",
			teamId: "team-1",
			parentIssueId: undefined,
		});
		expect(resUndefined).toEqual({ ok: true });
	});

	it("returns HIERARCHY_LOOP when issueId matches parentIssueId", async () => {
		const mockDb = {} as any;
		const result = await validateIssueParentAssignment(mockDb, {
			workspaceId: "ws-1",
			teamId: "team-1",
			issueId: "issue-123",
			parentIssueId: "issue-123",
		});
		expect(result).toEqual({ ok: false, code: "HIERARCHY_LOOP" });
	});

	it("exports correct MAX_ISSUE_HIERARCHY_DEPTH constant", () => {
		expect(MAX_ISSUE_HIERARCHY_DEPTH).toBe(5);
	});
});
