import { describe, expect, test } from "bun:test";
import {
	issueCreateSchema,
	issueListSchema,
	issueSearchSchema,
	issueUpdateSchema,
} from "./schema";

const workspaceId = "clx0000000000000000000000";
const teamId = "clx0000000000000000000001";
const issueTypeId = "clx0000000000000000000002";
const statusId = "clx0000000000000000000003";

describe("issue schemas", () => {
	describe("create", () => {
		test("omits issueTypeId and defaults to resolved type", () => {
			const parsed = issueCreateSchema.parse({
				workspaceId,
				teamId,
				statusId,
				title: "Untyped issue",
			});
			expect(parsed.issueTypeId).toBeUndefined();
		});

		test("accepts explicit issueTypeId", () => {
			const parsed = issueCreateSchema.parse({
				workspaceId,
				teamId,
				statusId,
				title: "Typed issue",
				issueTypeId,
			});
			expect(parsed.issueTypeId).toBe(issueTypeId);
		});

		test("rejects null issueTypeId", () => {
			expect(() =>
				issueCreateSchema.parse({
					workspaceId,
					teamId,
					statusId,
					title: "Bad type",
					issueTypeId: null,
				}),
			).toThrow();
		});
	});

	describe("update", () => {
		test("accepts issueTypeId change", () => {
			const parsed = issueUpdateSchema.parse({
				id: "clx0000000000000000000004",
				workspaceId,
				issueTypeId,
			});
			expect(parsed.issueTypeId).toBe(issueTypeId);
		});

		test("rejects null issueTypeId", () => {
			expect(() =>
				issueUpdateSchema.parse({
					id: "clx0000000000000000000004",
					workspaceId,
					issueTypeId: null,
				}),
			).toThrow();
		});
	});

	describe("list", () => {
		test("accepts issueTypeId filter", () => {
			const parsed = issueListSchema.parse({
				workspaceId,
				issueTypeId,
			});
			expect(parsed.issueTypeId).toBe(issueTypeId);
		});
	});

	describe("search", () => {
		test("accepts single issueTypeId filter", () => {
			const parsed = issueSearchSchema.parse({
				workspaceId,
				query: "find it",
				filters: { issueTypeId },
			});
			expect(parsed.filters?.issueTypeId).toBe(issueTypeId);
		});

		test("accepts multiple issueTypeIds filter", () => {
			const secondIssueTypeId = "clx0000000000000000000005";
			const parsed = issueSearchSchema.parse({
				workspaceId,
				query: "find it",
				filters: { issueTypeIds: [issueTypeId, secondIssueTypeId] },
			});
			expect(parsed.filters?.issueTypeIds).toEqual([
				issueTypeId,
				secondIssueTypeId,
			]);
		});

		test("defaults includeIssueType to false", () => {
			const parsed = issueSearchSchema.parse({
				workspaceId,
				query: "find it",
				options: {},
			});
			expect(parsed.options?.includeIssueType).toBe(false);
		});

		test("accepts includeIssueType true", () => {
			const parsed = issueSearchSchema.parse({
				workspaceId,
				query: "find it",
				options: { includeIssueType: true },
			});
			expect(parsed.options?.includeIssueType).toBe(true);
		});
	});
});
