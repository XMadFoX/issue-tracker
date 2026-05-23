ALTER TABLE "cycle" ADD CONSTRAINT "cycle_date_range_check" CHECK ("end_date" > "start_date");--> statement-breakpoint
ALTER TABLE "cycle" ADD CONSTRAINT "cycle_capacity_non_negative_check" CHECK ("capacity" is null or "capacity" >= 0);--> statement-breakpoint
ALTER TABLE "cycle" ADD CONSTRAINT "cycle_velocity_non_negative_check" CHECK ("velocity" is null or "velocity" >= 0);