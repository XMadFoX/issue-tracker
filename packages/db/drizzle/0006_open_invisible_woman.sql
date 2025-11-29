CREATE TABLE "issue_status" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"team_id" text,
	"group_id" text NOT NULL,
	"name" text NOT NULL,
	"key" text NOT NULL,
	"color" text,
	"order_index" integer NOT NULL,
	"default_for_new" boolean DEFAULT false NOT NULL,
	"is_terminal" boolean DEFAULT false NOT NULL,
	"is_backlog" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "issue_status_group" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"name" text NOT NULL,
	"category" text NOT NULL,
	"order_index" integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE "issue_status" ADD CONSTRAINT "issue_status_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issue_status" ADD CONSTRAINT "issue_status_team_id_team_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."team"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issue_status" ADD CONSTRAINT "issue_status_group_id_issue_status_group_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."issue_status_group"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issue_status_group" ADD CONSTRAINT "issue_status_group_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "issue_status_workspace_key_key" ON "issue_status" USING btree ("workspace_id","key");--> statement-breakpoint
CREATE UNIQUE INDEX "issue_status_group_workspace_name_key" ON "issue_status_group" USING btree ("workspace_id","name");