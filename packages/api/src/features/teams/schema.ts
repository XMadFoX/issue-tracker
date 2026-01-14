import { team } from "db/features/tracker/tracker.schema";
import { createInsertSchema } from "drizzle-zod";
import z from "zod";
import { workspaceInsertSchema } from "../workspaces/schema";

export const teamInsertSchema = createInsertSchema(team).extend({
	id: z.cuid2(),
	key: z.string().regex(/^[A-z0-9-]+$/),
});

export const teamCreateSchema = teamInsertSchema.omit({ id: true }).extend({
	name: teamInsertSchema.shape.name.min(1).max(32),
	key: teamInsertSchema.shape.key.min(1).max(12),
});

export const teamListSchema = workspaceInsertSchema.pick({ id: true });

export const teamGetBySlugSchema = teamInsertSchema
	.pick({
		key: true,
	})
	.extend({ workspaceId: workspaceInsertSchema.shape.id });

export const teamUpdateSchema = teamInsertSchema
	.partial()
	.required({ id: true, workspaceId: true });

export const teamDeleteSchema = teamInsertSchema.pick({
	id: true,
	workspaceId: true,
});
