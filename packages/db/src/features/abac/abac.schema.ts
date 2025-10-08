import { relations, sql } from "drizzle-orm";
import {
	check,
	jsonb,
	pgEnum,
	pgTable,
	text,
	timestamp,
	uniqueIndex,
} from "drizzle-orm/pg-core";
import { user } from "../auth/auth.schema";
import { team, workspace } from "../tracker/tracker.schema";

export const roleScopeLevelEnum = pgEnum("role_scope_level", [
	"workspace",
	"team",
]);
export const policyEffectEnum = pgEnum("policy_effect", ["allow", "deny"]);
export const attributeEntityEnum = pgEnum("attribute_entity", [
	"user",
	"workspace",
	"team",
	"resource", // Generic resource type, actual entity will be resolved via entityId and entityType
]);

export const permissionsCatalog = pgTable(
	"permissions_catalog",
	{
		id: text("id").primaryKey(),
		key: text("key").unique().notNull(),
		resourceType: text("resource_type").notNull(),
		action: text("action").notNull(),
		description: text("description"),
	},
	(table) => [
		uniqueIndex("permissions_catalog_resource_action_idx").on(
			table.resourceType,
			table.action,
		),
	],
);

export const roleDefinitions = pgTable(
	"role_definitions",
	{
		id: text("id").primaryKey(),
		workspaceId: text("workspace_id")
			.notNull()
			.references(() => workspace.id, { onDelete: "cascade" }),
		scopeLevel: roleScopeLevelEnum("scope_level").notNull(),
		teamId: text("team_id").references(() => team.id, {
			onDelete: "cascade",
		}),
		name: text("name").notNull(),
		description: text("description"),
		createdBy: text("created_by")
			.notNull()
			.references(() => user.id, { onDelete: "restrict" }),
		createdAt: timestamp("created_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
		attributes: jsonb("attributes").default({}).notNull(),
	},
	(table) => [
		uniqueIndex("role_definitions_workspace_scope_team_name_idx").on(
			table.workspaceId,
			table.scopeLevel,
			table.teamId,
			table.name,
		),
	],
);

export const policyConstraints = pgTable("policy_constraints", {
	id: text("id").primaryKey(),
	workspaceId: text("workspace_id")
		.notNull()
		.references(() => workspace.id, { onDelete: "cascade" }),
	scopeLevel: roleScopeLevelEnum("scope_level").notNull(),
	description: text("description"),
	predicateJson: jsonb("predicate_json").notNull(),
	createdAt: timestamp("created_at", { withTimezone: true })
		.defaultNow()
		.notNull(),
});

export const rolePermissions = pgTable(
	"role_permissions",
	{
		roleId: text("role_id")
			.notNull()
			.references(() => roleDefinitions.id, { onDelete: "cascade" }),
		permissionId: text("permission_id")
			.notNull()
			.references(() => permissionsCatalog.id, { onDelete: "cascade" }),
		effect: policyEffectEnum("effect").notNull().default("allow"),
		constraintId: text("constraint_id").references(() => policyConstraints.id, {
			onDelete: "set null",
		}),
		attributes: jsonb("attributes").default({}).notNull(),
	},
	(table) => [
		uniqueIndex("role_permissions_pk").on(
			table.roleId,
			table.permissionId,
			table.constraintId,
		),
	],
);

export const roleAssignments = pgTable(
	"role_assignments",
	{
		id: text("id").primaryKey(),
		roleId: text("role_id")
			.notNull()
			.references(() => roleDefinitions.id, { onDelete: "cascade" }),
		userId: text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		workspaceId: text("workspace_id")
			.notNull()
			.references(() => workspace.id, { onDelete: "cascade" }),
		teamId: text("team_id").references(() => team.id, {
			onDelete: "cascade",
		}),
		assignedBy: text("assigned_by")
			.notNull()
			.references(() => user.id, { onDelete: "restrict" }),
		assignedAt: timestamp("assigned_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
		attributes: jsonb("attributes").default({}).notNull(),
	},
	(table) => [
		uniqueIndex("role_assignments_user_role_team_idx").on(
			table.userId,
			table.roleId,
			table.teamId,
		),
	],
);

export const entityAttributes = pgTable(
	"entity_attributes",
	{
		id: text("id").primaryKey(),
		entityType: attributeEntityEnum("entity_type").notNull(),
		entityId: text("entity_id").notNull(),
		key: text("key").notNull(),
		value: jsonb("value").notNull(),
		userId: text("user_id").references(() => user.id, { onDelete: "cascade" }),
		workspaceId: text("workspace_id").references(() => workspace.id, {
			onDelete: "cascade",
		}),
		teamId: text("team_id").references(() => team.id, { onDelete: "cascade" }),
	},
	(table) => [
		uniqueIndex("entity_attributes_type_id_key_idx").on(
			table.entityType,
			table.entityId,
			table.key,
		),
		check(
			"entity_attributes_polymorphic_check",
			sql`num_nonnulls(${table.userId}, ${table.workspaceId}, ${table.teamId}) <= 1`,
		),
	],
);

// Relations
export const permissionsCatalogRelations = relations(
	permissionsCatalog,
	({ many }) => ({
		rolePermissions: many(rolePermissions),
	}),
);

export const roleDefinitionsRelations = relations(
	roleDefinitions,
	({ one, many }) => ({
		workspace: one(workspace, {
			fields: [roleDefinitions.workspaceId],
			references: [workspace.id],
		}),
		team: one(team, {
			fields: [roleDefinitions.teamId],
			references: [team.id],
		}),
		createdBy: one(user, {
			fields: [roleDefinitions.createdBy],
			references: [user.id],
			relationName: "CreatedRoles",
		}),
		rolePermissions: many(rolePermissions),
		roleAssignments: many(roleAssignments),
	}),
);

export const policyConstraintsRelations = relations(
	policyConstraints,
	({ one, many }) => ({
		workspace: one(workspace, {
			fields: [policyConstraints.workspaceId],
			references: [workspace.id],
		}),
		rolePermissions: many(rolePermissions),
	}),
);

export const rolePermissionsRelations = relations(
	rolePermissions,
	({ one }) => ({
		role: one(roleDefinitions, {
			fields: [rolePermissions.roleId],
			references: [roleDefinitions.id],
		}),
		permission: one(permissionsCatalog, {
			fields: [rolePermissions.permissionId],
			references: [permissionsCatalog.id],
		}),
		constraint: one(policyConstraints, {
			fields: [rolePermissions.constraintId],
			references: [policyConstraints.id],
		}),
	}),
);

export const roleAssignmentsRelations = relations(
	roleAssignments,
	({ one }) => ({
		role: one(roleDefinitions, {
			fields: [roleAssignments.roleId],
			references: [roleDefinitions.id],
		}),
		user: one(user, {
			fields: [roleAssignments.userId],
			references: [user.id],
			relationName: "AssignedUser",
		}),
		workspace: one(workspace, {
			fields: [roleAssignments.workspaceId],
			references: [workspace.id],
		}),
		team: one(team, {
			fields: [roleAssignments.teamId],
			references: [team.id],
		}),
		assignedBy: one(user, {
			fields: [roleAssignments.assignedBy],
			references: [user.id],
			relationName: "AssignedBy",
		}),
	}),
);

export const entityAttributesRelations = relations(
	entityAttributes,
	({ one }) => ({
		user: one(user, {
			fields: [entityAttributes.userId],
			references: [user.id],
		}),
		workspace: one(workspace, {
			fields: [entityAttributes.workspaceId],
			references: [workspace.id],
		}),
		team: one(team, {
			fields: [entityAttributes.teamId],
			references: [team.id],
		}),
	}),
);
