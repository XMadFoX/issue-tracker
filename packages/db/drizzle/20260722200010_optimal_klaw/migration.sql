CREATE TYPE "cycle_schedule_job_status" AS ENUM('queued', 'started', 'succeeded', 'failed');--> statement-breakpoint
CREATE TYPE "cycle_schedule_job_type" AS ENUM('generate_planned_cycles');--> statement-breakpoint
CREATE TABLE "cycle_schedule_job" (
	"id" text PRIMARY KEY,
	"workspace_id" text NOT NULL,
	"team_id" text NOT NULL,
	"job_type" "cycle_schedule_job_type" NOT NULL,
	"scheduled_boundary" timestamp with time zone NOT NULL,
	"status" "cycle_schedule_job_status" DEFAULT 'queued'::"cycle_schedule_job_status" NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"max_attempts" integer DEFAULT 8 NOT NULL,
	"available_at" timestamp with time zone DEFAULT now() NOT NULL,
	"lease_expires_at" timestamp with time zone,
	"worker_id" varchar(128),
	"claim_token" varchar(128),
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"outcome" varchar(64),
	"last_error_code" varchar(128),
	"last_error_summary" varchar(512),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cycle_schedule_job_attempts_check" CHECK ("attempts" >= 0),
	CONSTRAINT "cycle_schedule_job_max_attempts_check" CHECK ("max_attempts" > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX "cycle_schedule_job_team_type_boundary_key" ON "cycle_schedule_job" ("team_id","job_type","scheduled_boundary");--> statement-breakpoint
CREATE INDEX "cycle_schedule_job_queue_idx" ON "cycle_schedule_job" ("status","available_at","lease_expires_at","id");--> statement-breakpoint
ALTER TABLE "cycle_schedule_job" ADD CONSTRAINT "cycle_schedule_job_workspace_id_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspace"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "cycle_schedule_job" ADD CONSTRAINT "cycle_schedule_job_team_id_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "team"("id") ON DELETE CASCADE;