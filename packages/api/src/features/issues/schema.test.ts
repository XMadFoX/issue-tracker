import { describe, expect, it } from "bun:test";
import {
	issueCreateSchema,
	issueDeleteSchema,
	issueGetSchema,
	issueListSchema,
	issueSearchSchema,
	issueUpdateSchema,
} from "./schema";

describe("issueCreateSchema", () => {
	it("validates valid issue creation payload", () => {
		const valid = {
			workspaceId: "cjld2cjxh0000qzrmn831i7rn",
			teamId: "cjld2cjxh0001qzrmn831i7rn",
			title: "Implement dark mode toggle",
			statusId: "status-123",
		};
		const parsed = issueCreateSchema.parse(valid);
		expect(parsed.title).toBe("Implement dark mode toggle");
		expect(parsed.labelIds).toEqual([]);
	});

	it("rejects empty title", () => {
		const invalid = {
			workspaceId: "cjld2cjxh0000qzrmn831i7rn",
			teamId: "cjld2cjxh0001qzrmn831i7rn",
			title: "",
			statusId: "status-123",
		};
		expect(() => issueCreateSchema.parse(invalid)).toThrow();
	});

	it("rejects title exceeding 100 characters", () => {
		const invalid = {
			workspaceId: "cjld2cjxh0000qzrmn831i7rn",
			teamId: "cjld2cjxh0001qzrmn831i7rn",
			title: "a".repeat(101),
			statusId: "status-123",
		};
		expect(() => issueCreateSchema.parse(invalid)).toThrow();
	});
});

describe("issueUpdateSchema", () => {
	it("accepts valid issue update with at least one field", () => {
		const update = {
			id: "issue-1",
			workspaceId: "cjld2cjxh0000qzrmn831i7rn",
			title: "Updated Title",
		};
		const parsed = issueUpdateSchema.parse(update);
		expect(parsed.title).toBe("Updated Title");
	});

	it("rejects update if no mutable fields are provided", () => {
		const emptyUpdate = {
			id: "issue-1",
			workspaceId: "cjld2cjxh0000qzrmn831i7rn",
		};
		expect(() => issueUpdateSchema.parse(emptyUpdate)).toThrow(
			"At least one mutable issue field is required",
		);
	});
});

describe("issueListSchema", () => {
	it("applies default limit and archivedFilter", () => {
		const input = {
			workspaceId: "cjld2cjxh0000qzrmn831i7rn",
		};
		const parsed = issueListSchema.parse(input);
		expect(parsed.limit).toBe(100);
		expect(parsed.offset).toBe(0);
		expect(parsed.archivedFilter).toBe("unarchived");
	});
});

describe("issueGetSchema & issueDeleteSchema", () => {
	it("validates issue get payload", () => {
		const payload = {
			id: "issue-123",
			workspaceId: "cjld2cjxh0000qzrmn831i7rn",
		};
		expect(issueGetSchema.parse(payload)).toEqual(payload);
		expect(issueDeleteSchema.parse(payload)).toEqual(payload);
	});
});

describe("issueSearchSchema", () => {
	it("validates search query payload with defaults", () => {
		const payload = {
			workspaceId: "cjld2cjxh0000qzrmn831i7rn",
			query: "auth bug",
		};
		const parsed = issueSearchSchema.parse(payload);
		expect(parsed.mode).toBe("hybrid");
		expect(parsed.includeArchived).toBe(false);
	});
});
