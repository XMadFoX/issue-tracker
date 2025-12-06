CREATE TABLE "label" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"team_id" text,
	"name" text NOT NULL,
	"color" text,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "label" ADD CONSTRAINT "label_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "label" ADD CONSTRAINT "label_team_id_team_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."team"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "label_workspace_name_when_global" ON "label" USING btree ("workspace_id","name") WHERE team_id is null;--> statement-breakpoint
CREATE UNIQUE INDEX "label_workspace_team_name_when_scoped" ON "label" USING btree ("workspace_id","team_id","name") WHERE team_id is not null;