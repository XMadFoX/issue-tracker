CREATE TYPE "public"."canonical_category" AS ENUM('backlog', 'planned', 'in_progress', 'completed', 'canceled');--> statement-breakpoint
ALTER TABLE "issue_status" RENAME COLUMN "group_id" TO "status_group_id";--> statement-breakpoint
ALTER TABLE "issue_status_group" RENAME COLUMN "category" TO "canonical_category";--> statement-breakpoint
ALTER TABLE "issue_status" DROP CONSTRAINT "issue_status_group_id_issue_status_group_id_fk";
--> statement-breakpoint
DROP INDEX "issue_status_workspace_key_key";--> statement-breakpoint
DROP INDEX "issue_status_group_workspace_name_key";--> statement-breakpoint
ALTER TABLE "issue_status" ADD COLUMN "description" text;--> statement-breakpoint
ALTER TABLE "issue_status" ADD COLUMN "created_at" timestamp DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "issue_status" ADD COLUMN "updated_at" timestamp DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "issue_status_group" ADD COLUMN "key" text NOT NULL;--> statement-breakpoint
ALTER TABLE "issue_status_group" ADD COLUMN "description" text;--> statement-breakpoint
ALTER TABLE "issue_status_group" ADD COLUMN "is_editable" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "issue_status_group" ADD COLUMN "created_at" timestamp DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "issue_status_group" ADD COLUMN "updated_at" timestamp DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "issue_status" ADD CONSTRAINT "issue_status_status_group_id_issue_status_group_id_fk" FOREIGN KEY ("status_group_id") REFERENCES "public"."issue_status_group"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "issue_status_workspace_name_key" ON "issue_status" USING btree ("workspace_id","name");--> statement-breakpoint
CREATE UNIQUE INDEX "issue_status_group_workspace_key_key" ON "issue_status_group" USING btree ("workspace_id","key");--> statement-breakpoint
ALTER TABLE "issue_status" DROP COLUMN "key";--> statement-breakpoint
ALTER TABLE "issue_status" DROP COLUMN "default_for_new";--> statement-breakpoint
ALTER TABLE "issue_status" DROP COLUMN "is_terminal";--> statement-breakpoint
ALTER TABLE "issue_status" DROP COLUMN "is_backlog";