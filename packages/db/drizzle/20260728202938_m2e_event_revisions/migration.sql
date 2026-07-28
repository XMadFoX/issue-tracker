CREATE TYPE "cycle_action_required_kind" AS ENUM('completion_confirmation');--> statement-breakpoint
CREATE TYPE "cycle_action_required_status" AS ENUM('open', 'resolved', 'canceled');--> statement-breakpoint
CREATE TYPE "cycle_notification_kind" AS ENUM('end_reminder', 'completion_confirmation');--> statement-breakpoint
ALTER TYPE "cycle_schedule_job_type" ADD VALUE 'send_cycle_reminder';--> statement-breakpoint
ALTER TYPE "cycle_schedule_job_type" ADD VALUE 'create_cycle_confirmation_required';--> statement-breakpoint
CREATE TABLE "cycle_action_required" (
	"id" text PRIMARY KEY,
	"workspace_id" text NOT NULL,
	"team_id" text NOT NULL,
	"cycle_id" text NOT NULL,
	"kind" "cycle_action_required_kind" NOT NULL,
	"scheduled_boundary" timestamp with time zone NOT NULL,
	"event_revision_at" timestamp with time zone NOT NULL,
	"due_at" timestamp with time zone NOT NULL,
	"status" "cycle_action_required_status" DEFAULT 'open'::"cycle_action_required_status" NOT NULL,
	"resolved_at" timestamp with time zone,
	"resolved_by" text,
	"canceled_at" timestamp with time zone,
	"cancellation_reason" varchar(256),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cycle_action_required_terminal_timestamps_check" CHECK (("status" = 'open' and "resolved_at" is null and "canceled_at" is null) or ("status" = 'resolved' and "resolved_at" is not null and "canceled_at" is null) or ("status" = 'canceled' and "canceled_at" is not null and "resolved_at" is null)),
	CONSTRAINT "cycle_action_required_cancellation_reason_check" CHECK (("status" <> 'canceled' and "cancellation_reason" is null) or ("status" = 'canceled' and "cancellation_reason" is not null)),
	CONSTRAINT "cycle_action_required_kind_check" CHECK ("kind" = 'completion_confirmation')
);
--> statement-breakpoint
CREATE TABLE "cycle_notification" (
	"id" text PRIMARY KEY,
	"workspace_id" text NOT NULL,
	"team_id" text NOT NULL,
	"cycle_id" text NOT NULL,
	"action_required_id" text,
	"recipient_user_id" text NOT NULL,
	"kind" "cycle_notification_kind" NOT NULL,
	"scheduled_boundary" timestamp with time zone NOT NULL,
	"event_revision_at" timestamp with time zone NOT NULL,
	"deliver_at" timestamp with time zone NOT NULL,
	"cycle_name" varchar(100) NOT NULL,
	"team_name" varchar(100) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"read_at" timestamp with time zone,
	"canceled_at" timestamp with time zone,
	"cancellation_reason" varchar(256),
	CONSTRAINT "cycle_notification_cancellation_reason_check" CHECK (("canceled_at" is null and "cancellation_reason" is null) or ("canceled_at" is not null and "cancellation_reason" is not null)),
	CONSTRAINT "cycle_notification_action_kind_check" CHECK (("kind" = 'end_reminder' and "action_required_id" is null) or ("kind" = 'completion_confirmation' and "action_required_id" is not null))
);
--> statement-breakpoint
DROP INDEX "cycle_schedule_job_team_type_boundary_key";--> statement-breakpoint
ALTER TABLE "cycle_schedule_job" ADD COLUMN "cycle_id" text;--> statement-breakpoint
ALTER TABLE "cycle_schedule_job" ADD COLUMN "event_revision_at" timestamp with time zone;--> statement-breakpoint
CREATE UNIQUE INDEX "cycle_action_required_identity_key" ON "cycle_action_required" ("cycle_id","kind","scheduled_boundary","event_revision_at");--> statement-breakpoint
CREATE UNIQUE INDEX "cycle_action_required_scope_identity_key" ON "cycle_action_required" ("id","workspace_id","team_id","cycle_id");--> statement-breakpoint
CREATE INDEX "cycle_action_required_pending_idx" ON "cycle_action_required" ("workspace_id","team_id","status","due_at");--> statement-breakpoint
CREATE UNIQUE INDEX "cycle_notification_identity_key" ON "cycle_notification" ("recipient_user_id","cycle_id","kind","scheduled_boundary","event_revision_at");--> statement-breakpoint
CREATE INDEX "cycle_notification_recipient_idx" ON "cycle_notification" ("recipient_user_id","workspace_id","team_id","canceled_at","read_at","created_at");--> statement-breakpoint
CREATE INDEX "cycle_notification_cycle_idx" ON "cycle_notification" ("workspace_id","team_id","cycle_id","canceled_at");--> statement-breakpoint
CREATE INDEX "cycle_schedule_job_cycle_idx" ON "cycle_schedule_job" ("cycle_id");--> statement-breakpoint
CREATE UNIQUE INDEX "cycle_schedule_job_generation_boundary_key" ON "cycle_schedule_job" ("team_id","job_type","scheduled_boundary") WHERE "job_type" = 'generate_planned_cycles';--> statement-breakpoint
CREATE UNIQUE INDEX "cycle_schedule_job_event_identity_key" ON "cycle_schedule_job" ("cycle_id","job_type","scheduled_boundary","event_revision_at") WHERE "job_type" <> 'generate_planned_cycles';--> statement-breakpoint
ALTER TABLE "cycle_action_required" ADD CONSTRAINT "cycle_action_required_workspace_id_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspace"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "cycle_action_required" ADD CONSTRAINT "cycle_action_required_team_id_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "team"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "cycle_action_required" ADD CONSTRAINT "cycle_action_required_cycle_id_cycle_id_fkey" FOREIGN KEY ("cycle_id") REFERENCES "cycle"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "cycle_action_required" ADD CONSTRAINT "cycle_action_required_resolved_by_user_id_fkey" FOREIGN KEY ("resolved_by") REFERENCES "user"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "cycle_action_required" ADD CONSTRAINT "cycle_action_required_team_workspace_fkey" FOREIGN KEY ("team_id","workspace_id") REFERENCES "team"("id","workspace_id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "cycle_action_required" ADD CONSTRAINT "cycle_action_required_cycle_scope_fkey" FOREIGN KEY ("cycle_id","workspace_id","team_id") REFERENCES "cycle"("id","workspace_id","team_id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "cycle_notification" ADD CONSTRAINT "cycle_notification_workspace_id_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspace"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "cycle_notification" ADD CONSTRAINT "cycle_notification_team_id_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "team"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "cycle_notification" ADD CONSTRAINT "cycle_notification_cycle_id_cycle_id_fkey" FOREIGN KEY ("cycle_id") REFERENCES "cycle"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "cycle_notification" ADD CONSTRAINT "cycle_notification_recipient_user_id_user_id_fkey" FOREIGN KEY ("recipient_user_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "cycle_notification" ADD CONSTRAINT "cycle_notification_team_workspace_fkey" FOREIGN KEY ("team_id","workspace_id") REFERENCES "team"("id","workspace_id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "cycle_notification" ADD CONSTRAINT "cycle_notification_cycle_scope_fkey" FOREIGN KEY ("cycle_id","workspace_id","team_id") REFERENCES "cycle"("id","workspace_id","team_id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "cycle_notification" ADD CONSTRAINT "cycle_notification_action_scope_fkey" FOREIGN KEY ("action_required_id","workspace_id","team_id","cycle_id") REFERENCES "cycle_action_required"("id","workspace_id","team_id","cycle_id");--> statement-breakpoint
ALTER TABLE "cycle_schedule_job" ADD CONSTRAINT "cycle_schedule_job_cycle_id_cycle_id_fkey" FOREIGN KEY ("cycle_id") REFERENCES "cycle"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "cycle_schedule_job" ADD CONSTRAINT "cycle_schedule_job_cycle_scope_fkey" FOREIGN KEY ("cycle_id","workspace_id","team_id") REFERENCES "cycle"("id","workspace_id","team_id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "cycle_schedule_job" ADD CONSTRAINT "cycle_schedule_job_type_cycle_check" CHECK (("job_type" = 'generate_planned_cycles' and "cycle_id" is null and "event_revision_at" is null) or ("job_type" <> 'generate_planned_cycles' and "cycle_id" is not null and "event_revision_at" is not null));