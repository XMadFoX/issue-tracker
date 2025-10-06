import {
	boolean,
	integer,
	pgTable,
	text,
	timestamp,
	uniqueIndex,
} from "drizzle-orm/pg-core";
import { user } from "../auth/auth.schema";

export const workspace = pgTable(
	"workspace",
	{
		id: text("id").primaryKey(),
		name: text("name").notNull(),
		slug: text("slug").notNull(),
		plan: text("plan").notNull(),
		timezone: text("timezone").notNull(),
		createdAt: timestamp("created_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
	},
	(table) => [uniqueIndex("workspace_slug_key").on(table.slug)],
);

export const workspaceMembership = pgTable(
	"workspace_membership",
	{
		id: text("id").primaryKey(),
		workspaceId: text("workspace_id")
			.notNull()
			.references(() => workspace.id, { onDelete: "cascade" }),
		userId: text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		role: text("role").notNull(),
		status: text("status").notNull(),
		invitedBy: text("invited_by").references(() => user.id, {
			onDelete: "set null",
		}),
		joinedAt: timestamp("joined_at", { withTimezone: true }),
		lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
		createdAt: timestamp("created_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
	},
	(table) => [
		uniqueIndex("workspace_membership_workspace_user_key").on(
			table.workspaceId,
			table.userId,
		),
	],
);

export const team = pgTable(
	"team",
	{
		id: text("id").primaryKey(),
		workspaceId: text("workspace_id")
			.notNull()
			.references(() => workspace.id, { onDelete: "cascade" }),
		name: text("name").notNull(),
		key: text("key").notNull(),
		color: text("color"),
		leadId: text("lead_id").references(() => user.id, {
			onDelete: "set null",
		}),
		cycleDuration: integer("cycle_duration"),
		triageMode: text("triage_mode"),
		privacy: text("privacy").notNull(),
		createdAt: timestamp("created_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
	},
	(table) => [
		uniqueIndex("team_workspace_key_key").on(table.workspaceId, table.key),
	],
);

export const teamMembership = pgTable(
	"team_membership",
	{
		id: text("id").primaryKey(),
		teamId: text("team_id")
			.notNull()
			.references(() => team.id, { onDelete: "cascade" }),
		userId: text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		role: text("role").notNull(),
		isDefault: boolean("is_default").notNull().default(false),
		joinedAt: timestamp("joined_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
	},
	(table) => [
		uniqueIndex("team_membership_team_user_key").on(table.teamId, table.userId),
	],
);
