import { sql } from "drizzle-orm";
import {
	boolean,
	index,
	integer,
	pgTable,
	text,
	timestamp,
	uniqueIndex,
} from "drizzle-orm/pg-core";
import { issueStatus } from "./issue-statuses.schema";
import { team, workspace } from "./tracker.schema";

export const issueType = pgTable(
	"issue_type",
	{
		id: text("id").primaryKey(),
		workspaceId: text("workspace_id")
			.notNull()
			.references(() => workspace.id, { onDelete: "cascade" }),
		teamId: text("team_id").references(() => team.id, { onDelete: "set null" }),
		name: text("name").notNull(),
		key: text("key").notNull(),
		icon: text("icon").notNull(),
		color: text("color").notNull(),
		description: text("description"),
		orderIndex: integer("order_index").notNull(),
		isDefault: boolean("is_default").notNull().default(false),
		isEditable: boolean("is_editable").notNull().default(true),
		archivedAt: timestamp("archived_at", { withTimezone: true }),
		createdAt: timestamp("created_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.defaultNow()
			.notNull()
			.$onUpdate(() => new Date()),
	},
	(t) => [
		uniqueIndex("issue_type_workspace_key_when_global")
			.on(t.workspaceId, t.key)
			.where(sql`team_id is null`),
		uniqueIndex("issue_type_workspace_team_key_when_scoped")
			.on(t.workspaceId, t.teamId, t.key)
			.where(sql`team_id is not null`),
		uniqueIndex("issue_type_workspace_default_when_global")
			.on(t.workspaceId)
			.where(sql`team_id is null and is_default = true`),
		uniqueIndex("issue_type_workspace_team_default_when_scoped")
			.on(t.workspaceId, t.teamId)
			.where(sql`team_id is not null and is_default = true`),
		index("issue_type_workspace_scope_order_idx").on(
			t.workspaceId,
			t.teamId,
			t.orderIndex,
		),
		index("issue_type_archived_idx").on(t.archivedAt),
	],
);

export const issueTypeTeamOverride = pgTable(
	"issue_type_team_override",
	{
		id: text("id").primaryKey(),
		workspaceId: text("workspace_id")
			.notNull()
			.references(() => workspace.id, { onDelete: "cascade" }),
		teamId: text("team_id")
			.notNull()
			.references(() => team.id, { onDelete: "cascade" }),
		sourceIssueTypeId: text("source_issue_type_id")
			.notNull()
			.references(() => issueType.id, { onDelete: "cascade" }),
		replacementIssueTypeId: text("replacement_issue_type_id").references(
			() => issueType.id,
			{ onDelete: "set null" },
		),
		hiddenAt: timestamp("hidden_at", { withTimezone: true }),
		createdAt: timestamp("created_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.defaultNow()
			.notNull()
			.$onUpdate(() => new Date()),
	},
	(t) => [
		uniqueIndex("issue_type_team_override_team_source_key").on(
			t.teamId,
			t.sourceIssueTypeId,
		),
		index("issue_type_team_override_source_idx").on(t.sourceIssueTypeId),
		index("issue_type_team_override_replacement_idx").on(
			t.replacementIssueTypeId,
		),
		index("issue_type_team_override_workspace_team_idx").on(
			t.workspaceId,
			t.teamId,
		),
	],
);

export const issueTypeAllowedStatus = pgTable(
	"issue_type_allowed_status",
	{
		id: text("id").primaryKey(),
		workspaceId: text("workspace_id")
			.notNull()
			.references(() => workspace.id, { onDelete: "cascade" }),
		teamId: text("team_id").references(() => team.id, { onDelete: "set null" }),
		issueTypeId: text("issue_type_id")
			.notNull()
			.references(() => issueType.id, { onDelete: "cascade" }),
		statusId: text("status_id")
			.notNull()
			.references(() => issueStatus.id, { onDelete: "cascade" }),
		isInitial: boolean("is_initial").notNull().default(false),
		orderIndex: integer("order_index").notNull(),
		createdAt: timestamp("created_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.defaultNow()
			.notNull()
			.$onUpdate(() => new Date()),
	},
	(t) => [
		uniqueIndex("issue_type_allowed_status_type_status_when_global")
			.on(t.issueTypeId, t.statusId)
			.where(sql`team_id is null`),
		uniqueIndex("issue_type_allowed_status_type_team_status_when_scoped")
			.on(t.issueTypeId, t.teamId, t.statusId)
			.where(sql`team_id is not null`),
		uniqueIndex("issue_type_allowed_status_initial_when_global")
			.on(t.issueTypeId)
			.where(sql`team_id is null and is_initial = true`),
		uniqueIndex("issue_type_allowed_status_initial_when_scoped")
			.on(t.issueTypeId, t.teamId)
			.where(sql`team_id is not null and is_initial = true`),
		index("issue_type_allowed_status_status_idx").on(t.statusId),
		index("issue_type_allowed_status_workspace_team_idx").on(
			t.workspaceId,
			t.teamId,
		),
	],
);
