import { relations } from "drizzle-orm";
import {
	boolean,
	integer,
	pgTable,
	text,
	uniqueIndex,
} from "drizzle-orm/pg-core";
import { team, workspace } from "./tracker.schema";

/**
 * ISSUE_STATUS_GROUP – groups of statuses (e.g., Backlog, Todo, In Progress, Done)
 */
export const issueStatusGroup = pgTable(
	"issue_status_group",
	{
		id: text("id").primaryKey(),
		workspaceId: text("workspace_id")
			.notNull()
			.references(() => workspace.id, { onDelete: "cascade" }),
		name: text("name").notNull(),
		category: text("category").notNull(),
		orderIndex: integer("order_index").notNull(),
	},
	(t) => [
		// Ensure a workspace cannot have duplicate group names
		uniqueIndex("issue_status_group_workspace_name_key").on(
			t.workspaceId,
			t.name,
		),
	],
);

export const issueStatusGroupRelations = relations(
	issueStatusGroup,
	({ many }) => ({
		statuses: many(issueStatus),
	}),
);

/**
 * ISSUE_STATUS – individual status columns within a group.
 * Teams can override workspace defaults by providing a teamId.
 */
export const issueStatus = pgTable(
	"issue_status",
	{
		id: text("id").primaryKey(),
		workspaceId: text("workspace_id")
			.notNull()
			.references(() => workspace.id, { onDelete: "cascade" }),
		teamId: text("team_id").references(() => team.id, { onDelete: "set null" }),
		groupId: text("group_id")
			.notNull()
			.references(() => issueStatusGroup.id, { onDelete: "cascade" }),
		name: text("name").notNull(),
		key: text("key").notNull(),
		color: text("color"),
		orderIndex: integer("order_index").notNull(),
		defaultForNew: boolean("default_for_new").default(false).notNull(),
		isTerminal: boolean("is_terminal").default(false).notNull(),
		isBacklog: boolean("is_backlog").default(false).notNull(),
	},
	(t) => [
		// Unique key per workspace (team overrides can reuse the same key)
		uniqueIndex("issue_status_workspace_key_key").on(t.workspaceId, t.key),
	],
);

export const issueStatusRelations = relations(issueStatus, ({ one }) => ({
	workspace: one(workspace, {
		fields: [issueStatus.workspaceId],
		references: [workspace.id],
	}),
	team: one(team, {
		fields: [issueStatus.teamId],
		references: [team.id],
	}),
	group: one(issueStatusGroup, {
		fields: [issueStatus.groupId],
		references: [issueStatusGroup.id],
	}),
}));
