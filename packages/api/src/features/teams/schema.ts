import { team } from "db/features/tracker/tracker.schema";
import { createInsertSchema } from "drizzle-zod";
import z from "zod";
import { workspaceInsertSchema } from "../workspaces/schema";

export const teamInsertSchema = createInsertSchema(team).extend({
	id: z.cuid2(),
});

export const teamCreateSchema = teamInsertSchema.omit({ id: true });

export const teamListSchema = workspaceInsertSchema.pick({ id: true });

export const teamGetBySlugSchema = workspaceInsertSchema
	.pick({
		slug: true,
	})
	.extend({ workspaceId: workspaceInsertSchema.shape.id });

export const teamUpdateSchema = teamInsertSchema
	.partial()
	.required({ id: true, workspaceId: true });

export const teamDeleteSchema = teamInsertSchema.pick({
	id: true,
	workspaceId: true,
});
