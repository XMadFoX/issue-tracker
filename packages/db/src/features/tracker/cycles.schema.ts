import { sql } from "drizzle-orm";
import {
	check,
	index,
	integer,
	pgEnum,
	pgTable,
	text,
	timestamp,
	uniqueIndex,
} from "drizzle-orm/pg-core";
import { team, workspace } from "./tracker.schema";

export const cycleStateEnum = pgEnum("cycle_state", [
	"planned",
	"active",
	"completed",
	"canceled",
]);

export const cycleOriginEnum = pgEnum("cycle_origin", ["manual", "scheduled"]);

export const cycle = pgTable(
	"cycle",
	{
		id: text("id").primaryKey(),
		workspaceId: text("workspace_id")
			.notNull()
			.references(() => workspace.id, { onDelete: "cascade" }),
		teamId: text("team_id")
			.notNull()
			.references(() => team.id, { onDelete: "cascade" }),
		name: text("name").notNull(),
		sequence: integer("sequence").notNull(),
		startDate: timestamp("start_date", { withTimezone: true }).notNull(),
		endDate: timestamp("end_date", { withTimezone: true }).notNull(),
		state: cycleStateEnum("state").default("planned").notNull(),
		origin: cycleOriginEnum("origin").default("manual").notNull(),
		scheduledBoundary: timestamp("scheduled_boundary", { withTimezone: true }),
		capacity: integer("capacity"),
		velocity: integer("velocity"),
		createdAt: timestamp("created_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.defaultNow()
			.notNull()
			.$onUpdate(() => new Date()),
	},
	(table) => [
		uniqueIndex("cycle_team_sequence_key").on(table.teamId, table.sequence),
		uniqueIndex("cycle_team_scheduled_boundary_key")
			.on(table.teamId, table.scheduledBoundary)
			.where(sql`${table.scheduledBoundary} is not null`),
		uniqueIndex("cycle_id_workspace_team_key").on(
			table.id,
			table.workspaceId,
			table.teamId,
		),
		index("cycle_workspace_team_idx").on(table.workspaceId, table.teamId),
		index("cycle_team_state_idx").on(table.teamId, table.state),
		check("cycle_date_range_check", sql`${table.endDate} > ${table.startDate}`),
		check(
			"cycle_origin_scheduled_boundary_check",
			sql`(${table.origin} = 'manual' and ${table.scheduledBoundary} is null) or (${table.origin} = 'scheduled' and ${table.scheduledBoundary} is not null)`,
		),
		check(
			"cycle_capacity_non_negative_check",
			sql`${table.capacity} is null or ${table.capacity} >= 0`,
		),
		check(
			"cycle_velocity_non_negative_check",
			sql`${table.velocity} is null or ${table.velocity} >= 0`,
		),
	],
);
