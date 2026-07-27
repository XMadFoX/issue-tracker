CREATE TYPE "cycle_origin" AS ENUM('manual', 'scheduled');--> statement-breakpoint
ALTER TABLE "cycle" ADD COLUMN "origin" "cycle_origin" DEFAULT 'manual'::"cycle_origin" NOT NULL;--> statement-breakpoint
ALTER TABLE "cycle" ADD COLUMN "scheduled_boundary" timestamp with time zone;--> statement-breakpoint
CREATE UNIQUE INDEX "cycle_team_scheduled_boundary_key" ON "cycle" ("team_id","scheduled_boundary") WHERE "scheduled_boundary" is not null;--> statement-breakpoint
ALTER TABLE "cycle" ADD CONSTRAINT "cycle_origin_scheduled_boundary_check" CHECK (("origin" = 'manual' and "scheduled_boundary" is null) or ("origin" = 'scheduled' and "scheduled_boundary" is not null));