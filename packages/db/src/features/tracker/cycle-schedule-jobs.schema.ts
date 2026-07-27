import { sql } from "drizzle-orm";
import {
	check,
	foreignKey,
	index,
	integer,
	pgEnum,
	pgTable,
	text,
	timestamp,
	uniqueIndex,
	varchar,
} from "drizzle-orm/pg-core";
import { team, workspace } from "./tracker.schema";

export const cycleScheduleJobTypeEnum = pgEnum("cycle_schedule_job_type", [
	"generate_planned_cycles",
]);

export const cycleScheduleJobStatusEnum = pgEnum("cycle_schedule_job_status", [
	"queued",
	"started",
	"succeeded",
	"failed",
]);

export const cycleScheduleJob = pgTable(
	"cycle_schedule_job",
	{
		id: text("id").primaryKey(),
		workspaceId: text("workspace_id")
			.notNull()
			.references(() => workspace.id, { onDelete: "cascade" }),
		teamId: text("team_id")
			.notNull()
			.references(() => team.id, { onDelete: "cascade" }),
		jobType: cycleScheduleJobTypeEnum("job_type").notNull(),
		scheduledBoundary: timestamp("scheduled_boundary", {
			withTimezone: true,
		}).notNull(),
		status: cycleScheduleJobStatusEnum("status").default("queued").notNull(),
		attempts: integer("attempts").default(0).notNull(),
		maxAttempts: integer("max_attempts").default(8).notNull(),
		availableAt: timestamp("available_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
		leaseExpiresAt: timestamp("lease_expires_at", { withTimezone: true }),
		workerId: varchar("worker_id", { length: 128 }),
		claimToken: varchar("claim_token", { length: 128 }),
		startedAt: timestamp("started_at", { withTimezone: true }),
		finishedAt: timestamp("finished_at", { withTimezone: true }),
		outcome: varchar("outcome", { length: 64 }),
		lastErrorCode: varchar("last_error_code", { length: 128 }),
		lastErrorSummary: varchar("last_error_summary", { length: 512 }),
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
			name: "cycle_schedule_job_team_workspace_fkey",
		}).onDelete("cascade"),
		uniqueIndex("cycle_schedule_job_team_type_boundary_key").on(
			table.teamId,
			table.jobType,
			table.scheduledBoundary,
		),
		index("cycle_schedule_job_queue_idx").on(
			table.status,
			table.availableAt,
			table.leaseExpiresAt,
			table.id,
		),
		check(
			"cycle_schedule_job_attempts_check",
			sql`${table.attempts} >= 0 AND ${table.attempts} <= ${table.maxAttempts}`,
		),
		check(
			"cycle_schedule_job_max_attempts_check",
			sql`${table.maxAttempts} > 0`,
		),
		check(
			"cycle_schedule_job_queued_state_check",
			sql`(${table.status} <> 'queued' OR (${table.leaseExpiresAt} IS NULL AND ${table.workerId} IS NULL AND ${table.claimToken} IS NULL AND ${table.finishedAt} IS NULL))`,
		),
		check(
			"cycle_schedule_job_started_state_check",
			sql`(${table.status} <> 'started' OR (${table.attempts} >= 1 AND ${table.leaseExpiresAt} IS NOT NULL AND ${table.workerId} IS NOT NULL AND ${table.claimToken} IS NOT NULL AND ${table.startedAt} IS NOT NULL AND ${table.finishedAt} IS NULL))`,
		),
		check(
			"cycle_schedule_job_terminal_state_check",
			sql`(${table.status} NOT IN ('succeeded', 'failed') OR (${table.finishedAt} IS NOT NULL AND ${table.leaseExpiresAt} IS NULL AND ${table.workerId} IS NULL AND ${table.claimToken} IS NULL))`,
		),
	],
);

export type CycleScheduleJob = typeof cycleScheduleJob.$inferSelect;
export type CycleScheduleJobInsert = typeof cycleScheduleJob.$inferInsert;
