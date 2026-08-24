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

beforeAll(async () => {
	teardown = await setupDb();
	({ isAllowed } = await import("./abac"));
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

async function grantOnRole(input: {
	roleId: string;
	key: string;
	resourceType?: string;
	action?: string;
	effect?: "allow" | "deny";
	constraintId?: string | null;
}) {
	const permissionId = await fixtures.insertPermission({
		key: input.key,
		resourceType: input.resourceType ?? input.key.split(":")[0] ?? input.key,
		action:
			input.action ??
			(input.key === "*" ? "*" : input.key.split(":").slice(1).join(":") || ""),
	});
	await fixtures.insertRolePermission({
		roleId: input.roleId,
		permissionId,
		effect: input.effect ?? "allow",
		constraintId: input.constraintId ?? null,
	});
	return permissionId;
}

describe("authorization root", () => {
	test("active workspace membership plus exact workspace grant allows", async () => {
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
		await grantOnRole({ roleId: ids.workspaceRole, key: "cycle:read" });

		await expect(
			isAllowed({
				userId: ids.user,
				workspaceId: ids.workspaceA,
				permissionKey: "cycle:read",
			}),
		).resolves.toBe(true);
	});

	test("missing workspace membership denies", async () => {
		const ids = createLogicalIds();
		await fixtures.seedWorkspacesAndTeams(ids);
		await fixtures.insertWorkspaceRole({
			id: ids.workspaceRole,
			workspaceId: ids.workspaceA,
			createdBy: ids.user,
			name: "sky-governor",
		});
		await grantOnRole({ roleId: ids.workspaceRole, key: "cycle:read" });
		await fixtures.insertAssignment({
			roleId: ids.workspaceRole,
			userId: ids.user,
			workspaceId: ids.workspaceA,
			teamId: null,
			assignedBy: ids.user,
		});

		await expect(
			isAllowed({
				userId: ids.user,
				workspaceId: ids.workspaceA,
				permissionKey: "cycle:read",
			}),
		).resolves.toBe(false);
	});

	test("inactive workspace membership denies", async () => {
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
			status: "inactive",
		});
		await grantOnRole({ roleId: ids.workspaceRole, key: "cycle:read" });

		await expect(
			isAllowed({
				userId: ids.user,
				workspaceId: ids.workspaceA,
				permissionKey: "cycle:read",
			}),
		).resolves.toBe(false);
	});

	test("active team membership with missing workspace membership denies", async () => {
		const ids = createLogicalIds();
		await fixtures.seedWorkspacesAndTeams(ids);
		await fixtures.insertTeamRole({
			id: ids.teamARole,
			workspaceId: ids.workspaceA,
			teamId: ids.teamA,
			createdBy: ids.user,
			name: "cycle-reader",
		});
		await fixtures.insertTeamMembership({
			teamId: ids.teamA,
			userId: ids.user,
			roleId: ids.teamARole,
			status: "active",
		});
		await grantOnRole({ roleId: ids.teamARole, key: "cycle:read" });

		await expect(
			isAllowed({
				userId: ids.user,
				workspaceId: ids.workspaceA,
				teamId: ids.teamA,
				permissionKey: "cycle:read",
			}),
		).resolves.toBe(false);
	});

	test("stale workspace direct assignment with inactive membership denies", async () => {
		const ids = createLogicalIds();
		await fixtures.seedWorkspacesAndTeams(ids);
		const dummyRole = await fixtures.insertWorkspaceRole({
			workspaceId: ids.workspaceA,
			createdBy: ids.user,
			name: "placeholder-membership",
		});
		await fixtures.insertWorkspaceRole({
			id: ids.workspaceRole,
			workspaceId: ids.workspaceA,
			createdBy: ids.user,
			name: "sky-governor",
		});
		await fixtures.insertWorkspaceMembership({
			workspaceId: ids.workspaceA,
			userId: ids.user,
			roleId: dummyRole,
			status: "inactive",
		});
		await grantOnRole({ roleId: ids.workspaceRole, key: "cycle:read" });
		await fixtures.insertAssignment({
			roleId: ids.workspaceRole,
			userId: ids.user,
			workspaceId: ids.workspaceA,
			teamId: null,
			assignedBy: ids.user,
		});

		await expect(
			isAllowed({
				userId: ids.user,
				workspaceId: ids.workspaceA,
				permissionKey: "cycle:read",
			}),
		).resolves.toBe(false);
	});

	test("workspace membership with malformed role grants nothing", async () => {
		const ids = createLogicalIds();
		await fixtures.seedWorkspacesAndTeams(ids);
		const foreignRole = await fixtures.insertWorkspaceRole({
			workspaceId: ids.workspaceB,
			createdBy: ids.user,
			name: "other-workspace-governor",
		});
		await fixtures.insertWorkspaceMembership({
			workspaceId: ids.workspaceA,
			userId: ids.user,
			roleId: foreignRole,
			status: "active",
		});
		await grantOnRole({ roleId: foreignRole, key: "cycle:read" });

		await expect(
			isAllowed({
				userId: ids.user,
				workspaceId: ids.workspaceA,
				permissionKey: "cycle:read",
			}),
		).resolves.toBe(false);
	});

	test("valid independent workspace assignment remains eligible when an unrelated malformed row exists", async () => {
		const ids = createLogicalIds();
		await fixtures.seedWorkspacesAndTeams(ids);
		const foreignRole = await fixtures.insertWorkspaceRole({
			workspaceId: ids.workspaceB,
			createdBy: ids.user,
			name: "other-workspace-governor",
		});
		await fixtures.insertWorkspaceMembership({
			workspaceId: ids.workspaceA,
			userId: ids.user,
			roleId: foreignRole,
			status: "active",
		});
		await grantOnRole({ roleId: foreignRole, key: "cycle:read" });
		await fixtures.insertWorkspaceRole({
			id: ids.workspaceRole,
			workspaceId: ids.workspaceA,
			createdBy: ids.user,
			name: "valid-governor",
		});
		await grantOnRole({
			roleId: ids.workspaceRole,
			key: "cycle:update",
			resourceType: "cycle",
			action: "update",
		});
		await fixtures.insertAssignment({
			roleId: ids.workspaceRole,
			userId: ids.user,
			workspaceId: ids.workspaceA,
			teamId: null,
			assignedBy: ids.user,
		});

		await expect(
			isAllowed({
				userId: ids.user,
				workspaceId: ids.workspaceA,
				permissionKey: "cycle:update",
			}),
		).resolves.toBe(true);
	});

	test("a workspace membership row that references another workspace does not satisfy the authorization root", async () => {
		const ids = createLogicalIds();
		await fixtures.seedWorkspacesAndTeams(ids);
		await fixtures.insertWorkspaceRole({
			id: ids.workspaceRole,
			workspaceId: ids.workspaceB,
			createdBy: ids.user,
			name: "foreign-governor",
		});
		await fixtures.insertWorkspaceMembership({
			workspaceId: ids.workspaceB,
			userId: ids.user,
			roleId: ids.workspaceRole,
			status: "active",
		});
		await grantOnRole({ roleId: ids.workspaceRole, key: "cycle:read" });

		await expect(
			isAllowed({
				userId: ids.user,
				workspaceId: ids.workspaceA,
				permissionKey: "cycle:read",
			}),
		).resolves.toBe(false);
	});

	test("excluding a malformed candidate does not suppress an independent valid deny", async () => {
		const ids = createLogicalIds();
		await fixtures.seedWorkspacesAndTeams(ids);
		const allowRole = await fixtures.insertWorkspaceRole({
			workspaceId: ids.workspaceA,
			createdBy: ids.user,
			name: "allow-governor",
		});
		const denyRole = await fixtures.insertWorkspaceRole({
			workspaceId: ids.workspaceA,
			createdBy: ids.user,
			name: "deny-governor",
		});
		const malformedRole = await fixtures.insertRoleDefinition({
			workspaceId: ids.workspaceA,
			scopeLevel: "workspace",
			teamId: ids.teamA,
			name: "malformed-workspace-with-team",
			createdBy: ids.user,
		});
		await fixtures.insertWorkspaceMembership({
			workspaceId: ids.workspaceA,
			userId: ids.user,
			roleId: allowRole,
			status: "active",
		});
		const permissionId = await fixtures.insertExactPermission("cycle:read");
		await fixtures.insertRolePermission({
			roleId: allowRole,
			permissionId,
			effect: "allow",
		});
		await fixtures.insertRolePermission({
			roleId: denyRole,
			permissionId,
			effect: "deny",
		});
		await fixtures.insertRolePermission({
			roleId: malformedRole,
			permissionId,
			effect: "deny",
		});
		await fixtures.insertAssignment({
			roleId: denyRole,
			userId: ids.user,
			workspaceId: ids.workspaceA,
			teamId: null,
			assignedBy: ids.user,
		});
		await fixtures.insertAssignment({
			roleId: malformedRole,
			userId: ids.user,
			workspaceId: ids.workspaceA,
			teamId: ids.teamA,
			assignedBy: ids.user,
		});

		await expect(
			isAllowed({
				userId: ids.user,
				workspaceId: ids.workspaceA,
				permissionKey: "cycle:read",
			}),
		).resolves.toBe(false);
	});
});

describe("requested team validity", () => {
	test("existing team in requested workspace evaluates normally", async () => {
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
		await grantOnRole({ roleId: ids.workspaceRole, key: "cycle:read" });

		await expect(
			isAllowed({
				userId: ids.user,
				workspaceId: ids.workspaceA,
				teamId: ids.teamA,
				permissionKey: "cycle:read",
			}),
		).resolves.toBe(true);
	});

	test("nonexistent team ID denies", async () => {
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
		await grantOnRole({ roleId: ids.workspaceRole, key: "*" });

		await expect(
			isAllowed({
				userId: ids.user,
				workspaceId: ids.workspaceA,
				teamId: createId(),
				permissionKey: "cycle:read",
			}),
		).resolves.toBe(false);
	});

	test("team belonging to another workspace denies including for wildcard workspace admin", async () => {
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
		await grantOnRole({ roleId: ids.workspaceRole, key: "*:*" });

		await expect(
			isAllowed({
				userId: ids.user,
				workspaceId: ids.workspaceA,
				teamId: ids.foreignTeam,
				permissionKey: "cycle:read",
			}),
		).resolves.toBe(false);
	});

	test("null team request excludes all team-scoped roles and assignments", async () => {
		const ids = createLogicalIds();
		await fixtures.seedWorkspacesAndTeams(ids);
		const dummyWorkspaceRole = await fixtures.insertWorkspaceRole({
			workspaceId: ids.workspaceA,
			createdBy: ids.user,
			name: "placeholder-membership",
		});
		await fixtures.insertWorkspaceMembership({
			workspaceId: ids.workspaceA,
			userId: ids.user,
			roleId: dummyWorkspaceRole,
			status: "active",
		});
		await fixtures.insertTeamRole({
			id: ids.teamARole,
			workspaceId: ids.workspaceA,
			teamId: ids.teamA,
			createdBy: ids.user,
			name: "team-reader",
		});
		await fixtures.insertTeamMembership({
			teamId: ids.teamA,
			userId: ids.user,
			roleId: ids.teamARole,
			status: "active",
		});
		await grantOnRole({ roleId: ids.teamARole, key: "cycle:read" });
		await fixtures.insertAssignment({
			roleId: ids.teamARole,
			userId: ids.user,
			workspaceId: ids.workspaceA,
			teamId: ids.teamA,
			assignedBy: ids.user,
		});

		await expect(
			isAllowed({
				userId: ids.user,
				workspaceId: ids.workspaceA,
				teamId: null,
				permissionKey: "cycle:read",
			}),
		).resolves.toBe(false);
		await expect(
			isAllowed({
				userId: ids.user,
				workspaceId: ids.workspaceA,
				permissionKey: "cycle:read",
			}),
		).resolves.toBe(false);
	});
});

describe("workspace scope", () => {
	test("workspace membership role applies with no team request", async () => {
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
		await grantOnRole({ roleId: ids.workspaceRole, key: "cycle:read" });

		await expect(
			isAllowed({
				userId: ids.user,
				workspaceId: ids.workspaceA,
				permissionKey: "cycle:read",
			}),
		).resolves.toBe(true);
	});

	test("workspace membership role applies to every public and private team without team membership", async () => {
		const ids = createLogicalIds();
		await fixtures.seedWorkspacesAndTeams(ids);
		await fixtures.insertWorkspaceRole({
			id: ids.workspaceRole,
			workspaceId: ids.workspaceA,
			createdBy: ids.user,
			name: "purple-banana-admin",
		});
		await fixtures.insertWorkspaceMembership({
			workspaceId: ids.workspaceA,
			userId: ids.user,
			roleId: ids.workspaceRole,
			status: "active",
		});
		await grantOnRole({ roleId: ids.workspaceRole, key: "*:*" });

		await expect(
			isAllowed({
				userId: ids.user,
				workspaceId: ids.workspaceA,
				teamId: ids.teamA,
				permissionKey: "cycle:manage_settings",
			}),
		).resolves.toBe(true);
		await expect(
			isAllowed({
				userId: ids.user,
				workspaceId: ids.workspaceA,
				teamId: ids.teamB,
				permissionKey: "cycle:manage_settings",
			}),
		).resolves.toBe(true);
	});

	test("workspace direct assignment with null assignment team applies globally", async () => {
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
		await fixtures.insertWorkspaceRole({
			id: ids.workspaceRole,
			workspaceId: ids.workspaceA,
			createdBy: ids.user,
			name: "assigned-governor",
		});
		await grantOnRole({ roleId: ids.workspaceRole, key: "cycle:read" });
		await fixtures.insertAssignment({
			roleId: ids.workspaceRole,
			userId: ids.user,
			workspaceId: ids.workspaceA,
			teamId: null,
			assignedBy: ids.user,
		});

		await expect(
			isAllowed({
				userId: ids.user,
				workspaceId: ids.workspaceA,
				teamId: ids.teamB,
				permissionKey: "cycle:read",
			}),
		).resolves.toBe(true);
	});

	test("workspace role assigned with non-null team is ignored", async () => {
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
		await fixtures.insertWorkspaceRole({
			id: ids.workspaceRole,
			workspaceId: ids.workspaceA,
			createdBy: ids.user,
			name: "assigned-governor",
		});
		await grantOnRole({ roleId: ids.workspaceRole, key: "cycle:read" });
		await fixtures.insertAssignment({
			roleId: ids.workspaceRole,
			userId: ids.user,
			workspaceId: ids.workspaceA,
			teamId: ids.teamA,
			assignedBy: ids.user,
		});

		await expect(
			isAllowed({
				userId: ids.user,
				workspaceId: ids.workspaceA,
				teamId: ids.teamA,
				permissionKey: "cycle:read",
			}),
		).resolves.toBe(false);
	});

	test("workspace role from another workspace is ignored", async () => {
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
		const foreignRole = await fixtures.insertWorkspaceRole({
			workspaceId: ids.workspaceB,
			createdBy: ids.user,
			name: "foreign-governor",
		});
		await grantOnRole({ roleId: foreignRole, key: "cycle:read" });
		await fixtures.insertAssignment({
			roleId: foreignRole,
			userId: ids.user,
			workspaceId: ids.workspaceA,
			teamId: null,
			assignedBy: ids.user,
		});

		await expect(
			isAllowed({
				userId: ids.user,
				workspaceId: ids.workspaceA,
				permissionKey: "cycle:read",
			}),
		).resolves.toBe(false);
	});

	test("arbitrarily named workspace wildcard role behaves identically to any other workspace grant", async () => {
		const ids = createLogicalIds();
		await fixtures.seedWorkspacesAndTeams(ids);
		await fixtures.insertWorkspaceRole({
			id: ids.workspaceRole,
			workspaceId: ids.workspaceA,
			createdBy: ids.user,
			name: "not-admin-not-member-not-lead",
		});
		await fixtures.insertWorkspaceMembership({
			workspaceId: ids.workspaceA,
			userId: ids.user,
			roleId: ids.workspaceRole,
			status: "active",
		});
		await grantOnRole({ roleId: ids.workspaceRole, key: "*" });

		await expect(
			isAllowed({
				userId: ids.user,
				workspaceId: ids.workspaceA,
				teamId: ids.teamB,
				permissionKey: "issue:read",
			}),
		).resolves.toBe(true);
	});
});

describe("team scope", () => {
	async function seedTeamGrant(ids: ReturnType<typeof createLogicalIds>) {
		await fixtures.seedWorkspacesAndTeams(ids);
		const dummyWorkspaceRole = await fixtures.insertWorkspaceRole({
			workspaceId: ids.workspaceA,
			createdBy: ids.user,
			name: "placeholder-membership",
		});
		await fixtures.insertWorkspaceMembership({
			workspaceId: ids.workspaceA,
			userId: ids.user,
			roleId: dummyWorkspaceRole,
			status: "active",
		});
		await fixtures.insertTeamRole({
			id: ids.teamARole,
			workspaceId: ids.workspaceA,
			teamId: ids.teamA,
			createdBy: ids.user,
			name: "orchid-contributor",
		});
		await grantOnRole({ roleId: ids.teamARole, key: "cycle:read" });
	}

	test("team membership role allows exact team", async () => {
		const ids = createLogicalIds();
		await seedTeamGrant(ids);
		await fixtures.insertTeamMembership({
			teamId: ids.teamA,
			userId: ids.user,
			roleId: ids.teamARole,
			status: "active",
		});

		await expect(
			isAllowed({
				userId: ids.user,
				workspaceId: ids.workspaceA,
				teamId: ids.teamA,
				permissionKey: "cycle:read",
			}),
		).resolves.toBe(true);
	});

	test("same team role does not allow another team", async () => {
		const ids = createLogicalIds();
		await seedTeamGrant(ids);
		await fixtures.insertTeamMembership({
			teamId: ids.teamA,
			userId: ids.user,
			roleId: ids.teamARole,
			status: "active",
		});

		await expect(
			isAllowed({
				userId: ids.user,
				workspaceId: ids.workspaceA,
				teamId: ids.teamB,
				permissionKey: "cycle:read",
			}),
		).resolves.toBe(false);
	});

	test("team-scoped direct assignment allows when exact-team membership is active", async () => {
		const ids = createLogicalIds();
		await seedTeamGrant(ids);
		const dummyTeamRole = await fixtures.insertTeamRole({
			workspaceId: ids.workspaceA,
			teamId: ids.teamA,
			createdBy: ids.user,
			name: "placeholder-team-membership",
		});
		await fixtures.insertTeamMembership({
			teamId: ids.teamA,
			userId: ids.user,
			roleId: dummyTeamRole,
			status: "active",
		});
		await fixtures.insertAssignment({
			roleId: ids.teamARole,
			userId: ids.user,
			workspaceId: ids.workspaceA,
			teamId: ids.teamA,
			assignedBy: ids.user,
		});

		await expect(
			isAllowed({
				userId: ids.user,
				workspaceId: ids.workspaceA,
				teamId: ids.teamA,
				permissionKey: "cycle:read",
			}),
		).resolves.toBe(true);
	});

	test("team role requires active exact-team membership", async () => {
		const ids = createLogicalIds();
		await seedTeamGrant(ids);
		await fixtures.insertAssignment({
			roleId: ids.teamARole,
			userId: ids.user,
			workspaceId: ids.workspaceA,
			teamId: ids.teamA,
			assignedBy: ids.user,
		});

		await expect(
			isAllowed({
				userId: ids.user,
				workspaceId: ids.workspaceA,
				teamId: ids.teamA,
				permissionKey: "cycle:read",
			}),
		).resolves.toBe(false);
	});

	test("inactive team membership denies", async () => {
		const ids = createLogicalIds();
		await seedTeamGrant(ids);
		await fixtures.insertTeamMembership({
			teamId: ids.teamA,
			userId: ids.user,
			roleId: ids.teamARole,
			status: "inactive",
		});
		await fixtures.insertAssignment({
			roleId: ids.teamARole,
			userId: ids.user,
			workspaceId: ids.workspaceA,
			teamId: ids.teamA,
			assignedBy: ids.user,
		});

		await expect(
			isAllowed({
				userId: ids.user,
				workspaceId: ids.workspaceA,
				teamId: ids.teamA,
				permissionKey: "cycle:read",
			}),
		).resolves.toBe(false);
	});

	test("removed team membership invalidates direct team assignment", async () => {
		const ids = createLogicalIds();
		await seedTeamGrant(ids);
		const membershipId = await fixtures.insertTeamMembership({
			teamId: ids.teamA,
			userId: ids.user,
			roleId: ids.teamARole,
			status: "active",
		});
		await fixtures.insertAssignment({
			roleId: ids.teamARole,
			userId: ids.user,
			workspaceId: ids.workspaceA,
			teamId: ids.teamA,
			assignedBy: ids.user,
		});
		await tables.db
			.delete(tables.teamMembership)
			.where(eq(tables.teamMembership.id, membershipId));

		await expect(
			isAllowed({
				userId: ids.user,
				workspaceId: ids.workspaceA,
				teamId: ids.teamA,
				permissionKey: "cycle:read",
			}),
		).resolves.toBe(false);
	});

	test("team assignment with null team is ignored", async () => {
		const ids = createLogicalIds();
		await seedTeamGrant(ids);
		const dummyTeamRole = await fixtures.insertTeamRole({
			workspaceId: ids.workspaceA,
			teamId: ids.teamA,
			createdBy: ids.user,
			name: "placeholder-team-membership",
		});
		await fixtures.insertTeamMembership({
			teamId: ids.teamA,
			userId: ids.user,
			roleId: dummyTeamRole,
			status: "active",
		});
		await fixtures.insertAssignment({
			roleId: ids.teamARole,
			userId: ids.user,
			workspaceId: ids.workspaceA,
			teamId: null,
			assignedBy: ids.user,
		});

		await expect(
			isAllowed({
				userId: ids.user,
				workspaceId: ids.workspaceA,
				teamId: ids.teamA,
				permissionKey: "cycle:read",
			}),
		).resolves.toBe(false);
	});

	test("team assignment to wrong team is ignored", async () => {
		const ids = createLogicalIds();
		await seedTeamGrant(ids);
		const dummyTeamRole = await fixtures.insertTeamRole({
			workspaceId: ids.workspaceA,
			teamId: ids.teamA,
			createdBy: ids.user,
			name: "placeholder-team-membership",
		});
		await fixtures.insertTeamMembership({
			teamId: ids.teamA,
			userId: ids.user,
			roleId: dummyTeamRole,
			status: "active",
		});
		await fixtures.insertAssignment({
			roleId: ids.teamARole,
			userId: ids.user,
			workspaceId: ids.workspaceA,
			teamId: ids.teamB,
			assignedBy: ids.user,
		});

		await expect(
			isAllowed({
				userId: ids.user,
				workspaceId: ids.workspaceA,
				teamId: ids.teamA,
				permissionKey: "cycle:read",
			}),
		).resolves.toBe(false);
	});

	test("team role definition whose team disagrees with membership or assignment is ignored", async () => {
		const ids = createLogicalIds();
		await fixtures.seedWorkspacesAndTeams(ids);
		const dummyWorkspaceRole = await fixtures.insertWorkspaceRole({
			workspaceId: ids.workspaceA,
			createdBy: ids.user,
			name: "placeholder-membership",
		});
		await fixtures.insertWorkspaceMembership({
			workspaceId: ids.workspaceA,
			userId: ids.user,
			roleId: dummyWorkspaceRole,
			status: "active",
		});
		const mismatchedRole = await fixtures.insertTeamRole({
			workspaceId: ids.workspaceA,
			teamId: ids.teamB,
			createdBy: ids.user,
			name: "wrong-team-role",
		});
		await grantOnRole({ roleId: mismatchedRole, key: "cycle:read" });
		await fixtures.insertTeamMembership({
			teamId: ids.teamA,
			userId: ids.user,
			roleId: mismatchedRole,
			status: "active",
		});
		await fixtures.insertAssignment({
			roleId: mismatchedRole,
			userId: ids.user,
			workspaceId: ids.workspaceA,
			teamId: ids.teamA,
			assignedBy: ids.user,
		});

		await expect(
			isAllowed({
				userId: ids.user,
				workspaceId: ids.workspaceA,
				teamId: ids.teamA,
				permissionKey: "cycle:read",
			}),
		).resolves.toBe(false);
	});

	test("arbitrary team role names behave identically", async () => {
		const ids = createLogicalIds();
		await fixtures.seedWorkspacesAndTeams(ids);
		const dummyWorkspaceRole = await fixtures.insertWorkspaceRole({
			workspaceId: ids.workspaceA,
			createdBy: ids.user,
			name: "placeholder-membership",
		});
		await fixtures.insertWorkspaceMembership({
			workspaceId: ids.workspaceA,
			userId: ids.user,
			roleId: dummyWorkspaceRole,
			status: "active",
		});
		await fixtures.insertTeamRole({
			id: ids.teamARole,
			workspaceId: ids.workspaceA,
			teamId: ids.teamA,
			createdBy: ids.user,
			name: "not-lead-not-admin",
		});
		await grantOnRole({ roleId: ids.teamARole, key: "cycle:read" });
		await fixtures.insertTeamMembership({
			teamId: ids.teamA,
			userId: ids.user,
			roleId: ids.teamARole,
			status: "active",
		});

		await expect(
			isAllowed({
				userId: ids.user,
				workspaceId: ids.workspaceA,
				teamId: ids.teamA,
				permissionKey: "cycle:read",
			}),
		).resolves.toBe(true);
	});
});

async function seedWorkspaceAllow(
	ids: ReturnType<typeof createLogicalIds>,
	permissionKey = "cycle:read",
) {
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
	return grantOnRole({ roleId: ids.workspaceRole, key: permissionKey });
}

describe("malformed candidates", () => {
	test("role definition whose declared scope disagrees with its team value is ignored", async () => {
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
		const disagreeingWorkspace = await fixtures.insertRoleDefinition({
			workspaceId: ids.workspaceA,
			scopeLevel: "workspace",
			teamId: ids.teamA,
			name: "workspace-role-with-team",
			createdBy: ids.user,
		});
		const disagreeingTeam = await fixtures.insertRoleDefinition({
			workspaceId: ids.workspaceA,
			scopeLevel: "team",
			teamId: null,
			name: "team-role-without-team",
			createdBy: ids.user,
		});
		const permissionId = await fixtures.insertExactPermission("cycle:read");
		await fixtures.insertRolePermission({
			roleId: disagreeingWorkspace,
			permissionId,
			effect: "allow",
		});
		await fixtures.insertRolePermission({
			roleId: disagreeingTeam,
			permissionId,
			effect: "allow",
		});
		await fixtures.insertAssignment({
			roleId: disagreeingWorkspace,
			userId: ids.user,
			workspaceId: ids.workspaceA,
			teamId: null,
			assignedBy: ids.user,
		});
		await fixtures.insertAssignment({
			roleId: disagreeingTeam,
			userId: ids.user,
			workspaceId: ids.workspaceA,
			teamId: ids.teamA,
			assignedBy: ids.user,
		});

		await expect(
			isAllowed({
				userId: ids.user,
				workspaceId: ids.workspaceA,
				teamId: ids.teamA,
				permissionKey: "cycle:read",
			}),
		).resolves.toBe(false);
	});

	test("internally inconsistent permission catalog row is ignored", async () => {
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
		const permissionId = await fixtures.insertPermission({
			key: "cycle:read",
			resourceType: "issue",
			action: "read",
		});
		await fixtures.insertRolePermission({
			roleId: ids.workspaceRole,
			permissionId,
			effect: "allow",
		});

		await expect(
			isAllowed({
				userId: ids.user,
				workspaceId: ids.workspaceA,
				permissionKey: "cycle:read",
			}),
		).resolves.toBe(false);
	});

	test("cross-workspace team-role and team-membership candidates do not grant access", async () => {
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
		const foreignTeamRole = await fixtures.insertTeamRole({
			workspaceId: ids.workspaceB,
			teamId: ids.foreignTeam,
			createdBy: ids.user,
			name: "foreign-team-role",
		});
		await grantOnRole({ roleId: foreignTeamRole, key: "cycle:read" });
		await fixtures.insertTeamMembership({
			teamId: ids.teamA,
			userId: ids.user,
			roleId: foreignTeamRole,
			status: "active",
		});
		await fixtures.insertTeamMembership({
			teamId: ids.foreignTeam,
			userId: ids.user,
			roleId: foreignTeamRole,
			status: "active",
		});
		await fixtures.insertAssignment({
			roleId: foreignTeamRole,
			userId: ids.user,
			workspaceId: ids.workspaceA,
			teamId: ids.teamA,
			assignedBy: ids.user,
		});

		await expect(
			isAllowed({
				userId: ids.user,
				workspaceId: ids.workspaceA,
				teamId: ids.teamA,
				permissionKey: "cycle:read",
			}),
		).resolves.toBe(false);
	});

	test("excluding a malformed candidate does not poison an unrelated valid grant", async () => {
		const ids = createLogicalIds();
		await fixtures.seedWorkspacesAndTeams(ids);
		await fixtures.insertWorkspaceRole({
			id: ids.workspaceRole,
			workspaceId: ids.workspaceA,
			createdBy: ids.user,
			name: "valid-governor",
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
		const malformedRole = await fixtures.insertRoleDefinition({
			workspaceId: ids.workspaceA,
			scopeLevel: "team",
			teamId: null,
			name: "globalized-team-role",
			createdBy: ids.user,
		});
		await fixtures.insertRolePermission({
			roleId: malformedRole,
			permissionId,
			effect: "allow",
		});
		await fixtures.insertAssignment({
			roleId: malformedRole,
			userId: ids.user,
			workspaceId: ids.workspaceA,
			teamId: null,
			assignedBy: ids.user,
		});

		await expect(
			isAllowed({
				userId: ids.user,
				workspaceId: ids.workspaceA,
				permissionKey: "cycle:read",
			}),
		).resolves.toBe(true);
	});
});

describe("permission patterns", () => {
	async function seedCatalogPattern(pattern: {
		key: string;
		resourceType: string;
		action: string;
	}) {
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
		const permissionId = await fixtures.insertPermission(pattern);
		await fixtures.insertRolePermission({
			roleId: ids.workspaceRole,
			permissionId,
			effect: "allow",
		});
		return ids;
	}

	test("exact cycle:read matches request cycle:read", async () => {
		const ids = await seedCatalogPattern({
			key: "cycle:read",
			resourceType: "cycle",
			action: "read",
		});
		await expect(
			isAllowed({
				userId: ids.user,
				workspaceId: ids.workspaceA,
				permissionKey: "cycle:read",
			}),
		).resolves.toBe(true);
	});

	test("cycle:* matches cycle:read", async () => {
		const ids = await seedCatalogPattern({
			key: "cycle:*",
			resourceType: "cycle",
			action: "*",
		});
		await expect(
			isAllowed({
				userId: ids.user,
				workspaceId: ids.workspaceA,
				permissionKey: "cycle:read",
			}),
		).resolves.toBe(true);
	});

	test("*:read matches cycle:read", async () => {
		const ids = await seedCatalogPattern({
			key: "*:read",
			resourceType: "*",
			action: "read",
		});
		await expect(
			isAllowed({
				userId: ids.user,
				workspaceId: ids.workspaceA,
				permissionKey: "cycle:read",
			}),
		).resolves.toBe(true);
	});

	test("*:* matches cycle:read", async () => {
		const ids = await seedCatalogPattern({
			key: "*:*",
			resourceType: "*",
			action: "*",
		});
		await expect(
			isAllowed({
				userId: ids.user,
				workspaceId: ids.workspaceA,
				permissionKey: "cycle:read",
			}),
		).resolves.toBe(true);
	});

	test("* is equivalent to *:* and matches cycle:read", async () => {
		const ids = await seedCatalogPattern({
			key: "*",
			resourceType: "*",
			action: "*",
		});
		await expect(
			isAllowed({
				userId: ids.user,
				workspaceId: ids.workspaceA,
				permissionKey: "cycle:read",
			}),
		).resolves.toBe(true);
	});

	test("cycle:update does not match request cycle:read", async () => {
		const ids = await seedCatalogPattern({
			key: "cycle:update",
			resourceType: "cycle",
			action: "update",
		});
		await expect(
			isAllowed({
				userId: ids.user,
				workspaceId: ids.workspaceA,
				permissionKey: "cycle:read",
			}),
		).resolves.toBe(false);
	});

	test("issue:read does not match request cycle:read", async () => {
		const ids = await seedCatalogPattern({
			key: "issue:read",
			resourceType: "issue",
			action: "read",
		});
		await expect(
			isAllowed({
				userId: ids.user,
				workspaceId: ids.workspaceA,
				permissionKey: "cycle:read",
			}),
		).resolves.toBe(false);
	});

	test("malformed catalog cycle does not match", async () => {
		const ids = await seedCatalogPattern({
			key: "cycle",
			resourceType: "cycle",
			action: "cycle",
		});
		await expect(
			isAllowed({
				userId: ids.user,
				workspaceId: ids.workspaceA,
				permissionKey: "cycle:read",
			}),
		).resolves.toBe(false);
	});

	test("malformed catalog cycle: does not match", async () => {
		const ids = await seedCatalogPattern({
			key: "cycle:",
			resourceType: "cycle",
			action: "",
		});
		await expect(
			isAllowed({
				userId: ids.user,
				workspaceId: ids.workspaceA,
				permissionKey: "cycle:read",
			}),
		).resolves.toBe(false);
	});

	test("malformed catalog:read does not match", async () => {
		const ids = await seedCatalogPattern({
			key: ":read",
			resourceType: "",
			action: "read",
		});
		await expect(
			isAllowed({
				userId: ids.user,
				workspaceId: ids.workspaceA,
				permissionKey: "cycle:read",
			}),
		).resolves.toBe(false);
	});

	test("malformed catalog cycle:read:extra does not match", async () => {
		const ids = await seedCatalogPattern({
			key: "cycle:read:extra",
			resourceType: "cycle",
			action: "read:extra",
		});
		await expect(
			isAllowed({
				userId: ids.user,
				workspaceId: ids.workspaceA,
				permissionKey: "cycle:read",
			}),
		).resolves.toBe(false);
	});

	test("invalid wildcard placement does not match", async () => {
		for (const pattern of [
			{ key: "cy*cle:read", resourceType: "cy*cle", action: "read" },
			{ key: "cycle:r*", resourceType: "cycle", action: "r*" },
			{ key: "**:*", resourceType: "**", action: "*" },
		] as const) {
			await truncateAuthorizationTables(tables.db);
			const ids = await seedCatalogPattern(pattern);
			await expect(
				isAllowed({
					userId: ids.user,
					workspaceId: ids.workspaceA,
					permissionKey: "cycle:read",
				}),
			).resolves.toBe(false);
		}
	});

	test("matching is case-sensitive", async () => {
		const ids = await seedCatalogPattern({
			key: "Cycle:read",
			resourceType: "Cycle",
			action: "read",
		});
		await expect(
			isAllowed({
				userId: ids.user,
				workspaceId: ids.workspaceA,
				permissionKey: "cycle:read",
			}),
		).resolves.toBe(false);
	});

	test("prefix suffix and substring keys do not match", async () => {
		for (const pattern of [
			{ key: "cycle:reader", resourceType: "cycle", action: "reader" },
			{ key: "mycycle:read", resourceType: "mycycle", action: "read" },
		] as const) {
			await truncateAuthorizationTables(tables.db);
			const ids = await seedCatalogPattern(pattern);
			await expect(
				isAllowed({
					userId: ids.user,
					workspaceId: ids.workspaceA,
					permissionKey: "cycle:read",
				}),
			).resolves.toBe(false);
		}
	});

	test("malformed requested permission keys deny without matching grants", async () => {
		const ids = await seedCatalogPattern({
			key: "cycle:read",
			resourceType: "cycle",
			action: "read",
		});
		for (const permissionKey of [
			"cycle",
			"cycle:",
			":read",
			"cycle:read:extra",
			"*",
		]) {
			await expect(
				isAllowed({
					userId: ids.user,
					workspaceId: ids.workspaceA,
					permissionKey,
				}),
			).resolves.toBe(false);
		}
	});
});

describe("deny precedence", () => {
	test("workspace allow plus workspace deny is deny", async () => {
		const ids = createLogicalIds();
		await seedWorkspaceAllow(ids);
		const denyRole = await fixtures.insertWorkspaceRole({
			workspaceId: ids.workspaceA,
			createdBy: ids.user,
			name: "workspace-deny",
		});
		const permissionId = (
			await tables.db.select().from(tables.permissionsCatalog)
		)[0]?.id;
		if (!permissionId) throw new Error("expected permission");
		await fixtures.insertRolePermission({
			roleId: denyRole,
			permissionId,
			effect: "deny",
		});
		await fixtures.insertAssignment({
			roleId: denyRole,
			userId: ids.user,
			workspaceId: ids.workspaceA,
			teamId: null,
			assignedBy: ids.user,
		});

		await expect(
			isAllowed({
				userId: ids.user,
				workspaceId: ids.workspaceA,
				permissionKey: "cycle:read",
			}),
		).resolves.toBe(false);
	});

	test("workspace allow plus team deny is deny", async () => {
		const ids = createLogicalIds();
		await seedWorkspaceAllow(ids);
		await fixtures.insertTeamRole({
			id: ids.teamARole,
			workspaceId: ids.workspaceA,
			teamId: ids.teamA,
			createdBy: ids.user,
			name: "team-deny",
		});
		const permissionId = (
			await tables.db.select().from(tables.permissionsCatalog)
		)[0]?.id;
		if (!permissionId) throw new Error("expected permission");
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

		await expect(
			isAllowed({
				userId: ids.user,
				workspaceId: ids.workspaceA,
				teamId: ids.teamA,
				permissionKey: "cycle:read",
			}),
		).resolves.toBe(false);
	});

	test("team allow plus workspace deny is deny", async () => {
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
			name: "team-allow",
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
		const denyRole = await fixtures.insertWorkspaceRole({
			workspaceId: ids.workspaceA,
			createdBy: ids.user,
			name: "workspace-deny",
		});
		await fixtures.insertRolePermission({
			roleId: denyRole,
			permissionId,
			effect: "deny",
		});
		await fixtures.insertAssignment({
			roleId: denyRole,
			userId: ids.user,
			workspaceId: ids.workspaceA,
			teamId: null,
			assignedBy: ids.user,
		});

		await expect(
			isAllowed({
				userId: ids.user,
				workspaceId: ids.workspaceA,
				teamId: ids.teamA,
				permissionKey: "cycle:read",
			}),
		).resolves.toBe(false);
	});

	test("multiple allows with no deny allow", async () => {
		const ids = createLogicalIds();
		await seedWorkspaceAllow(ids);
		const secondAllow = await fixtures.insertWorkspaceRole({
			workspaceId: ids.workspaceA,
			createdBy: ids.user,
			name: "second-allow",
		});
		const permissionId = (
			await tables.db.select().from(tables.permissionsCatalog)
		)[0]?.id;
		if (!permissionId) throw new Error("expected permission");
		await fixtures.insertRolePermission({
			roleId: secondAllow,
			permissionId,
			effect: "allow",
		});
		await fixtures.insertAssignment({
			roleId: secondAllow,
			userId: ids.user,
			workspaceId: ids.workspaceA,
			teamId: null,
			assignedBy: ids.user,
		});

		await expect(
			isAllowed({
				userId: ids.user,
				workspaceId: ids.workspaceA,
				permissionKey: "cycle:read",
			}),
		).resolves.toBe(true);
	});

	test("deny for a different permission does not affect", async () => {
		const ids = createLogicalIds();
		await seedWorkspaceAllow(ids);
		const denyRole = await fixtures.insertWorkspaceRole({
			workspaceId: ids.workspaceA,
			createdBy: ids.user,
			name: "other-deny",
		});
		await grantOnRole({
			roleId: denyRole,
			key: "cycle:update",
			effect: "deny",
		});
		await fixtures.insertAssignment({
			roleId: denyRole,
			userId: ids.user,
			workspaceId: ids.workspaceA,
			teamId: null,
			assignedBy: ids.user,
		});

		await expect(
			isAllowed({
				userId: ids.user,
				workspaceId: ids.workspaceA,
				permissionKey: "cycle:read",
			}),
		).resolves.toBe(true);
	});

	test("constrained deny matching is deny", async () => {
		const ids = createLogicalIds();
		await seedWorkspaceAllow(ids);
		const denyRole = await fixtures.insertWorkspaceRole({
			workspaceId: ids.workspaceA,
			createdBy: ids.user,
			name: "constrained-deny",
		});
		const constraintId = await fixtures.insertConstraint({
			workspaceId: ids.workspaceA,
			scopeLevel: "workspace",
			predicateJson: {
				subject: { attribute_equals: { user_clearance: "secret" } },
			},
		});
		const permissionId = (
			await tables.db.select().from(tables.permissionsCatalog)
		)[0]?.id;
		if (!permissionId) throw new Error("expected permission");
		await fixtures.insertRolePermission({
			roleId: denyRole,
			permissionId,
			effect: "deny",
			constraintId,
		});
		await fixtures.insertAssignment({
			roleId: denyRole,
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

		await expect(
			isAllowed({
				userId: ids.user,
				workspaceId: ids.workspaceA,
				permissionKey: "cycle:read",
			}),
		).resolves.toBe(false);
	});

	test("constrained deny not matching leaves valid allow", async () => {
		const ids = createLogicalIds();
		await seedWorkspaceAllow(ids);
		const denyRole = await fixtures.insertWorkspaceRole({
			workspaceId: ids.workspaceA,
			createdBy: ids.user,
			name: "constrained-deny",
		});
		const constraintId = await fixtures.insertConstraint({
			workspaceId: ids.workspaceA,
			scopeLevel: "workspace",
			predicateJson: {
				subject: { attribute_equals: { user_clearance: "secret" } },
			},
		});
		const permissionId = (
			await tables.db.select().from(tables.permissionsCatalog)
		)[0]?.id;
		if (!permissionId) throw new Error("expected permission");
		await fixtures.insertRolePermission({
			roleId: denyRole,
			permissionId,
			effect: "deny",
			constraintId,
		});
		await fixtures.insertAssignment({
			roleId: denyRole,
			userId: ids.user,
			workspaceId: ids.workspaceA,
			teamId: null,
			assignedBy: ids.user,
		});
		await fixtures.insertEntityAttribute({
			entityType: "user",
			entityId: ids.user,
			key: "user_clearance",
			value: "public",
			userId: ids.user,
		});

		await expect(
			isAllowed({
				userId: ids.user,
				workspaceId: ids.workspaceA,
				permissionKey: "cycle:read",
			}),
		).resolves.toBe(true);
	});

	test("malformed deny candidate is excluded and does not become a global deny", async () => {
		const ids = createLogicalIds();
		await seedWorkspaceAllow(ids);
		const malformedDeny = await fixtures.insertRoleDefinition({
			workspaceId: ids.workspaceA,
			scopeLevel: "workspace",
			teamId: ids.teamA,
			name: "malformed-deny",
			createdBy: ids.user,
		});
		const permissionId = (
			await tables.db.select().from(tables.permissionsCatalog)
		)[0]?.id;
		if (!permissionId) throw new Error("expected permission");
		await fixtures.insertRolePermission({
			roleId: malformedDeny,
			permissionId,
			effect: "deny",
		});
		await fixtures.insertAssignment({
			roleId: malformedDeny,
			userId: ids.user,
			workspaceId: ids.workspaceA,
			teamId: ids.teamA,
			assignedBy: ids.user,
		});

		await expect(
			isAllowed({
				userId: ids.user,
				workspaceId: ids.workspaceA,
				permissionKey: "cycle:read",
			}),
		).resolves.toBe(true);
	});

	test("cross-workspace deny is excluded", async () => {
		const ids = createLogicalIds();
		await seedWorkspaceAllow(ids);
		const foreignDeny = await fixtures.insertWorkspaceRole({
			workspaceId: ids.workspaceB,
			createdBy: ids.user,
			name: "foreign-deny",
		});
		const permissionId = (
			await tables.db.select().from(tables.permissionsCatalog)
		)[0]?.id;
		if (!permissionId) throw new Error("expected permission");
		await fixtures.insertRolePermission({
			roleId: foreignDeny,
			permissionId,
			effect: "deny",
		});
		await fixtures.insertAssignment({
			roleId: foreignDeny,
			userId: ids.user,
			workspaceId: ids.workspaceA,
			teamId: null,
			assignedBy: ids.user,
		});

		await expect(
			isAllowed({
				userId: ids.user,
				workspaceId: ids.workspaceA,
				permissionKey: "cycle:read",
			}),
		).resolves.toBe(true);
	});
});

async function seedConstrainedWorkspaceGrant(input: {
	ids: ReturnType<typeof createLogicalIds>;
	predicateJson: unknown;
	constraintWorkspaceId?: string;
	constraintScopeLevel?: "workspace" | "team";
}) {
	const { ids } = input;
	await fixtures.seedWorkspacesAndTeams(ids);
	await fixtures.insertWorkspaceRole({
		id: ids.workspaceRole,
		workspaceId: ids.workspaceA,
		createdBy: ids.user,
		name: "constrained-governor",
	});
	await fixtures.insertWorkspaceMembership({
		workspaceId: ids.workspaceA,
		userId: ids.user,
		roleId: ids.workspaceRole,
		status: "active",
	});
	const constraintId = await fixtures.insertConstraint({
		workspaceId: input.constraintWorkspaceId ?? ids.workspaceA,
		scopeLevel: input.constraintScopeLevel ?? "workspace",
		predicateJson: input.predicateJson,
	});
	const permissionId = await fixtures.insertExactPermission("cycle:read");
	await fixtures.insertRolePermission({
		roleId: ids.workspaceRole,
		permissionId,
		effect: "allow",
		constraintId,
	});
	return { constraintId, permissionId };
}

describe("constraints", () => {
	test("null constraint matches", async () => {
		const ids = createLogicalIds();
		await seedWorkspaceAllow(ids);
		await expect(
			isAllowed({
				userId: ids.user,
				workspaceId: ids.workspaceA,
				permissionKey: "cycle:read",
			}),
		).resolves.toBe(true);
	});

	test("{always:true} matches", async () => {
		const ids = createLogicalIds();
		await seedConstrainedWorkspaceGrant({
			ids,
			predicateJson: { always: true },
		});
		await expect(
			isAllowed({
				userId: ids.user,
				workspaceId: ids.workspaceA,
				permissionKey: "cycle:read",
			}),
		).resolves.toBe(true);
	});

	test("{always:false} fails", async () => {
		const ids = createLogicalIds();
		await seedConstrainedWorkspaceGrant({
			ids,
			predicateJson: { always: false },
		});
		await expect(
			isAllowed({
				userId: ids.user,
				workspaceId: ids.workspaceA,
				permissionKey: "cycle:read",
			}),
		).resolves.toBe(false);
	});

	test("subject equality matches when every key is present and equal", async () => {
		const ids = createLogicalIds();
		await seedConstrainedWorkspaceGrant({
			ids,
			predicateJson: {
				subject: {
					attribute_equals: { user_dept: "eng", user_level: 3 },
				},
			},
		});
		await fixtures.insertEntityAttribute({
			entityType: "user",
			entityId: ids.user,
			key: "user_dept",
			value: "eng",
			userId: ids.user,
		});
		await fixtures.insertEntityAttribute({
			entityType: "user",
			entityId: ids.user,
			key: "user_level",
			value: 3,
			userId: ids.user,
		});
		await expect(
			isAllowed({
				userId: ids.user,
				workspaceId: ids.workspaceA,
				permissionKey: "cycle:read",
			}),
		).resolves.toBe(true);
	});

	test("missing equality key fails", async () => {
		const ids = createLogicalIds();
		await seedConstrainedWorkspaceGrant({
			ids,
			predicateJson: {
				subject: {
					attribute_equals: { user_dept: "eng", user_level: 3 },
				},
			},
		});
		await fixtures.insertEntityAttribute({
			entityType: "user",
			entityId: ids.user,
			key: "user_dept",
			value: "eng",
			userId: ids.user,
		});
		await expect(
			isAllowed({
				userId: ids.user,
				workspaceId: ids.workspaceA,
				permissionKey: "cycle:read",
			}),
		).resolves.toBe(false);
	});

	test("strictly unequal value fails", async () => {
		const ids = createLogicalIds();
		await seedConstrainedWorkspaceGrant({
			ids,
			predicateJson: {
				subject: { attribute_equals: { user_dept: "eng" } },
			},
		});
		await fixtures.insertEntityAttribute({
			entityType: "user",
			entityId: ids.user,
			key: "user_dept",
			value: "design",
			userId: ids.user,
		});
		await expect(
			isAllowed({
				userId: ids.user,
				workspaceId: ids.workspaceA,
				permissionKey: "cycle:read",
			}),
		).resolves.toBe(false);
	});

	test("subject.attribute_equals fails on strict type inequality", async () => {
		const ids = createLogicalIds();
		await seedConstrainedWorkspaceGrant({
			ids,
			predicateJson: {
				subject: { attribute_equals: { user_level: 3 } },
			},
		});
		await fixtures.insertEntityAttribute({
			entityType: "user",
			entityId: ids.user,
			key: "user_level",
			value: "3",
			userId: ids.user,
		});
		await expect(
			isAllowed({
				userId: ids.user,
				workspaceId: ids.workspaceA,
				permissionKey: "cycle:read",
			}),
		).resolves.toBe(false);
	});

	test("empty equality object matches", async () => {
		const ids = createLogicalIds();
		await seedConstrainedWorkspaceGrant({
			ids,
			predicateJson: { subject: { attribute_equals: {} } },
		});
		await expect(
			isAllowed({
				userId: ids.user,
				workspaceId: ids.workspaceA,
				permissionKey: "cycle:read",
			}),
		).resolves.toBe(true);
	});

	test("non-object predicate fails", async () => {
		const ids = createLogicalIds();
		await seedConstrainedWorkspaceGrant({
			ids,
			predicateJson: true,
		});
		await expect(
			isAllowed({
				userId: ids.user,
				workspaceId: ids.workspaceA,
				permissionKey: "cycle:read",
			}),
		).resolves.toBe(false);
	});

	test("unknown object predicate fails", async () => {
		const ids = createLogicalIds();
		await seedConstrainedWorkspaceGrant({
			ids,
			predicateJson: { unknown: true },
		});
		await expect(
			isAllowed({
				userId: ids.user,
				workspaceId: ids.workspaceA,
				permissionKey: "cycle:read",
			}),
		).resolves.toBe(false);
	});

	test("partially recognized object predicate fails", async () => {
		const ids = createLogicalIds();
		await seedConstrainedWorkspaceGrant({
			ids,
			predicateJson: { always: true, extra: 1 },
		});
		await expect(
			isAllowed({
				userId: ids.user,
				workspaceId: ids.workspaceA,
				permissionKey: "cycle:read",
			}),
		).resolves.toBe(false);
	});

	test("resource predicate shape fails closed", async () => {
		const ids = createLogicalIds();
		await seedConstrainedWorkspaceGrant({
			ids,
			predicateJson: {
				resource: { attribute_equals: { id: "res-1" } },
			},
		});
		await expect(
			isAllowed({
				userId: ids.user,
				workspaceId: ids.workspaceA,
				permissionKey: "cycle:read",
				resource: { id: "res-1", attributes: { id: "res-1" } },
			}),
		).resolves.toBe(false);
	});

	test("ambient predicate shape fails closed", async () => {
		const ids = createLogicalIds();
		await seedConstrainedWorkspaceGrant({
			ids,
			predicateJson: {
				ambient: { attribute_equals: { env: "prod" } },
			},
		});
		await expect(
			isAllowed({
				userId: ids.user,
				workspaceId: ids.workspaceA,
				permissionKey: "cycle:read",
				ambient: { env: "prod" },
			}),
		).resolves.toBe(false);
	});

	test("cross-workspace constraint is excluded", async () => {
		const ids = createLogicalIds();
		await seedConstrainedWorkspaceGrant({
			ids,
			predicateJson: { always: true },
			constraintWorkspaceId: ids.workspaceB,
		});
		await expect(
			isAllowed({
				userId: ids.user,
				workspaceId: ids.workspaceA,
				permissionKey: "cycle:read",
			}),
		).resolves.toBe(false);
	});

	test("constraint scope different from constrained role scope is excluded", async () => {
		const ids = createLogicalIds();
		await seedConstrainedWorkspaceGrant({
			ids,
			predicateJson: { always: true },
			constraintScopeLevel: "team",
		});
		await expect(
			isAllowed({
				userId: ids.user,
				workspaceId: ids.workspaceA,
				permissionKey: "cycle:read",
			}),
		).resolves.toBe(false);
	});

	test("malformed predicate evaluation fails the candidate closed without throwing", async () => {
		const ids = createLogicalIds();
		await seedConstrainedWorkspaceGrant({
			ids,
			predicateJson: { subject: { attribute_equals: null } },
		});
		await expect(
			isAllowed({
				userId: ids.user,
				workspaceId: ids.workspaceA,
				permissionKey: "cycle:read",
			}),
		).resolves.toBe(false);
	});
});

describe("independent attributes", () => {
	async function seedConstrainedOnKey(
		ids: ReturnType<typeof createLogicalIds>,
		key: string,
		value: unknown,
	) {
		await fixtures.seedWorkspacesAndTeams(ids);
		await fixtures.insertWorkspaceRole({
			id: ids.workspaceRole,
			workspaceId: ids.workspaceA,
			createdBy: ids.user,
			name: "attr-governor",
		});
		await fixtures.insertWorkspaceMembership({
			workspaceId: ids.workspaceA,
			userId: ids.user,
			roleId: ids.workspaceRole,
			status: "active",
		});
		const constraintId = await fixtures.insertConstraint({
			workspaceId: ids.workspaceA,
			scopeLevel: "workspace",
			predicateJson: {
				subject: { attribute_equals: { [key]: value } },
			},
		});
		const permissionId = await fixtures.insertExactPermission("cycle:read");
		await fixtures.insertRolePermission({
			roleId: ids.workspaceRole,
			permissionId,
			effect: "allow",
			constraintId,
		});
	}

	test("user entity attributes satisfy subject.attribute_equals independently", async () => {
		const ids = createLogicalIds();
		await seedConstrainedOnKey(ids, "user_badge", "alpha");
		await fixtures.insertEntityAttribute({
			entityType: "user",
			entityId: ids.user,
			key: "user_badge",
			value: "alpha",
			userId: ids.user,
		});
		await expect(
			isAllowed({
				userId: ids.user,
				workspaceId: ids.workspaceA,
				permissionKey: "cycle:read",
			}),
		).resolves.toBe(true);
	});

	test("workspace entity attributes satisfy subject.attribute_equals independently", async () => {
		const ids = createLogicalIds();
		await seedConstrainedOnKey(ids, "workspace_tier", "gold");
		await fixtures.insertEntityAttribute({
			entityType: "workspace",
			entityId: ids.workspaceA,
			key: "workspace_tier",
			value: "gold",
			workspaceId: ids.workspaceA,
		});
		await expect(
			isAllowed({
				userId: ids.user,
				workspaceId: ids.workspaceA,
				permissionKey: "cycle:read",
			}),
		).resolves.toBe(true);
	});

	test("workspace membership attributes satisfy subject.attribute_equals independently", async () => {
		const ids = createLogicalIds();
		await fixtures.seedWorkspacesAndTeams(ids);
		await fixtures.insertWorkspaceRole({
			id: ids.workspaceRole,
			workspaceId: ids.workspaceA,
			createdBy: ids.user,
			name: "attr-governor",
		});
		await fixtures.insertWorkspaceMembership({
			workspaceId: ids.workspaceA,
			userId: ids.user,
			roleId: ids.workspaceRole,
			status: "active",
			attributes: { membership_seat: "full" },
		});
		const constraintId = await fixtures.insertConstraint({
			workspaceId: ids.workspaceA,
			scopeLevel: "workspace",
			predicateJson: {
				subject: { attribute_equals: { membership_seat: "full" } },
			},
		});
		const permissionId = await fixtures.insertExactPermission("cycle:read");
		await fixtures.insertRolePermission({
			roleId: ids.workspaceRole,
			permissionId,
			effect: "allow",
			constraintId,
		});
		await expect(
			isAllowed({
				userId: ids.user,
				workspaceId: ids.workspaceA,
				permissionKey: "cycle:read",
			}),
		).resolves.toBe(true);
	});

	test("valid workspace assignment attributes satisfy subject.attribute_equals independently", async () => {
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
		await fixtures.insertWorkspaceRole({
			id: ids.workspaceRole,
			workspaceId: ids.workspaceA,
			createdBy: ids.user,
			name: "assigned-governor",
		});
		const constraintId = await fixtures.insertConstraint({
			workspaceId: ids.workspaceA,
			scopeLevel: "workspace",
			predicateJson: {
				subject: { attribute_equals: { assignment_grant: "ws" } },
			},
		});
		const permissionId = await fixtures.insertExactPermission("cycle:read");
		await fixtures.insertRolePermission({
			roleId: ids.workspaceRole,
			permissionId,
			effect: "allow",
			constraintId,
		});
		await fixtures.insertAssignment({
			roleId: ids.workspaceRole,
			userId: ids.user,
			workspaceId: ids.workspaceA,
			teamId: null,
			assignedBy: ids.user,
			attributes: { assignment_grant: "ws" },
		});
		await expect(
			isAllowed({
				userId: ids.user,
				workspaceId: ids.workspaceA,
				permissionKey: "cycle:read",
			}),
		).resolves.toBe(true);
	});

	test("team entity, membership, and assignment attributes are omitted when no team is requested", async () => {
		const ids = createLogicalIds();
		await fixtures.seedWorkspacesAndTeams(ids);
		await fixtures.insertWorkspaceRole({
			id: ids.workspaceRole,
			workspaceId: ids.workspaceA,
			createdBy: ids.user,
			name: "attr-governor",
		});
		await fixtures.insertWorkspaceMembership({
			workspaceId: ids.workspaceA,
			userId: ids.user,
			roleId: ids.workspaceRole,
			status: "active",
		});
		const permissionId = await fixtures.insertExactPermission("cycle:read");
		const teamEntityConstraint = await fixtures.insertConstraint({
			workspaceId: ids.workspaceA,
			scopeLevel: "workspace",
			predicateJson: {
				subject: { attribute_equals: { team_track: "core" } },
			},
		});
		const teamMembershipConstraint = await fixtures.insertConstraint({
			workspaceId: ids.workspaceA,
			scopeLevel: "workspace",
			predicateJson: {
				subject: { attribute_equals: { team_membership_lane: "qa" } },
			},
		});
		const teamAssignmentConstraint = await fixtures.insertConstraint({
			workspaceId: ids.workspaceA,
			scopeLevel: "workspace",
			predicateJson: {
				subject: { attribute_equals: { team_assignment_flag: "on" } },
			},
		});
		await fixtures.insertRolePermission({
			roleId: ids.workspaceRole,
			permissionId,
			effect: "allow",
			constraintId: teamEntityConstraint,
		});
		await fixtures.insertRolePermission({
			roleId: ids.workspaceRole,
			permissionId,
			effect: "allow",
			constraintId: teamMembershipConstraint,
		});
		await fixtures.insertRolePermission({
			roleId: ids.workspaceRole,
			permissionId,
			effect: "allow",
			constraintId: teamAssignmentConstraint,
		});
		await fixtures.insertEntityAttribute({
			entityType: "team",
			entityId: ids.teamA,
			key: "team_track",
			value: "core",
			teamId: ids.teamA,
		});
		await fixtures.insertTeamRole({
			id: ids.teamARole,
			workspaceId: ids.workspaceA,
			teamId: ids.teamA,
			createdBy: ids.user,
			name: "team-attr-role",
		});
		await fixtures.insertTeamMembership({
			teamId: ids.teamA,
			userId: ids.user,
			roleId: ids.teamARole,
			status: "active",
			attributes: { team_membership_lane: "qa" },
		});
		await fixtures.insertAssignment({
			roleId: ids.teamARole,
			userId: ids.user,
			workspaceId: ids.workspaceA,
			teamId: ids.teamA,
			assignedBy: ids.user,
			attributes: { team_assignment_flag: "on" },
		});
		await expect(
			isAllowed({
				userId: ids.user,
				workspaceId: ids.workspaceA,
				permissionKey: "cycle:read",
			}),
		).resolves.toBe(false);
		await expect(
			isAllowed({
				userId: ids.user,
				workspaceId: ids.workspaceA,
				teamId: ids.teamA,
				permissionKey: "cycle:read",
			}),
		).resolves.toBe(true);
	});

	test("active team membership attributes satisfy subject.attribute_equals independently", async () => {
		const ids = createLogicalIds();
		await fixtures.seedWorkspacesAndTeams(ids);
		const dummyWorkspaceRole = await fixtures.insertWorkspaceRole({
			workspaceId: ids.workspaceA,
			createdBy: ids.user,
			name: "placeholder-membership",
		});
		await fixtures.insertWorkspaceMembership({
			workspaceId: ids.workspaceA,
			userId: ids.user,
			roleId: dummyWorkspaceRole,
			status: "active",
		});
		await fixtures.insertTeamRole({
			id: ids.teamARole,
			workspaceId: ids.workspaceA,
			teamId: ids.teamA,
			createdBy: ids.user,
			name: "team-attr-role",
		});
		const constraintId = await fixtures.insertConstraint({
			workspaceId: ids.workspaceA,
			scopeLevel: "team",
			predicateJson: {
				subject: { attribute_equals: { team_membership_lane: "qa" } },
			},
		});
		const permissionId = await fixtures.insertExactPermission("cycle:read");
		await fixtures.insertRolePermission({
			roleId: ids.teamARole,
			permissionId,
			effect: "allow",
			constraintId,
		});
		await fixtures.insertTeamMembership({
			teamId: ids.teamA,
			userId: ids.user,
			roleId: ids.teamARole,
			status: "active",
			attributes: { team_membership_lane: "qa" },
		});
		await expect(
			isAllowed({
				userId: ids.user,
				workspaceId: ids.workspaceA,
				teamId: ids.teamA,
				permissionKey: "cycle:read",
			}),
		).resolves.toBe(true);
	});

	test("valid team assignment attributes satisfy subject.attribute_equals independently", async () => {
		const ids = createLogicalIds();
		await fixtures.seedWorkspacesAndTeams(ids);
		const dummyWorkspaceRole = await fixtures.insertWorkspaceRole({
			workspaceId: ids.workspaceA,
			createdBy: ids.user,
			name: "placeholder-membership",
		});
		await fixtures.insertWorkspaceMembership({
			workspaceId: ids.workspaceA,
			userId: ids.user,
			roleId: dummyWorkspaceRole,
			status: "active",
		});
		const dummyTeamRole = await fixtures.insertTeamRole({
			workspaceId: ids.workspaceA,
			teamId: ids.teamA,
			createdBy: ids.user,
			name: "placeholder-team-membership",
		});
		await fixtures.insertTeamMembership({
			teamId: ids.teamA,
			userId: ids.user,
			roleId: dummyTeamRole,
			status: "active",
		});
		await fixtures.insertTeamRole({
			id: ids.teamARole,
			workspaceId: ids.workspaceA,
			teamId: ids.teamA,
			createdBy: ids.user,
			name: "assigned-team-role",
		});
		const constraintId = await fixtures.insertConstraint({
			workspaceId: ids.workspaceA,
			scopeLevel: "team",
			predicateJson: {
				subject: { attribute_equals: { team_assignment_flag: "on" } },
			},
		});
		const permissionId = await fixtures.insertExactPermission("cycle:read");
		await fixtures.insertRolePermission({
			roleId: ids.teamARole,
			permissionId,
			effect: "allow",
			constraintId,
		});
		await fixtures.insertAssignment({
			roleId: ids.teamARole,
			userId: ids.user,
			workspaceId: ids.workspaceA,
			teamId: ids.teamA,
			assignedBy: ids.user,
			attributes: { team_assignment_flag: "on" },
		});
		await expect(
			isAllowed({
				userId: ids.user,
				workspaceId: ids.workspaceA,
				teamId: ids.teamA,
				permissionKey: "cycle:read",
			}),
		).resolves.toBe(true);
	});

	test("stale or inactive assignment attributes do not participate when the authorization root is active", async () => {
		const ids = createLogicalIds();
		await seedConstrainedOnKey(ids, "stale_assignment_mark", "yes");
		await fixtures.insertTeamRole({
			id: ids.teamARole,
			workspaceId: ids.workspaceA,
			teamId: ids.teamA,
			createdBy: ids.user,
			name: "stale-team-assignment",
		});
		await fixtures.insertTeamMembership({
			teamId: ids.teamA,
			userId: ids.user,
			roleId: ids.teamARole,
			status: "inactive",
		});
		await fixtures.insertAssignment({
			roleId: ids.teamARole,
			userId: ids.user,
			workspaceId: ids.workspaceA,
			teamId: ids.teamA,
			assignedBy: ids.user,
			attributes: { stale_assignment_mark: "yes" },
		});
		await expect(
			isAllowed({
				userId: ids.user,
				workspaceId: ids.workspaceA,
				teamId: ids.teamA,
				permissionKey: "cycle:read",
			}),
		).resolves.toBe(false);
	});

	test("wrong-team assignment attributes do not participate", async () => {
		const ids = createLogicalIds();
		await seedConstrainedOnKey(ids, "wrong_team_assignment_mark", "yes");
		const dummyTeamRole = await fixtures.insertTeamRole({
			workspaceId: ids.workspaceA,
			teamId: ids.teamA,
			createdBy: ids.user,
			name: "placeholder-team-membership",
		});
		await fixtures.insertTeamMembership({
			teamId: ids.teamA,
			userId: ids.user,
			roleId: dummyTeamRole,
			status: "active",
		});
		await fixtures.insertTeamRole({
			id: ids.teamBRole,
			workspaceId: ids.workspaceA,
			teamId: ids.teamB,
			createdBy: ids.user,
			name: "other-team-assignment",
		});
		await fixtures.insertAssignment({
			roleId: ids.teamBRole,
			userId: ids.user,
			workspaceId: ids.workspaceA,
			teamId: ids.teamB,
			assignedBy: ids.user,
			attributes: { wrong_team_assignment_mark: "yes" },
		});
		await expect(
			isAllowed({
				userId: ids.user,
				workspaceId: ids.workspaceA,
				teamId: ids.teamA,
				permissionKey: "cycle:read",
			}),
		).resolves.toBe(false);
	});

	test("cross-workspace assignment attributes do not participate", async () => {
		const ids = createLogicalIds();
		await seedConstrainedOnKey(ids, "cross_ws_assignment_mark", "yes");
		const foreignRole = await fixtures.insertWorkspaceRole({
			workspaceId: ids.workspaceB,
			createdBy: ids.user,
			name: "foreign-assigned-governor",
		});
		await fixtures.insertAssignment({
			roleId: foreignRole,
			userId: ids.user,
			workspaceId: ids.workspaceB,
			teamId: null,
			assignedBy: ids.user,
			attributes: { cross_ws_assignment_mark: "yes" },
		});
		await expect(
			isAllowed({
				userId: ids.user,
				workspaceId: ids.workspaceA,
				permissionKey: "cycle:read",
			}),
		).resolves.toBe(false);
	});

	test("wrong-team and cross-workspace entity attributes do not participate", async () => {
		const ids = createLogicalIds();
		await seedConstrainedOnKey(ids, "foreign_mark", "x");
		await fixtures.insertEntityAttribute({
			entityType: "team",
			entityId: ids.teamB,
			key: "foreign_mark",
			value: "x",
			teamId: ids.teamB,
		});
		await fixtures.insertEntityAttribute({
			entityType: "workspace",
			entityId: ids.workspaceB,
			key: "foreign_mark",
			value: "x",
			workspaceId: ids.workspaceB,
		});
		await expect(
			isAllowed({
				userId: ids.user,
				workspaceId: ids.workspaceA,
				teamId: ids.teamA,
				permissionKey: "cycle:read",
			}),
		).resolves.toBe(false);
	});

	test("malformed entity ownership does not participate", async () => {
		const ids = createLogicalIds();
		await seedConstrainedOnKey(ids, "user_badge", "alpha");
		await fixtures.insertEntityAttribute({
			entityType: "user",
			entityId: ids.user,
			key: "user_badge",
			value: "alpha",
			workspaceId: ids.workspaceB,
		});
		await expect(
			isAllowed({
				userId: ids.user,
				workspaceId: ids.workspaceA,
				permissionKey: "cycle:read",
			}),
		).resolves.toBe(false);
	});

	test("unconstrained grants do not depend on unrelated attributes", async () => {
		const ids = createLogicalIds();
		await seedWorkspaceAllow(ids);
		await fixtures.insertEntityAttribute({
			entityType: "user",
			entityId: ids.user,
			key: "unrelated_flag",
			value: "nope",
			userId: ids.user,
		});
		await expect(
			isAllowed({
				userId: ids.user,
				workspaceId: ids.workspaceA,
				permissionKey: "cycle:read",
			}),
		).resolves.toBe(true);
	});
});
