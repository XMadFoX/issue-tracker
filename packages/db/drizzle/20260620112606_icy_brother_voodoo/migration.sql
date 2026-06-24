CREATE TABLE "issue_type" (
	"id" text PRIMARY KEY,
	"workspace_id" text NOT NULL,
	"team_id" text,
	"name" text NOT NULL,
	"key" text NOT NULL,
	"icon" text NOT NULL,
	"color" text NOT NULL,
	"description" text,
	"order_index" integer NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"is_editable" boolean DEFAULT true NOT NULL,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "issue_type_allowed_status" (
	"id" text PRIMARY KEY,
	"workspace_id" text NOT NULL,
	"team_id" text,
	"issue_type_id" text NOT NULL,
	"status_id" text NOT NULL,
	"is_initial" boolean DEFAULT false NOT NULL,
	"order_index" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "issue_type_team_override" (
	"id" text PRIMARY KEY,
	"workspace_id" text NOT NULL,
	"team_id" text NOT NULL,
	"source_issue_type_id" text NOT NULL,
	"replacement_issue_type_id" text,
	"hidden_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "issue" ADD COLUMN "issue_type_id" text;--> statement-breakpoint
CREATE UNIQUE INDEX "issue_type_workspace_key_when_global" ON "issue_type" ("workspace_id","key") WHERE team_id is null;--> statement-breakpoint
CREATE UNIQUE INDEX "issue_type_workspace_team_key_when_scoped" ON "issue_type" ("workspace_id","team_id","key") WHERE team_id is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "issue_type_workspace_default_when_global" ON "issue_type" ("workspace_id") WHERE team_id is null and is_default = true;--> statement-breakpoint
CREATE UNIQUE INDEX "issue_type_workspace_team_default_when_scoped" ON "issue_type" ("workspace_id","team_id") WHERE team_id is not null and is_default = true;--> statement-breakpoint
CREATE INDEX "issue_type_workspace_scope_order_idx" ON "issue_type" ("workspace_id","team_id","order_index");--> statement-breakpoint
CREATE INDEX "issue_type_archived_idx" ON "issue_type" ("archived_at");--> statement-breakpoint
CREATE UNIQUE INDEX "issue_type_allowed_status_type_status_when_global" ON "issue_type_allowed_status" ("issue_type_id","status_id") WHERE team_id is null;--> statement-breakpoint
CREATE UNIQUE INDEX "issue_type_allowed_status_type_team_status_when_scoped" ON "issue_type_allowed_status" ("issue_type_id","team_id","status_id") WHERE team_id is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "issue_type_allowed_status_initial_when_global" ON "issue_type_allowed_status" ("issue_type_id") WHERE team_id is null and is_initial = true;--> statement-breakpoint
CREATE UNIQUE INDEX "issue_type_allowed_status_initial_when_scoped" ON "issue_type_allowed_status" ("issue_type_id","team_id") WHERE team_id is not null and is_initial = true;--> statement-breakpoint
CREATE INDEX "issue_type_allowed_status_status_idx" ON "issue_type_allowed_status" ("status_id");--> statement-breakpoint
CREATE INDEX "issue_type_allowed_status_workspace_team_idx" ON "issue_type_allowed_status" ("workspace_id","team_id");--> statement-breakpoint
CREATE UNIQUE INDEX "issue_type_team_override_team_source_key" ON "issue_type_team_override" ("team_id","source_issue_type_id");--> statement-breakpoint
CREATE INDEX "issue_type_team_override_source_idx" ON "issue_type_team_override" ("source_issue_type_id");--> statement-breakpoint
CREATE INDEX "issue_type_team_override_replacement_idx" ON "issue_type_team_override" ("replacement_issue_type_id");--> statement-breakpoint
CREATE INDEX "issue_type_team_override_workspace_team_idx" ON "issue_type_team_override" ("workspace_id","team_id");--> statement-breakpoint
CREATE INDEX "issue_team_issue_type_idx" ON "issue" ("team_id","issue_type_id","archived_at");--> statement-breakpoint
ALTER TABLE "issue_type" ADD CONSTRAINT "issue_type_workspace_id_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspace"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "issue_type" ADD CONSTRAINT "issue_type_team_id_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "team"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "issue_type_allowed_status" ADD CONSTRAINT "issue_type_allowed_status_workspace_id_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspace"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "issue_type_allowed_status" ADD CONSTRAINT "issue_type_allowed_status_team_id_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "team"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "issue_type_allowed_status" ADD CONSTRAINT "issue_type_allowed_status_issue_type_id_issue_type_id_fkey" FOREIGN KEY ("issue_type_id") REFERENCES "issue_type"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "issue_type_allowed_status" ADD CONSTRAINT "issue_type_allowed_status_status_id_issue_status_id_fkey" FOREIGN KEY ("status_id") REFERENCES "issue_status"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "issue_type_team_override" ADD CONSTRAINT "issue_type_team_override_workspace_id_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspace"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "issue_type_team_override" ADD CONSTRAINT "issue_type_team_override_team_id_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "team"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "issue_type_team_override" ADD CONSTRAINT "issue_type_team_override_gaxH5wp3GkzN_fkey" FOREIGN KEY ("source_issue_type_id") REFERENCES "issue_type"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "issue_type_team_override" ADD CONSTRAINT "issue_type_team_override_B4efHt7d9K9k_fkey" FOREIGN KEY ("replacement_issue_type_id") REFERENCES "issue_type"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "issue" ADD CONSTRAINT "issue_issue_type_id_issue_type_id_fkey" FOREIGN KEY ("issue_type_id") REFERENCES "issue_type"("id") ON DELETE RESTRICT;