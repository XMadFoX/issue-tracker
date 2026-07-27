CREATE TYPE "cycle_rollover_policy" AS ENUM('carry_over', 'move_to_backlog');--> statement-breakpoint
CREATE TYPE "team_cycle_end_behavior" AS ENUM('automatic', 'confirmation_required', 'reminder_only');--> statement-breakpoint
CREATE TABLE "team_cycle_settings" (
	"team_id" text PRIMARY KEY,
	"cadence_enabled" boolean DEFAULT false NOT NULL,
	"cadence_days" integer NOT NULL,
	"anchor_date" timestamp with time zone,
	"planning_horizon" integer DEFAULT 2 NOT NULL,
	"end_behavior" "team_cycle_end_behavior" DEFAULT 'automatic'::"team_cycle_end_behavior" NOT NULL,
	"grace_period_minutes" integer DEFAULT 1440 NOT NULL,
	"default_rollover_policy" "cycle_rollover_policy" DEFAULT 'carry_over'::"cycle_rollover_policy" NOT NULL,
	"reminder_lead_minutes" integer DEFAULT 1440 NOT NULL,
	"updated_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "team_cycle_settings_cadence_days_check" CHECK ("cadence_days" > 0),
	CONSTRAINT "team_cycle_settings_planning_horizon_check" CHECK ("planning_horizon" between 1 and 12),
	CONSTRAINT "team_cycle_settings_grace_period_minutes_check" CHECK ("grace_period_minutes" >= 0),
	CONSTRAINT "team_cycle_settings_reminder_lead_minutes_check" CHECK ("reminder_lead_minutes" >= 0)
);
--> statement-breakpoint
ALTER TABLE "team_cycle_settings" ADD CONSTRAINT "team_cycle_settings_team_id_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "team"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "team_cycle_settings" ADD CONSTRAINT "team_cycle_settings_updated_by_user_id_fkey" FOREIGN KEY ("updated_by") REFERENCES "user"("id") ON DELETE SET NULL;