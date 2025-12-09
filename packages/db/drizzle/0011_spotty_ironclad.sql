CREATE TABLE "issue" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"team_id" text NOT NULL,
	"number" integer NOT NULL,
	"title" text NOT NULL,
	"description" jsonb,
	"status_id" text NOT NULL,
	"priority_id" text,
	"due_date" timestamp with time zone,
	"sort_order" double precision DEFAULT 0 NOT NULL,
	"assignee_id" text,
	"reporter_id" text,
	"creator_id" text NOT NULL,
	"parent_issue_id" text,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "issue_label" (
	"issue_id" text NOT NULL,
	"label_id" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "issue" ADD CONSTRAINT "issue_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issue" ADD CONSTRAINT "issue_team_id_team_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."team"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issue" ADD CONSTRAINT "issue_status_id_issue_status_id_fk" FOREIGN KEY ("status_id") REFERENCES "public"."issue_status"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issue" ADD CONSTRAINT "issue_priority_id_issue_priority_id_fk" FOREIGN KEY ("priority_id") REFERENCES "public"."issue_priority"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issue" ADD CONSTRAINT "issue_assignee_id_user_id_fk" FOREIGN KEY ("assignee_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issue" ADD CONSTRAINT "issue_reporter_id_user_id_fk" FOREIGN KEY ("reporter_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issue" ADD CONSTRAINT "issue_creator_id_user_id_fk" FOREIGN KEY ("creator_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issue" ADD CONSTRAINT "issue_parent_issue_id_issue_id_fk" FOREIGN KEY ("parent_issue_id") REFERENCES "public"."issue"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issue_label" ADD CONSTRAINT "issue_label_issue_id_issue_id_fk" FOREIGN KEY ("issue_id") REFERENCES "public"."issue"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issue_label" ADD CONSTRAINT "issue_label_label_id_label_id_fk" FOREIGN KEY ("label_id") REFERENCES "public"."label"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "issue_team_number_key" ON "issue" USING btree ("team_id","number");--> statement-breakpoint
CREATE INDEX "issue_team_status_idx" ON "issue" USING btree ("team_id","status_id","archived_at");--> statement-breakpoint
CREATE INDEX "issue_title_search_idx" ON "issue" USING btree ("title");--> statement-breakpoint
CREATE INDEX "issue_parent_idx" ON "issue" USING btree ("parent_issue_id");--> statement-breakpoint
CREATE INDEX "issue_label_issue_idx" ON "issue_label" USING btree ("issue_id");--> statement-breakpoint
CREATE INDEX "issue_label_label_idx" ON "issue_label" USING btree ("label_id");--> statement-breakpoint
CREATE UNIQUE INDEX "issue_label_pk" ON "issue_label" USING btree ("issue_id","label_id");