import { relations, sql } from "drizzle-orm";
import {
	boolean,
	integer,
	pgEnum,
	pgTable,
	text,
	timestamp,
	uniqueIndex,
} from "drizzle-orm/pg-core";
import { team, workspace } from "./tracker.schema";

export const canonicalCategoryEnum = pgEnum("canonical_category", [
	"backlog",
	"planned",
	"in_progress",
	"completed",
	"canceled",
]);

/**
 * ISSUE_STATUS_GROUP
 * Each group defines a logical bucket and maps to a canonical category (Backlog, Planned, In Progress, Completed, Canceled).
 *
 * @param isEditable - whenever users can edit the group. Needed to lock editing of base seeded groups like "backlog", "planned" etc.
 */
export const issueStatusGroup = pgTable(
	"issue_status_group",
	{
		id: text("id").primaryKey(),
		workspaceId: text("workspace_id")
			.notNull()
			.references(() => workspace.id, { onDelete: "cascade" }),
		key: text("key").notNull(),
		name: text("name").notNull(),
		canonicalCategory: canonicalCategoryEnum("canonical_category").notNull(),
		description: text("description"),
		orderIndex: integer("order_index").notNull(),
		isEditable: boolean("is_editable").default(true).notNull(),
		createdAt: timestamp("created_at").defaultNow().notNull(),
		updatedAt: timestamp("updated_at")
			.defaultNow()
			.notNull()
			.$onUpdate(() => new Date()),
	},
	(t) => [
		uniqueIndex("issue_status_group_workspace_key_key").on(
			t.workspaceId,
			t.key,
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
 * ISSUE_STATUS
 * Statuses just reference a group and store user-facing properties.
 * Teams can override workspace defaults by providing a teamId.
 * Behaviors like “is this status terminal?” or “is it backlog?” are derived from the group’s canonical_category.
 * For example: is_terminal → status.group.canonical_category IN ('completed','canceled')
 * is_backlog → … == 'backlog'
 */
export const issueStatus = pgTable(
	"issue_status",
	{
		id: text("id").primaryKey(),
		workspaceId: text("workspace_id")
			.notNull()
			.references(() => workspace.id, { onDelete: "cascade" }),
		teamId: text("team_id").references(() => team.id, { onDelete: "set null" }),
		statusGroupId: text("status_group_id")
			.notNull()
			.references(() => issueStatusGroup.id, { onDelete: "cascade" }),
		name: text("name").notNull(),
		color: text("color"),
		description: text("description"),
		orderIndex: integer("order_index").notNull(),
		createdAt: timestamp("created_at").defaultNow().notNull(),
		updatedAt: timestamp("updated_at")
			.defaultNow()
			.notNull()
			.$onUpdate(() => new Date()),
	},
	(t) => [
		uniqueIndex("issue_status_workspace_name_key").on(t.workspaceId, t.name),
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
	statusGroup: one(issueStatusGroup, {
		fields: [issueStatus.statusGroupId],
		references: [issueStatusGroup.id],
	}),
}));
