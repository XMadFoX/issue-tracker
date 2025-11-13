ALTER TABLE "team_membership" RENAME COLUMN "role" TO "role_id";--> statement-breakpoint
ALTER TABLE "workspace_membership" ALTER COLUMN "role_id" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "team_membership" ADD COLUMN "status" text DEFAULT 'active' NOT NULL;--> statement-breakpoint
ALTER TABLE "team_membership" ADD COLUMN "invited_by" text;--> statement-breakpoint
ALTER TABLE "team_membership" ADD COLUMN "last_seen_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "team_membership" ADD CONSTRAINT "team_membership_role_id_role_definitions_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."role_definitions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_membership" ADD CONSTRAINT "team_membership_invited_by_user_id_fk" FOREIGN KEY ("invited_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_membership" DROP COLUMN "is_default";