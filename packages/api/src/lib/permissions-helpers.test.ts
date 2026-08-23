import {
	afterAll,
	beforeAll,
	beforeEach,
	describe,
	expect,
	test,
} from "bun:test";
import { createId } from "@paralleldrive/cuid2";
import { eq } from "drizzle-orm";
import setupDb from "../utils/prepare-tests";
import type { AbacTables } from "./abac.test.fixtures";
import {
	createAbacFixtures,
	createLogicalIds,
	truncateAuthorizationTables,
} from "./abac.test.fixtures";

let tables: AbacTables;
let fixtures: ReturnType<typeof createAbacFixtures>;
let teardown: Awaited<ReturnType<typeof setupDb>>;
let isAllowed: typeof import("./abac")["isAllowed"];
let getReadableTeamIdsForPermission: typeof import("./permissions-helpers")["getReadableTeamIdsForPermission"];
let buildRolePermWhere: typeof import("./permissions-helpers")["buildRolePermWhere"];

beforeAll(async () => {
	teardown = await setupDb();
	({ isAllowed } = await import("./abac"));
	({ buildRolePermWhere, getReadableTeamIdsForPermission } = await import(
		"./permissions-helpers"
	));
	const { db } = await import("db");
	const auth = await import("db/features/auth/auth.schema");
	const tracker = await import("db/features/tracker/tracker.schema");
	const abac = await import("db/features/abac/abac.schema");
	tables = {
		db,
		user: auth.user,
		workspace: tracker.workspace,
		team: tracker.team,
		workspaceMembership: tracker.workspaceMembership,
		teamMembership: tracker.teamMembership,
		roleDefinitions: abac.roleDefinitions,
		permissionsCatalog: abac.permissionsCatalog,
		rolePermissions: abac.rolePermissions,
		policyConstraints: abac.policyConstraints,
		roleAssignments: abac.roleAssignments,
		entityAttributes: abac.entityAttributes,
	};
	fixtures = createAbacFixtures(tables);
}, 300_000);

afterAll(async () => {
	if (teardown) await teardown();
}, 60_000);

beforeEach(async () => {
	await truncateAuthorizationTables(tables.db);
});

async function assertBulkEqualsPerTeam(input: {
	userId: string;
	workspaceId: string;
	permissionKey: string;
	workspaceTeamIds: string[];
	foreignTeamIds?: string[];
}) {
	const projectedList = await getReadableTeamIdsForPermission({
		userId: input.userId,
		workspaceId: input.workspaceId,
		permissionKey: input.permissionKey,
	});
	const projected = new Set(projectedList);
	expect(projected.size).toBe(projectedList.length);
	const workspaceTeamIdSet = new Set(input.workspaceTeamIds);
	const expected = new Set<string>();
	for (const teamId of input.workspaceTeamIds) {
		const allowed = await isAllowed({
			userId: input.userId,
			workspaceId: input.workspaceId,
			teamId,
			permissionKey: input.permissionKey,
		});
		if (allowed) expected.add(teamId);
	}
	expect(projected).toEqual(expected);
	for (const teamId of projected) {
		expect(workspaceTeamIdSet.has(teamId)).toBe(true);
	}
	for (const foreignTeamId of input.foreignTeamIds ?? []) {
		expect(projected.has(foreignTeamId)).toBe(false);
	}
	return projected;
}

describe("bulk equivalence", () => {
	test("projection equals per-team isAllowed over the mixed fixture", async () => {
		const ids = createLogicalIds();
		const teamC = createId();
		await fixtures.seedWorkspacesAndTeams(ids);
		await fixtures.insertTeam({
			id: teamC,
			workspaceId: ids.workspaceA,
			privacy: "public",
			key: `c${teamC.slice(0, 7)}`,
		});

		const dummyRole = await fixtures.insertWorkspaceRole({
			workspaceId: ids.workspaceA,
			createdBy: ids.user,
			name: "placeholder-membership",
		});
		await fixtures.insertWorkspaceMembership({
			workspaceId: ids.workspaceA,
			userId: ids.user,
			roleId: dummyRole,
			status: "active",
		});

		await fixtures.insertWorkspaceRole({
			id: ids.workspaceRole,
			workspaceId: ids.workspaceA,
			createdBy: ids.user,
			name: "workspace-cycle-reader",
		});
		const cycleRead = await fixtures.insertExactPermission("cycle:read");
		await fixtures.insertRolePermission({
			roleId: ids.workspaceRole,
			permissionId: cycleRead,
			effect: "allow",
		});
		await fixtures.insertAssignment({
			roleId: ids.workspaceRole,
			userId: ids.user,
			workspaceId: ids.workspaceA,
			teamId: null,
			assignedBy: ids.user,
		});

		await fixtures.insertTeamRole({
			id: ids.teamARole,
			workspaceId: ids.workspaceA,
			teamId: ids.teamA,
			createdBy: ids.user,
			name: "team-allow",
		});
		const issueRead = await fixtures.insertExactPermission("issue:read");
		await fixtures.insertRolePermission({
			roleId: ids.teamARole,
			permissionId: issueRead,
			effect: "allow",
		});
		await fixtures.insertTeamMembership({
			teamId: ids.teamA,
			userId: ids.user,
			roleId: ids.teamARole,
			status: "active",
		});

		await fixtures.insertTeamRole({
			id: ids.teamBRole,
			workspaceId: ids.workspaceA,
			teamId: ids.teamB,
			createdBy: ids.user,
			name: "team-deny",
		});
		await fixtures.insertRolePermission({
			roleId: ids.teamBRole,
			permissionId: cycleRead,
			effect: "deny",
		});
		await fixtures.insertTeamMembership({
			teamId: ids.teamB,
			userId: ids.user,
			roleId: ids.teamBRole,
			status: "active",
		});

		const inactiveTeamRole = await fixtures.insertTeamRole({
			workspaceId: ids.workspaceA,
			teamId: teamC,
			createdBy: ids.user,
			name: "inactive-team-allow",
		});
		await fixtures.insertRolePermission({
			roleId: inactiveTeamRole,
			permissionId: issueRead,
			effect: "allow",
		});
		await fixtures.insertTeamMembership({
			teamId: teamC,
			userId: ids.user,
			roleId: inactiveTeamRole,
			status: "inactive",
		});

		const malformedWorkspaceRole = await fixtures.insertRoleDefinition({
			workspaceId: ids.workspaceA,
			scopeLevel: "workspace",
			teamId: ids.teamA,
			name: "malformed-assigned-workspace",
			createdBy: ids.user,
		});
		const labelRead = await fixtures.insertExactPermission("label:read");
		await fixtures.insertRolePermission({
			roleId: malformedWorkspaceRole,
			permissionId: labelRead,
			effect: "allow",
		});
		await fixtures.insertAssignment({
			roleId: malformedWorkspaceRole,
			userId: ids.user,
			workspaceId: ids.workspaceA,
			teamId: ids.teamA,
			assignedBy: ids.user,
		});

		const constrainedRole = await fixtures.insertWorkspaceRole({
			workspaceId: ids.workspaceA,
			createdBy: ids.user,
			name: "constrained-team-read",
		});
		const constraintId = await fixtures.insertConstraint({
			workspaceId: ids.workspaceA,
			scopeLevel: "workspace",
			predicateJson: {
				subject: { attribute_equals: { user_clearance: "secret" } },
			},
		});
		const teamRead = await fixtures.insertExactPermission("team:read");
		await fixtures.insertRolePermission({
			roleId: constrainedRole,
			permissionId: teamRead,
			effect: "allow",
			constraintId,
		});
		await fixtures.insertAssignment({
			roleId: constrainedRole,
			userId: ids.user,
			workspaceId: ids.workspaceA,
			teamId: null,
			assignedBy: ids.user,
		});
		await fixtures.insertEntityAttribute({
			entityType: "user",
			entityId: ids.user,
			key: "user_clearance",
			value: "secret",
			userId: ids.user,
		});

		const workspaceTeamIds = [ids.teamA, ids.teamB, teamC];
		for (const permissionKey of [
			"cycle:read",
			"issue:read",
			"label:read",
			"team:read",
			"cycle:update",
		]) {
			await assertBulkEqualsPerTeam({
				userId: ids.user,
				workspaceId: ids.workspaceA,
				permissionKey,
				workspaceTeamIds,
				foreignTeamIds: [ids.foreignTeam],
			});
		}
	});

	test("missing workspace membership returns empty", async () => {
		const ids = createLogicalIds();
		await fixtures.seedWorkspacesAndTeams(ids);
		await fixtures.insertWorkspaceRole({
			id: ids.workspaceRole,
			workspaceId: ids.workspaceA,
			createdBy: ids.user,
			name: "unattached-governor",
		});
		const permissionId = await fixtures.insertExactPermission("cycle:read");
		await fixtures.insertRolePermission({
			roleId: ids.workspaceRole,
			permissionId,
			effect: "allow",
		});

		expect(
			await getReadableTeamIdsForPermission({
				userId: ids.user,
				workspaceId: ids.workspaceA,
				permissionKey: "cycle:read",
			}),
		).toEqual([]);
	});

	test("inactive workspace membership returns empty", async () => {
		const ids = createLogicalIds();
		await fixtures.seedWorkspacesAndTeams(ids);
		await fixtures.insertWorkspaceRole({
			id: ids.workspaceRole,
			workspaceId: ids.workspaceA,
			createdBy: ids.user,
			name: "inactive-governor",
		});
		await fixtures.insertWorkspaceMembership({
			workspaceId: ids.workspaceA,
			userId: ids.user,
			roleId: ids.workspaceRole,
			status: "inactive",
		});
		const permissionId = await fixtures.insertExactPermission("cycle:read");
		await fixtures.insertRolePermission({
			roleId: ids.workspaceRole,
			permissionId,
			effect: "allow",
		});

		expect(
			await getReadableTeamIdsForPermission({
				userId: ids.user,
				workspaceId: ids.workspaceA,
				permissionKey: "cycle:read",
			}),
		).toEqual([]);
	});

	test("workspace-wide grants project across public and private teams", async () => {
		const ids = createLogicalIds();
		await fixtures.seedWorkspacesAndTeams(ids);
		await fixtures.insertWorkspaceRole({
			id: ids.workspaceRole,
			workspaceId: ids.workspaceA,
			createdBy: ids.user,
			name: "sky-governor",
		});
		await fixtures.insertWorkspaceMembership({
			workspaceId: ids.workspaceA,
			userId: ids.user,
			roleId: ids.workspaceRole,
			status: "active",
		});
		const permissionId = await fixtures.insertPermission({
			key: "*:*",
			resourceType: "*",
			action: "*",
		});
		await fixtures.insertRolePermission({
			roleId: ids.workspaceRole,
			permissionId,
			effect: "allow",
		});

		const projected = await assertBulkEqualsPerTeam({
			userId: ids.user,
			workspaceId: ids.workspaceA,
			permissionKey: "cycle:manage_settings",
			workspaceTeamIds: [ids.teamA, ids.teamB],
			foreignTeamIds: [ids.foreignTeam],
		});
		expect(projected.has(ids.teamA)).toBe(true);
		expect(projected.has(ids.teamB)).toBe(true);
	});

	test("ordinary members receive only exact teams authorized by valid team-scoped grants", async () => {
		const ids = createLogicalIds();
		await fixtures.seedWorkspacesAndTeams(ids);
		const dummyRole = await fixtures.insertWorkspaceRole({
			workspaceId: ids.workspaceA,
			createdBy: ids.user,
			name: "placeholder-membership",
		});
		await fixtures.insertWorkspaceMembership({
			workspaceId: ids.workspaceA,
			userId: ids.user,
			roleId: dummyRole,
			status: "active",
		});
		await fixtures.insertTeamRole({
			id: ids.teamARole,
			workspaceId: ids.workspaceA,
			teamId: ids.teamA,
			createdBy: ids.user,
			name: "orchid-contributor",
		});
		const permissionId = await fixtures.insertExactPermission("cycle:read");
		await fixtures.insertRolePermission({
			roleId: ids.teamARole,
			permissionId,
			effect: "allow",
		});
		await fixtures.insertTeamMembership({
			teamId: ids.teamA,
			userId: ids.user,
			roleId: ids.teamARole,
			status: "active",
		});

		const projected = await assertBulkEqualsPerTeam({
			userId: ids.user,
			workspaceId: ids.workspaceA,
			permissionKey: "cycle:read",
			workspaceTeamIds: [ids.teamA, ids.teamB],
			foreignTeamIds: [ids.foreignTeam],
		});
		expect(projected).toEqual(new Set([ids.teamA]));
	});

	test("representative permission patterns stay equivalent in bulk projection", async () => {
		const ids = createLogicalIds();
		await fixtures.seedWorkspacesAndTeams(ids);
		await fixtures.insertWorkspaceRole({
			id: ids.workspaceRole,
			workspaceId: ids.workspaceA,
			createdBy: ids.user,
			name: "pattern-governor",
		});
		await fixtures.insertWorkspaceMembership({
			workspaceId: ids.workspaceA,
			userId: ids.user,
			roleId: ids.workspaceRole,
			status: "active",
		});
		const permissionId = await fixtures.insertPermission({
			key: "cycle:*",
			resourceType: "cycle",
			action: "*",
		});
		await fixtures.insertRolePermission({
			roleId: ids.workspaceRole,
			permissionId,
			effect: "allow",
		});

		const projectedRead = await assertBulkEqualsPerTeam({
			userId: ids.user,
			workspaceId: ids.workspaceA,
			permissionKey: "cycle:read",
			workspaceTeamIds: [ids.teamA, ids.teamB],
		});
		expect(projectedRead.size).toBe(2);
		const projectedIssue = await assertBulkEqualsPerTeam({
			userId: ids.user,
			workspaceId: ids.workspaceA,
			permissionKey: "issue:read",
			workspaceTeamIds: [ids.teamA, ids.teamB],
		});
		expect(projectedIssue.size).toBe(0);
	});

	test("deny precedence remains identical in bulk projection", async () => {
		const ids = createLogicalIds();
		await fixtures.seedWorkspacesAndTeams(ids);
		await fixtures.insertWorkspaceRole({
			id: ids.workspaceRole,
			workspaceId: ids.workspaceA,
			createdBy: ids.user,
			name: "workspace-allow",
		});
		await fixtures.insertWorkspaceMembership({
			workspaceId: ids.workspaceA,
			userId: ids.user,
			roleId: ids.workspaceRole,
			status: "active",
		});
		const permissionId = await fixtures.insertExactPermission("cycle:read");
		await fixtures.insertRolePermission({
			roleId: ids.workspaceRole,
			permissionId,
			effect: "allow",
		});
		await fixtures.insertTeamRole({
			id: ids.teamARole,
			workspaceId: ids.workspaceA,
			teamId: ids.teamA,
			createdBy: ids.user,
			name: "team-deny",
		});
		await fixtures.insertRolePermission({
			roleId: ids.teamARole,
			permissionId,
			effect: "deny",
		});
		await fixtures.insertTeamMembership({
			teamId: ids.teamA,
			userId: ids.user,
			roleId: ids.teamARole,
			status: "active",
		});

		const projected = await assertBulkEqualsPerTeam({
			userId: ids.user,
			workspaceId: ids.workspaceA,
			permissionKey: "cycle:read",
			workspaceTeamIds: [ids.teamA, ids.teamB],
			foreignTeamIds: [ids.foreignTeam],
		});
		expect(projected.has(ids.teamA)).toBe(false);
		expect(projected.has(ids.teamB)).toBe(true);
	});
});

describe("role-permission query", () => {
	test("condition matches exact role permission and constraint through query results", async () => {
		const ids = createLogicalIds();
		await fixtures.seedWorkspacesAndTeams(ids);
		const roleA = await fixtures.insertWorkspaceRole({
			workspaceId: ids.workspaceA,
			createdBy: ids.user,
			name: "role-a",
		});
		const roleB = await fixtures.insertWorkspaceRole({
			workspaceId: ids.workspaceA,
			createdBy: ids.user,
			name: "role-b",
		});
		const permissionA = await fixtures.insertExactPermission("cycle:read");
		const permissionB = await fixtures.insertExactPermission("cycle:update");
		const constraintA = await fixtures.insertConstraint({
			workspaceId: ids.workspaceA,
			scopeLevel: "workspace",
			predicateJson: { always: true },
		});
		const constraintB = await fixtures.insertConstraint({
			workspaceId: ids.workspaceA,
			scopeLevel: "workspace",
			predicateJson: { always: false },
		});
		await fixtures.insertRolePermission({
			roleId: roleA,
			permissionId: permissionA,
			effect: "allow",
			constraintId: null,
		});
		await fixtures.insertRolePermission({
			roleId: roleA,
			permissionId: permissionA,
			effect: "allow",
			constraintId: constraintA,
		});
		await fixtures.insertRolePermission({
			roleId: roleA,
			permissionId: permissionA,
			effect: "deny",
			constraintId: constraintB,
		});
		await fixtures.insertRolePermission({
			roleId: roleB,
			permissionId: permissionA,
			effect: "allow",
			constraintId: null,
		});
		await fixtures.insertRolePermission({
			roleId: roleA,
			permissionId: permissionB,
			effect: "allow",
			constraintId: null,
		});

		const nullCondition = buildRolePermWhere(roleA, permissionA, null);
		const omittedCondition = buildRolePermWhere(roleA, permissionA);
		const constraintACondition = buildRolePermWhere(
			roleA,
			permissionA,
			constraintA,
		);
		const constraintBCondition = buildRolePermWhere(
			roleA,
			permissionA,
			constraintB,
		);

		const nullRows = await tables.db
			.select()
			.from(tables.rolePermissions)
			.where(nullCondition);
		const omittedRows = await tables.db
			.select()
			.from(tables.rolePermissions)
			.where(omittedCondition);
		const constraintARows = await tables.db
			.select()
			.from(tables.rolePermissions)
			.where(constraintACondition);
		const constraintBRows = await tables.db
			.select()
			.from(tables.rolePermissions)
			.where(constraintBCondition);

		expect(nullRows).toHaveLength(1);
		expect(nullRows[0]?.roleId).toBe(roleA);
		expect(nullRows[0]?.permissionId).toBe(permissionA);
		expect(nullRows[0]?.constraintId).toBeNull();
		expect(omittedRows).toEqual(nullRows);
		expect(constraintARows).toHaveLength(1);
		expect(constraintARows[0]?.constraintId).toBe(constraintA);
		expect(constraintBRows).toHaveLength(1);
		expect(constraintBRows[0]?.constraintId).toBe(constraintB);

		const otherRoleRows = await tables.db
			.select()
			.from(tables.rolePermissions)
			.where(buildRolePermWhere(roleB, permissionA, null));
		expect(otherRoleRows).toHaveLength(1);
		expect(otherRoleRows[0]?.roleId).toBe(roleB);

		const otherPermissionRows = await tables.db
			.select()
			.from(tables.rolePermissions)
			.where(eq(tables.rolePermissions.permissionId, permissionB));
		expect(otherPermissionRows.every((row) => row.roleId === roleA)).toBe(true);
		const filteredOtherPermission = await tables.db
			.select()
			.from(tables.rolePermissions)
			.where(buildRolePermWhere(roleA, permissionB, null));
		expect(filteredOtherPermission).toHaveLength(1);
		expect(filteredOtherPermission[0]?.permissionId).toBe(permissionB);
	});
});
