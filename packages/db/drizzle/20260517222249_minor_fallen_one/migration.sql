ALTER TABLE "issue_activity" DROP CONSTRAINT "issue_activity_team_id_team_id_fkey";--> statement-breakpoint
ALTER TABLE "issue_activity" DROP CONSTRAINT "issue_activity_issue_id_issue_id_fkey";--> statement-breakpoint
CREATE UNIQUE INDEX "cycle_id_workspace_team_key" ON "cycle" ("id","workspace_id","team_id");--> statement-breakpoint
ALTER TABLE "issue_activity" ADD CONSTRAINT "issue_activity_cycle_workspace_team_fkey" FOREIGN KEY ("cycle_id","workspace_id","team_id") REFERENCES "cycle"("id","workspace_id","team_id");