import { describe, expect, test } from "bun:test";
import { permissionCatalogEntries } from "../permissions/catalog";
import {
	TEAM_LEAD_PERMISSION_KEYS,
	TEAM_MEMBER_PERMISSION_KEYS,
	WORKSPACE_MEMBER_PERMISSION_KEYS,
} from "./defaults";

const issueTypeDefinitionManagementKeys = [
	"issue_type:create",
	"issue_type:update",
	"issue_type:delete",
	"issue_type:reorder",
] as const;

const issueTypeOverrideManagementKeys = ["issue_type_override:manage"] as const;

describe("built-in workspace and team role permissions", () => {
	test("catalog includes issue type definition and override permissions", () => {
		const catalogKeys = permissionCatalogEntries.map((entry) => entry.key);

		expect(catalogKeys).toContain("issue_type:read");
		expect(catalogKeys).toContain("issue_type:create");
		expect(catalogKeys).toContain("issue_type:update");
		expect(catalogKeys).toContain("issue_type:delete");
		expect(catalogKeys).toContain("issue_type:reorder");
		expect(catalogKeys).toContain("issue_type_override:read");
		expect(catalogKeys).toContain("issue_type_override:manage");
	});

	test("members can read issue type configuration without managing definitions or overrides", () => {
		expect(WORKSPACE_MEMBER_PERMISSION_KEYS).toContain("issue_type:read");
		expect(WORKSPACE_MEMBER_PERMISSION_KEYS).toContain(
			"issue_type_override:read",
		);
		expect(TEAM_MEMBER_PERMISSION_KEYS).toContain("issue:update");
		expect(TEAM_MEMBER_PERMISSION_KEYS).toContain("issue_type:read");
		expect(TEAM_MEMBER_PERMISSION_KEYS).toContain("issue_type_override:read");
		expect(TEAM_MEMBER_PERMISSION_KEYS).not.toContain(
			"issue_type_override:manage",
		);

		expect(WORKSPACE_MEMBER_PERMISSION_KEYS).not.toContain(
			"issue_type_override:manage",
		);

		for (const permissionKey of issueTypeDefinitionManagementKeys) {
			expect(WORKSPACE_MEMBER_PERMISSION_KEYS).not.toContain(permissionKey);
			expect(TEAM_MEMBER_PERMISSION_KEYS).not.toContain(permissionKey);
		}
		for (const permissionKey of issueTypeOverrideManagementKeys) {
			expect(WORKSPACE_MEMBER_PERMISSION_KEYS).not.toContain(permissionKey);
			expect(TEAM_MEMBER_PERMISSION_KEYS).not.toContain(permissionKey);
		}
	});

	test("team leads can manage team-scoped issue types and overrides", () => {
		expect(TEAM_LEAD_PERMISSION_KEYS).toContain("issue_type:read");
		expect(TEAM_LEAD_PERMISSION_KEYS).toContain("issue_type_override:read");
		expect(TEAM_LEAD_PERMISSION_KEYS).toContain("issue_type_override:manage");

		for (const permissionKey of issueTypeDefinitionManagementKeys) {
			expect(TEAM_LEAD_PERMISSION_KEYS).toContain(permissionKey);
		}
		for (const permissionKey of issueTypeOverrideManagementKeys) {
			expect(TEAM_LEAD_PERMISSION_KEYS).toContain(permissionKey);
		}
	});
});
