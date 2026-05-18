CREATE TYPE "issue_activity_action_type" AS ENUM('issue.created', 'issue.updated', 'issue.status_changed', 'issue.estimate_changed', 'issue.cycle_assigned', 'issue.cycle_unassigned');--> statement-breakpoint
CREATE TABLE "issue_activity" (
	"id" text PRIMARY KEY,
	"workspace_id" text NOT NULL,
	"team_id" text NOT NULL,
	"issue_id" text NOT NULL,
	"actor_id" text,
	"cycle_id" text,
	"action_type" "issue_activity_action_type" NOT NULL,
	"field" text,
	"from_value" jsonb,
	"to_value" jsonb,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "issue" ADD COLUMN "estimate" integer;--> statement-breakpoint
CREATE INDEX "issue_activity_workspace_issue_created_idx" ON "issue_activity" ("workspace_id","issue_id","created_at");--> statement-breakpoint
CREATE INDEX "issue_activity_workspace_team_created_idx" ON "issue_activity" ("workspace_id","team_id","created_at");--> statement-breakpoint
CREATE INDEX "issue_activity_workspace_action_created_idx" ON "issue_activity" ("workspace_id","action_type","created_at");--> statement-breakpoint
CREATE INDEX "issue_activity_workspace_cycle_created_idx" ON "issue_activity" ("workspace_id","cycle_id","created_at");--> statement-breakpoint
ALTER TABLE "issue_activity" ADD CONSTRAINT "issue_activity_workspace_id_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspace"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "issue_activity" ADD CONSTRAINT "issue_activity_team_id_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "team"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "issue_activity" ADD CONSTRAINT "issue_activity_issue_id_issue_id_fkey" FOREIGN KEY ("issue_id") REFERENCES "issue"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "issue_activity" ADD CONSTRAINT "issue_activity_actor_id_user_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "user"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "issue_activity" ADD CONSTRAINT "issue_activity_cycle_id_cycle_id_fkey" FOREIGN KEY ("cycle_id") REFERENCES "cycle"("id") ON DELETE SET NULL;