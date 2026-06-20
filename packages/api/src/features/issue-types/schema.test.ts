import { describe, expect, test } from "bun:test";
import {
	issueTypeCreateSchema,
	issueTypeListSchema,
	issueTypeReassignAndArchiveSchema,
	issueTypeReorderSchema,
	issueTypeReplaceForTeamSchema,
	issueTypeUpdateSchema,
} from "./schema";

const workspaceId = "clx0000000000000000000000";
const teamId = "clx0000000000000000000001";
const issueTypeId = "clx0000000000000000000002";
const replacementIssueTypeId = "clx0000000000000000000003";

describe("issue type schemas", () => {
	test("list defaults includeArchived to false", () => {
		expect(issueTypeListSchema.parse({ workspaceId })).toEqual({
			workspaceId,
			includeArchived: false,
		});
	});

	test("create accepts global and team-scoped input", () => {
		expect(
			issueTypeCreateSchema.parse({
				workspaceId,
				teamId,
				name: "Incident",
				key: "incident",
				icon: "🚨",
				color: "#ef4444",
				orderIndex: 0,
			}),
		).toMatchObject({ workspaceId, teamId, key: "incident" });
	});

	test("create rejects invalid keys", () => {
		expect(() =>
			issueTypeCreateSchema.parse({
				workspaceId,
				name: "Bad",
				key: "Bad Key",
				icon: "x",
				color: "#000",
				orderIndex: 0,
			}),
		).toThrow();
	});

	test("update requires id and workspaceId", () => {
		expect(() => issueTypeUpdateSchema.parse({ key: "task" })).toThrow();
		expect(
			issueTypeUpdateSchema.parse({
				id: issueTypeId,
				workspaceId,
				key: "task",
			}),
		).toMatchObject({ id: issueTypeId, workspaceId, key: "task" });
	});

	test("reorder requires at least one id", () => {
		expect(() =>
			issueTypeReorderSchema.parse({ workspaceId, orderedIds: [] }),
		).toThrow();
		expect(
			issueTypeReorderSchema.parse({
				workspaceId,
				teamId,
				orderedIds: [issueTypeId],
			}),
		).toMatchObject({ workspaceId, teamId, orderedIds: [issueTypeId] });
	});

	test("reassign and replace require replacement ids", () => {
		expect(
			issueTypeReassignAndArchiveSchema.parse({
				workspaceId,
				id: issueTypeId,
				replacementIssueTypeId,
			}),
		).toMatchObject({ replacementIssueTypeId });
		expect(
			issueTypeReplaceForTeamSchema.parse({
				workspaceId,
				teamId,
				sourceIssueTypeId: issueTypeId,
				replacementIssueTypeId,
			}),
		).toMatchObject({ replacementIssueTypeId });
	});
});
