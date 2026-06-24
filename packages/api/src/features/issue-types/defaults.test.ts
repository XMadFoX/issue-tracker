import { describe, expect, test } from "bun:test";
import {
	buildDefaultIssueTypeSeed,
	DEFAULT_ISSUE_TYPES,
	DEFAULT_TASK_ISSUE_TYPE_KEY,
} from "./defaults";

describe("issue type defaults", () => {
	test("defines a single default issue type referenced by key", () => {
		const defaultTypes = DEFAULT_ISSUE_TYPES.filter((type) => type.isDefault);
		const keys = DEFAULT_ISSUE_TYPES.map((type) => type.key);
		const orderIndexes = DEFAULT_ISSUE_TYPES.map((type) => type.orderIndex);

		expect(defaultTypes).toHaveLength(1);
		expect(defaultTypes[0]?.key).toBe(DEFAULT_TASK_ISSUE_TYPE_KEY);
		expect(keys).toContain(DEFAULT_TASK_ISSUE_TYPE_KEY);
		expect(new Set(keys)).toHaveProperty("size", keys.length);
		expect(new Set(orderIndexes)).toHaveProperty("size", orderIndexes.length);
	});

	test("builds global workspace issue type seed rows", () => {
		const { issueTypes } = buildDefaultIssueTypeSeed("workspace_1");
		const defaultKeys = DEFAULT_ISSUE_TYPES.map((type) => type.key);

		expect(issueTypes).toHaveLength(DEFAULT_ISSUE_TYPES.length);
		expect(issueTypes.map((type) => type.key)).toEqual(defaultKeys);

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
		expect(
			issueTypes.find((type) => type.key === DEFAULT_TASK_ISSUE_TYPE_KEY)
				?.isDefault,
		).toBe(true);
		expect(
			issueTypes
				.filter((type) => type.key !== DEFAULT_TASK_ISSUE_TYPE_KEY)
				.every((type) => !type.isDefault),
		).toBe(true);
	});
});
