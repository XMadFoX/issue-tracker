import { describe, expect, test } from "bun:test";
import {
	cyclePerms,
	issueTypeOverridePerms,
	issueTypePerms,
	permissionCatalogEntries,
} from "../permissions/catalog";
import {
	TEAM_LEAD_PERMISSION_KEYS,
	TEAM_MEMBER_PERMISSION_KEYS,
	WORKSPACE_MEMBER_PERMISSION_KEYS,
} from "./defaults";

const issueTypeReadKeys = [...issueTypePerms, ...issueTypeOverridePerms]
	.filter((permission) => permission.action === "read")
	.map((permission) => permission.key);
const issueTypeManagementKeys = [...issueTypePerms, ...issueTypeOverridePerms]
	.filter((permission) => permission.action !== "read")
	.map((permission) => permission.key);

const cycleManagementPermissions = [
	{
		key: "cycle:complete",
		resourceType: "cycle",
		action: "complete",
		description: "Complete or cancel cycles and choose rollover dispositions",
	},
	{
		key: "cycle:manage_settings",
		resourceType: "cycle",
		action: "manage_settings",
		description: "Manage cycle scheduling and rollover settings",
	},
] as const;
const cycleManagementKeys = cycleManagementPermissions.map(
	(permission) => permission.key,
);

function expectPermissionsToContain(
	actualKeys: readonly string[],
	expectedKeys: readonly string[],
) {
	for (const permissionKey of expectedKeys) {
		expect(actualKeys).toContain(permissionKey);
	}
}

function expectPermissionsNotToContain(
	actualKeys: readonly string[],
	expectedKeys: readonly string[],
) {
	for (const permissionKey of expectedKeys) {
		expect(actualKeys).not.toContain(permissionKey);
	}
}

describe("built-in workspace and team role permissions", () => {
	test("catalog includes issue type definition and override permissions", () => {
		const catalogKeys = permissionCatalogEntries.map((entry) => entry.key);
		const expectedKeys = [...issueTypeReadKeys, ...issueTypeManagementKeys];

		expectPermissionsToContain(catalogKeys, expectedKeys);
	});

	test("catalog includes cycle management permissions with the expected resource and actions", () => {
		for (const expectedPermission of cycleManagementPermissions) {
			expect(cyclePerms).toContainEqual(expectedPermission);
		}
	});

	test("members can read issue type configuration without managing definitions or overrides", () => {
		expectPermissionsToContain(
			WORKSPACE_MEMBER_PERMISSION_KEYS,
			issueTypeReadKeys,
		);
		expectPermissionsToContain(TEAM_MEMBER_PERMISSION_KEYS, issueTypeReadKeys);
		expectPermissionsNotToContain(
			WORKSPACE_MEMBER_PERMISSION_KEYS,
			issueTypeManagementKeys,
		);
		expectPermissionsNotToContain(
			TEAM_MEMBER_PERMISSION_KEYS,
			issueTypeManagementKeys,
		);
	});

	test("team leads can manage team-scoped issue types and overrides", () => {
		expectPermissionsToContain(TEAM_LEAD_PERMISSION_KEYS, issueTypeReadKeys);
		expectPermissionsToContain(
			TEAM_LEAD_PERMISSION_KEYS,
			issueTypeManagementKeys,
		);
	});

	test("only team leads receive cycle management permissions by default", () => {
		expectPermissionsToContain(TEAM_LEAD_PERMISSION_KEYS, cycleManagementKeys);
		expectPermissionsNotToContain(
			TEAM_MEMBER_PERMISSION_KEYS,
			cycleManagementKeys,
		);
		expectPermissionsNotToContain(
			WORKSPACE_MEMBER_PERMISSION_KEYS,
			cycleManagementKeys,
		);
	});
});
