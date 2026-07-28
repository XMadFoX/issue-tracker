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
import { cycle } from "./cycles.schema";
import { team, workspace } from "./tracker.schema";

export const cycleActionRequiredKindEnum = pgEnum(
	"cycle_action_required_kind",
	["completion_confirmation"],
);

export const cycleActionRequiredStatusEnum = pgEnum(
	"cycle_action_required_status",
	["open", "resolved", "canceled"],
);

export const cycleActionRequired = pgTable(
	"cycle_action_required",
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
		kind: cycleActionRequiredKindEnum("kind").notNull(),
		scheduledBoundary: timestamp("scheduled_boundary", {
			withTimezone: true,
		}).notNull(),
		eventRevisionAt: timestamp("event_revision_at", {
			withTimezone: true,
		}).notNull(),
		dueAt: timestamp("due_at", { withTimezone: true }).notNull(),
		status: cycleActionRequiredStatusEnum("status").default("open").notNull(),
		resolvedAt: timestamp("resolved_at", { withTimezone: true }),
		resolvedBy: text("resolved_by").references(() => user.id, {
			onDelete: "set null",
		}),
		canceledAt: timestamp("canceled_at", { withTimezone: true }),
		cancellationReason: varchar("cancellation_reason", { length: 256 }),
		createdAt: timestamp("created_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.defaultNow()
			.notNull()
			.$onUpdate(() => new Date()),
	},
	(table) => [
		foreignKey({
			columns: [table.teamId, table.workspaceId],
			foreignColumns: [team.id, team.workspaceId],
			name: "cycle_action_required_team_workspace_fkey",
		}).onDelete("cascade"),
		foreignKey({
			columns: [table.cycleId, table.workspaceId, table.teamId],
			foreignColumns: [cycle.id, cycle.workspaceId, cycle.teamId],
			name: "cycle_action_required_cycle_scope_fkey",
		}).onDelete("cascade"),
		uniqueIndex("cycle_action_required_identity_key").on(
			table.cycleId,
			table.kind,
			table.scheduledBoundary,
			table.eventRevisionAt,
		),
		uniqueIndex("cycle_action_required_scope_identity_key").on(
			table.id,
			table.workspaceId,
			table.teamId,
			table.cycleId,
		),
		index("cycle_action_required_pending_idx").on(
			table.workspaceId,
			table.teamId,
			table.status,
			table.dueAt,
		),
		check(
			"cycle_action_required_terminal_timestamps_check",
			sql`(${table.status} = 'open' and ${table.resolvedAt} is null and ${table.canceledAt} is null) or (${table.status} = 'resolved' and ${table.resolvedAt} is not null and ${table.canceledAt} is null) or (${table.status} = 'canceled' and ${table.canceledAt} is not null and ${table.resolvedAt} is null)`,
		),
		check(
			"cycle_action_required_cancellation_reason_check",
			sql`(${table.status} <> 'canceled' and ${table.cancellationReason} is null) or (${table.status} = 'canceled' and ${table.cancellationReason} is not null)`,
		),
		check(
			"cycle_action_required_kind_check",
			sql`${table.kind} = 'completion_confirmation'`,
		),
	],
);

export type CycleActionRequired = typeof cycleActionRequired.$inferSelect;
export type CycleActionRequiredInsert = typeof cycleActionRequired.$inferInsert;
