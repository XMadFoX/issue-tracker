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

const validCreateInput = {
	workspaceId,
	name: "Incident",
	key: "incident",
	icon: "🚨",
	color: "#ef4444",
	orderIndex: 0,
};

describe("issue type schemas", () => {
	test("list defaults archived rows out unless explicitly included", () => {
		expect(issueTypeListSchema.parse({ workspaceId })).toEqual({
			workspaceId,
			includeArchived: false,
		});
		expect(
			issueTypeListSchema.parse({ workspaceId, includeArchived: true }),
		).toMatchObject({ includeArchived: true });
	});

	test("create supports workspace and team scopes", () => {
		expect(issueTypeCreateSchema.parse(validCreateInput)).not.toHaveProperty(
			"teamId",
		);
		expect(
			issueTypeCreateSchema.parse({ ...validCreateInput, teamId: null }),
		).toMatchObject({ teamId: null });
		expect(
			issueTypeCreateSchema.parse({ ...validCreateInput, teamId }),
		).toMatchObject({ teamId });
	});

	test("create enforces issue type key format", () => {
		expect(
			issueTypeCreateSchema.parse({ ...validCreateInput, key: "bug-fix-2" }),
		).toMatchObject({ key: "bug-fix-2" });

		for (const key of ["Bad", "bad key", "bad_key", "", "bug.fix"]) {
			expect(() =>
				issueTypeCreateSchema.parse({ ...validCreateInput, key }),
			).toThrow();
		}
	});

	test("update requires identity and at least one mutable field", () => {
		expect(() => issueTypeUpdateSchema.parse({ workspaceId })).toThrow();
		expect(() => issueTypeUpdateSchema.parse({ id: issueTypeId })).toThrow();
		expect(() =>
			issueTypeUpdateSchema.parse({ id: issueTypeId, workspaceId }),
		).toThrow("At least one mutable issue field is required");
		expect(
			issueTypeUpdateSchema.parse({
				id: issueTypeId,
				workspaceId,
				key: "task",
			}),
		).toEqual({ id: issueTypeId, workspaceId, key: "task" });
		expect(
			issueTypeUpdateSchema.parse({
				id: issueTypeId,
				workspaceId,
				description: null,
				orderIndex: 0,
			}),
		).toEqual({
			id: issueTypeId,
			workspaceId,
			description: null,
			orderIndex: 0,
		});
	});

	test("reorder requires at least one issue type id", () => {
		expect(() =>
			issueTypeReorderSchema.parse({ workspaceId, orderedIds: [] }),
		).toThrow();
		expect(
			issueTypeReorderSchema.parse({
				workspaceId,
				teamId: null,
				orderedIds: [issueTypeId],
			}),
		).toEqual({ workspaceId, teamId: null, orderedIds: [issueTypeId] });
	});

	test("reorder rejects more than 100 ids", () => {
		const ids = Array.from({ length: 101 }, (_, i) =>
			`clx${String(i).padStart(22, "0")}`,
		);
		expect(() =>
			issueTypeReorderSchema.parse({ workspaceId, orderedIds: ids }),
		).toThrow();
	});

	test("reorder rejects duplicate ids", () => {
		expect(() =>
			issueTypeReorderSchema.parse({
				workspaceId,
				orderedIds: [issueTypeId, issueTypeId],
			}),
		).toThrow();
	});

	test("replacement operations require a replacement issue type id", () => {
		expect(() =>
			issueTypeReassignAndArchiveSchema.parse({ workspaceId, id: issueTypeId }),
		).toThrow();
		expect(() =>
			issueTypeReplaceForTeamSchema.parse({
				workspaceId,
				teamId,
				sourceIssueTypeId: issueTypeId,
			}),
		).toThrow();

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
