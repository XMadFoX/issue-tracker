import { describe, expect, it } from "bun:test";
import { cycleAssignIssueSchema, cycleCreateSchema } from "./schema";

describe("cycleCreateSchema", () => {
	it("validates cycle creation with valid ISO dates", () => {
		const input = {
			workspaceId: "cjld2cjxh0000qzrmn831i7rn",
			teamId: "cjld2cjxh0001qzrmn831i7rn",
			name: "Sprint 42",
			startDate: "2026-08-01T00:00:00.000Z",
			endDate: "2026-08-14T00:00:00.000Z",
			capacity: 40,
		};
		const parsed = cycleCreateSchema.parse(input);
		expect(parsed.name).toBe("Sprint 42");
		expect(parsed.capacity).toBe(40);
	});

	it("rejects non-ISO date format for startDate", () => {
		const invalid = {
			workspaceId: "cjld2cjxh0000qzrmn831i7rn",
			teamId: "cjld2cjxh0001qzrmn831i7rn",
			startDate: "2026-08-01",
		};
		expect(() => cycleCreateSchema.parse(invalid)).toThrow();
	});
});

describe("cycleAssignIssueSchema", () => {
	it("validates cycle assignment payload", () => {
		const payload = {
			workspaceId: "cjld2cjxh0000qzrmn831i7rn",
			cycleId: "cjld2cjxh0002qzrmn831i7rn",
			issueId: "cjld2cjxh0003qzrmn831i7rn",
		};
		expect(cycleAssignIssueSchema.parse(payload)).toEqual(payload);
	});
});
