import { createId } from "@paralleldrive/cuid2";
import type {
	entityAttributes,
	permissionsCatalog,
	policyConstraints,
	roleAssignments,
	roleDefinitions,
	rolePermissions,
} from "db/features/abac/abac.schema";
import type { user } from "db/features/auth/auth.schema";
import type {
	team,
	teamMembership,
	workspace,
	workspaceMembership,
} from "db/features/tracker/tracker.schema";
import { sql } from "drizzle-orm";

export type AbacDb = typeof import("db").db;

export type AbacTables = {
	db: AbacDb;
	user: typeof user;
	workspace: typeof workspace;
	team: typeof team;
	workspaceMembership: typeof workspaceMembership;
	teamMembership: typeof teamMembership;
	roleDefinitions: typeof roleDefinitions;
	permissionsCatalog: typeof permissionsCatalog;
	rolePermissions: typeof rolePermissions;
	policyConstraints: typeof policyConstraints;
	roleAssignments: typeof roleAssignments;
	entityAttributes: typeof entityAttributes;
};

export type RoleScopeLevel =
	(typeof roleDefinitions.$inferSelect)["scopeLevel"];
export type PolicyEffect = (typeof rolePermissions.$inferSelect)["effect"];
export type AttributeEntityType =
	(typeof entityAttributes.$inferSelect)["entityType"];

type FixtureInput<
	Table extends { $inferInsert: object },
	RequiredKeys extends keyof Table["$inferInsert"],
	OptionalKeys extends keyof Table["$inferInsert"] = never,
> = Required<Pick<Table["$inferInsert"], RequiredKeys>> &
	Partial<Pick<Table["$inferInsert"], OptionalKeys>>;

export function createLogicalIds() {
	return {
		user: createId(),
		secondUser: createId(),
		workspaceA: createId(),
		workspaceB: createId(),
		teamA: createId(),
		teamB: createId(),
		foreignTeam: createId(),
		workspaceRole: createId(),
		teamARole: createId(),
		teamBRole: createId(),
	};
}

export async function truncateAuthorizationTables(db: AbacDb) {
	await db.execute(
		sql`truncate table "user", workspace, team, permissions_catalog cascade`,
	);
}

function catalogParts(key: string): { resourceType: string; action: string } {
	if (key === "*") return { resourceType: "*", action: "*" };
	const separator = key.indexOf(":");
	if (separator === -1) return { resourceType: key, action: "" };
	return {
		resourceType: key.slice(0, separator),
		action: key.slice(separator + 1),
	};
}

export function createAbacFixtures(tables: AbacTables) {
	const insertUser = async (
		input: FixtureInput<typeof user, "id", "name" | "email">,
	) => {
		await tables.db.insert(tables.user).values({
			id: input.id,
			name: input.name ?? `User ${input.id}`,
			email: input.email ?? `${input.id}@example.test`,
		});
		return input.id;
	};

	const insertWorkspace = async (
		input: FixtureInput<typeof workspace, "id", "name" | "slug" | "timezone">,
	) => {
		await tables.db.insert(tables.workspace).values({
			id: input.id,
			name: input.name ?? `Workspace ${input.id}`,
			slug: input.slug ?? `ws-${input.id}`,
			timezone: input.timezone ?? "UTC",
		});
		return input.id;
	};

	const insertTeam = async (
		input: FixtureInput<
			typeof team,
			"id" | "workspaceId" | "privacy",
			"name" | "key"
		>,
	) => {
		await tables.db.insert(tables.team).values({
			id: input.id,
			workspaceId: input.workspaceId,
			name: input.name ?? `Team ${input.id}`,
			key: input.key ?? input.id.slice(0, 8),
			privacy: input.privacy,
		});
		return input.id;
	};

	const insertRoleDefinition = async (
		input: FixtureInput<
			typeof roleDefinitions,
			"workspaceId" | "scopeLevel" | "teamId" | "name" | "createdBy",
			"id" | "description" | "attributes"
		>,
	) => {
		const id = input.id ?? createId();
		await tables.db.insert(tables.roleDefinitions).values({
			id,
			workspaceId: input.workspaceId,
			scopeLevel: input.scopeLevel,
			teamId: input.teamId,
			name: input.name,
			description: input.description,
			createdBy: input.createdBy,
			attributes: input.attributes ?? {},
		});
		return id;
	};

	const insertWorkspaceRole = async (
		input: FixtureInput<
			typeof roleDefinitions,
			"workspaceId" | "createdBy" | "name",
			"id" | "attributes"
		>,
	) =>
		insertRoleDefinition({
			id: input.id,
			workspaceId: input.workspaceId,
			teamId: null,
			scopeLevel: "workspace",
			name: input.name,
			createdBy: input.createdBy,
			attributes: input.attributes,
		});

	const insertTeamRole = async (
		input: FixtureInput<
			typeof roleDefinitions,
			"workspaceId" | "teamId" | "createdBy" | "name",
			"id" | "attributes"
		>,
	) =>
		insertRoleDefinition({
			id: input.id,
			workspaceId: input.workspaceId,
			teamId: input.teamId,
			scopeLevel: "team",
			name: input.name,
			createdBy: input.createdBy,
			attributes: input.attributes,
		});

	const insertWorkspaceMembership = async (
		input: FixtureInput<
			typeof workspaceMembership,
			"workspaceId" | "userId" | "roleId" | "status",
			"id" | "attributes"
		>,
	) => {
		const id = input.id ?? createId();
		await tables.db.insert(tables.workspaceMembership).values({
			id,
			workspaceId: input.workspaceId,
			userId: input.userId,
			roleId: input.roleId,
			status: input.status,
			attributes: input.attributes ?? {},
		});
		return id;
	};

	const insertTeamMembership = async (
		input: FixtureInput<
			typeof teamMembership,
			"teamId" | "userId" | "roleId" | "status",
			"id" | "attributes"
		>,
	) => {
		const id = input.id ?? createId();
		await tables.db.insert(tables.teamMembership).values({
			id,
			teamId: input.teamId,
			userId: input.userId,
			roleId: input.roleId,
			status: input.status,
			attributes: input.attributes ?? {},
		});
		return id;
	};

	const insertPermission = async (
		input: FixtureInput<
			typeof permissionsCatalog,
			"key" | "resourceType" | "action",
			"id" | "description"
		>,
	) => {
		const id = input.id ?? createId();
		await tables.db.insert(tables.permissionsCatalog).values({
			id,
			key: input.key,
			resourceType: input.resourceType,
			action: input.action,
			description: input.description,
		});
		return id;
	};

	const insertExactPermission = async (key: string) => {
		const parts = catalogParts(key);
		return insertPermission({
			key,
			resourceType: parts.resourceType,
			action: parts.action,
		});
	};

	const insertConstraint = async (
		input: FixtureInput<
			typeof policyConstraints,
			"workspaceId" | "scopeLevel" | "predicateJson",
			"id" | "description"
		>,
	) => {
		const id = input.id ?? createId();
		await tables.db.insert(tables.policyConstraints).values({
			id,
			workspaceId: input.workspaceId,
			scopeLevel: input.scopeLevel,
			predicateJson: input.predicateJson,
			description: input.description,
		});
		return id;
	};

	const insertRolePermission = async (
		input: FixtureInput<
			typeof rolePermissions,
			"roleId" | "permissionId" | "effect",
			"constraintId" | "attributes"
		>,
	) => {
		await tables.db.insert(tables.rolePermissions).values({
			roleId: input.roleId,
			permissionId: input.permissionId,
			effect: input.effect,
			constraintId: input.constraintId ?? null,
			attributes: input.attributes ?? {},
		});
	};

	const insertAssignment = async (
		input: FixtureInput<
			typeof roleAssignments,
			"roleId" | "userId" | "workspaceId" | "teamId" | "assignedBy",
			"id" | "attributes"
		>,
	) => {
		const id = input.id ?? createId();
		await tables.db.insert(tables.roleAssignments).values({
			id,
			roleId: input.roleId,
			userId: input.userId,
			workspaceId: input.workspaceId,
			teamId: input.teamId,
			assignedBy: input.assignedBy,
			attributes: input.attributes ?? {},
		});
		return id;
	};

	const insertEntityAttribute = async (
		input: FixtureInput<
			typeof entityAttributes,
			"entityType" | "entityId" | "key" | "value",
			"id" | "userId" | "workspaceId" | "teamId"
		>,
	) => {
		const id = input.id ?? createId();
		await tables.db.insert(tables.entityAttributes).values({
			id,
			entityType: input.entityType,
			entityId: input.entityId,
			key: input.key,
			value: input.value,
			userId: input.userId ?? null,
			workspaceId: input.workspaceId ?? null,
			teamId: input.teamId ?? null,
		});
		return id;
	};

	const seedWorkspacesAndTeams = async (
		ids: ReturnType<typeof createLogicalIds>,
	) => {
		await insertUser({ id: ids.user });
		await insertUser({
			id: ids.secondUser,
			name: `Second ${ids.secondUser}`,
			email: `${ids.secondUser}@example.test`,
		});
		await insertWorkspace({ id: ids.workspaceA, slug: `a-${ids.workspaceA}` });
		await insertWorkspace({ id: ids.workspaceB, slug: `b-${ids.workspaceB}` });
		await insertTeam({
			id: ids.teamA,
			workspaceId: ids.workspaceA,
			privacy: "public",
			key: `a${ids.teamA.slice(0, 7)}`,
		});
		await insertTeam({
			id: ids.teamB,
			workspaceId: ids.workspaceA,
			privacy: "private",
			key: `b${ids.teamB.slice(0, 7)}`,
		});
		await insertTeam({
			id: ids.foreignTeam,
			workspaceId: ids.workspaceB,
			privacy: "private",
			key: `f${ids.foreignTeam.slice(0, 7)}`,
		});
	};

	return {
		insertUser,
		insertWorkspace,
		insertTeam,
		insertRoleDefinition,
		insertWorkspaceRole,
		insertTeamRole,
		insertWorkspaceMembership,
		insertTeamMembership,
		insertPermission,
		insertExactPermission,
		insertConstraint,
		insertRolePermission,
		insertAssignment,
		insertEntityAttribute,
		seedWorkspacesAndTeams,
	};
}
