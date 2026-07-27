import { sql } from "drizzle-orm";
import {
	boolean,
	check,
	integer,
	pgEnum,
	pgTable,
	text,
	timestamp,
} from "drizzle-orm/pg-core";
import { user } from "../auth/auth.schema";
import { team } from "./tracker.schema";

export const teamCycleEndBehaviorEnum = pgEnum("team_cycle_end_behavior", [
	"automatic",
	"confirmation_required",
	"reminder_only",
]);

export const cycleRolloverPolicyEnum = pgEnum("cycle_rollover_policy", [
	"carry_over",
	"move_to_backlog",
]);

export const teamCycleSettings = pgTable(
	"team_cycle_settings",
	{
		teamId: text("team_id")
			.primaryKey()
			.references(() => team.id, { onDelete: "cascade" }),
		cadenceEnabled: boolean("cadence_enabled").default(false).notNull(),
		cadenceDays: integer("cadence_days").notNull(),
		anchorDate: timestamp("anchor_date", { withTimezone: true }),
		planningHorizon: integer("planning_horizon").default(2).notNull(),
		endBehavior: teamCycleEndBehaviorEnum("end_behavior")
			.default("automatic")
			.notNull(),
		gracePeriodMinutes: integer("grace_period_minutes").default(1440).notNull(),
		defaultRolloverPolicy: cycleRolloverPolicyEnum("default_rollover_policy")
			.default("carry_over")
			.notNull(),
		reminderLeadMinutes: integer("reminder_lead_minutes")
			.default(1440)
			.notNull(),
		updatedBy: text("updated_by").references(() => user.id, {
			onDelete: "set null",
		}),
		createdAt: timestamp("created_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.defaultNow()
			.notNull()
			.$onUpdate(() => new Date()),
	},
	(table) => [
		check(
			"team_cycle_settings_cadence_days_check",
			sql`${table.cadenceDays} > 0`,
		),
		check(
			"team_cycle_settings_planning_horizon_check",
			sql`${table.planningHorizon} between 1 and 12`,
		),
		check(
			"team_cycle_settings_grace_period_minutes_check",
			sql`${table.gracePeriodMinutes} >= 0`,
		),
		check(
			"team_cycle_settings_reminder_lead_minutes_check",
			sql`${table.reminderLeadMinutes} >= 0`,
		),
	],
);
