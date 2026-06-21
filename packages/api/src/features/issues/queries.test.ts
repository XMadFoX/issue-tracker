import { describe, expect, test } from "bun:test";
import { isNull, sql } from "drizzle-orm";
import { buildIssueSearchWhere } from "./queries";

describe("buildIssueSearchWhere", () => {
	test("includes direct issueTypeId filter and composes raw conditions", () => {
		const where = buildIssueSearchWhere({
			workspaceId: "clx0000000000000000000000",
			issueTypeId: "clx0000000000000000000002",
			rawConditions: [(fields) => isNull(fields.archivedAt)],
		});

		expect(where.workspaceId).toBe("clx0000000000000000000000");
		expect(where.issueTypeId).toBe("clx0000000000000000000002");
		expect(where.RAW).toBeDefined();
	});

	test("returns no RAW wrapper when rawConditions is empty", () => {
		const where = buildIssueSearchWhere({
			workspaceId: "clx0000000000000000000000",
			rawConditions: [],
		});

		expect(where.RAW).toBeUndefined();
	});

	test("composes multiple raw conditions into a single RAW predicate", () => {
		const where = buildIssueSearchWhere({
			workspaceId: "clx0000000000000000000000",
			rawConditions: [
				(fields) => isNull(fields.archivedAt),
				(fields) => sql`${fields.teamId} = 'clx0000000000000000000001'`,
			],
		});

		expect(where.RAW).toBeDefined();
	});
});
