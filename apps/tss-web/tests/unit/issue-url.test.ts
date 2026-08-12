import { describe, expect, test } from "vitest";
import { buildIssueUrl } from "@/features/issues/issue-url";

describe("buildIssueUrl", () => {
	test("uses the current team slug when the issue has no team key", () => {
		const url = buildIssueUrl({
			slug: "acme",
			teamSlug: "eng",
			issue: {
				id: "issue-1",
				team: null,
			},
		});

		expect(url).toBe("/workspace/acme/teams/eng/issue/issue-1");
	});

	test("uses the issue team key when it is available", () => {
		const url = buildIssueUrl({
			slug: "acme",
			teamSlug: "eng",
			issue: {
				id: "issue-2",
				team: {
					key: "design",
				},
			},
		});

		expect(url).toBe("/workspace/acme/teams/design/issue/issue-2");
	});
});
