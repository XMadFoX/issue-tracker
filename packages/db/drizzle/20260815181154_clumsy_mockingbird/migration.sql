ALTER TYPE "cycle_schedule_job_status" ADD VALUE 'blocked' BEFORE 'succeeded';--> statement-breakpoint
ALTER TYPE "cycle_schedule_job_type" ADD VALUE 'start_scheduled_cycle';--> statement-breakpoint
ALTER TYPE "cycle_schedule_job_type" ADD VALUE 'complete_scheduled_cycle';--> statement-breakpoint
ALTER TABLE "cycle_schedule_job" ADD CONSTRAINT "cycle_schedule_job_blocked_state_check" CHECK (("status" <> 'blocked' OR ("job_type" = 'start_scheduled_cycle' AND "lease_expires_at" IS NULL AND "worker_id" IS NULL AND "claim_token" IS NULL AND "started_at" IS NOT NULL AND "finished_at" IS NULL)));