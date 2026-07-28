import { sql } from "drizzle-orm";
import {
	check,
	foreignKey,
	index,
	pgEnum,
	pgTable,
	text,
	timestamp,
	uniqueIndex,
	varchar,
} from "drizzle-orm/pg-core";
import { user } from "../auth/auth.schema";
import { cycleActionRequired } from "./cycle-actions.schema";
import { cycle } from "./cycles.schema";
import { team, workspace } from "./tracker.schema";

export const cycleNotificationKindEnum = pgEnum("cycle_notification_kind", [
	"end_reminder",
	"completion_confirmation",
]);

export const cycleNotification = pgTable(
	"cycle_notification",
	{
		id: text("id").primaryKey(),
		workspaceId: text("workspace_id")
			.notNull()
			.references(() => workspace.id, { onDelete: "cascade" }),
		teamId: text("team_id")
			.notNull()
			.references(() => team.id, { onDelete: "cascade" }),
		cycleId: text("cycle_id")
			.notNull()
			.references(() => cycle.id, { onDelete: "cascade" }),
		actionRequiredId: text("action_required_id"),
		recipientUserId: text("recipient_user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		kind: cycleNotificationKindEnum("kind").notNull(),
		scheduledBoundary: timestamp("scheduled_boundary", {
			withTimezone: true,
		}).notNull(),
		eventRevisionAt: timestamp("event_revision_at", {
			withTimezone: true,
		}).notNull(),
		deliverAt: timestamp("deliver_at", { withTimezone: true }).notNull(),
		cycleName: varchar("cycle_name", { length: 100 }).notNull(),
		teamName: varchar("team_name", { length: 100 }).notNull(),
		createdAt: timestamp("created_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
		readAt: timestamp("read_at", { withTimezone: true }),
		canceledAt: timestamp("canceled_at", { withTimezone: true }),
		cancellationReason: varchar("cancellation_reason", { length: 256 }),
	},
	(table) => [
		foreignKey({
			columns: [table.teamId, table.workspaceId],
			foreignColumns: [team.id, team.workspaceId],
			name: "cycle_notification_team_workspace_fkey",
		}).onDelete("cascade"),
		foreignKey({
			columns: [table.cycleId, table.workspaceId, table.teamId],
			foreignColumns: [cycle.id, cycle.workspaceId, cycle.teamId],
			name: "cycle_notification_cycle_scope_fkey",
		}).onDelete("cascade"),
		foreignKey({
			columns: [
				table.actionRequiredId,
				table.workspaceId,
				table.teamId,
				table.cycleId,
			],
			foreignColumns: [
				cycleActionRequired.id,
				cycleActionRequired.workspaceId,
				cycleActionRequired.teamId,
				cycleActionRequired.cycleId,
			],
			name: "cycle_notification_action_scope_fkey",
		}),
		uniqueIndex("cycle_notification_identity_key").on(
			table.recipientUserId,
			table.cycleId,
			table.kind,
			table.scheduledBoundary,
			table.eventRevisionAt,
		),
		index("cycle_notification_recipient_idx").on(
			table.recipientUserId,
			table.workspaceId,
			table.teamId,
			table.canceledAt,
			table.readAt,
			table.createdAt,
		),
		index("cycle_notification_cycle_idx").on(
			table.workspaceId,
			table.teamId,
			table.cycleId,
			table.canceledAt,
		),
		check(
			"cycle_notification_cancellation_reason_check",
			sql`(${table.canceledAt} is null and ${table.cancellationReason} is null) or (${table.canceledAt} is not null and ${table.cancellationReason} is not null)`,
		),
		check(
			"cycle_notification_action_kind_check",
			sql`(${table.kind} = 'end_reminder' and ${table.actionRequiredId} is null) or (${table.kind} = 'completion_confirmation' and ${table.actionRequiredId} is not null)`,
		),
	],
);

export type CycleNotification = typeof cycleNotification.$inferSelect;
export type CycleNotificationInsert = typeof cycleNotification.$inferInsert;
