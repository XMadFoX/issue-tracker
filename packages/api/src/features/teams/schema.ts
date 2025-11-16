import { team } from "db/features/tracker/tracker.schema";
import { createInsertSchema } from "drizzle-zod";
import { workspaceInsertSchema } from "../workspaces/schema";

export const teamInsertSchema = createInsertSchema(team);

export const teamCreateSchema = teamInsertSchema.omit({ id: true });

export const teamListSchema = workspaceInsertSchema.pick({ id: true });

export const teamUpdateSchema = teamInsertSchema
	.partial()
	.required({ id: true, workspaceId: true });

export const teamDeleteSchema = teamInsertSchema.pick({
	id: true,
	workspaceId: true,
});
