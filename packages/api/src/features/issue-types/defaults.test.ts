import { describe, expect, test } from "bun:test";
import {
	buildDefaultIssueTypeSeed,
	DEFAULT_ISSUE_TYPES,
	DEFAULT_TASK_ISSUE_TYPE_KEY,
} from "./defaults";

describe("issue type defaults", () => {
	test("defines the expected default issue types with Task as default", () => {
		expect(DEFAULT_ISSUE_TYPES.map((type) => type.key)).toEqual([
			"task",
			"bug",
			"feature",
			"chore",
		]);
		expect(DEFAULT_TASK_ISSUE_TYPE_KEY).toBe("task");

		const defaultTypes = DEFAULT_ISSUE_TYPES.filter((type) => type.isDefault);
		expect(defaultTypes).toHaveLength(1);
		expect(defaultTypes[0]?.key).toBe("task");
	});

	test("builds global workspace issue type seed rows", () => {
		const { issueTypes } = buildDefaultIssueTypeSeed("workspace_1");

		expect(issueTypes).toHaveLength(4);
		expect(issueTypes.map((type) => type.key)).toEqual([
			"task",
			"bug",
			"feature",
			"chore",
		]);

		for (const issueType of issueTypes) {
			expect(issueType.id).toBeString();
			expect(issueType.workspaceId).toBe("workspace_1");
			expect(issueType.teamId).toBeNull();
			expect(issueType.name).toBeString();
			expect(issueType.icon).toBeString();
			expect(issueType.color).toBeString();
			expect(issueType.orderIndex).toBeNumber();
			expect(issueType.isEditable).toBe(true);
		}

		expect(issueTypes.filter((type) => type.isDefault)).toHaveLength(1);
		expect(issueTypes.find((type) => type.key === "task")?.isDefault).toBe(
			true,
		);
		expect(
			issueTypes
				.filter((type) => type.key !== "task")
				.every((type) => !type.isDefault),
		).toBe(true);
	});
});
