import { workspace } from "db/features/tracker/tracker.schema";
import { createInsertSchema } from "drizzle-zod";
import z from "zod";

export const workspaceInsertSchema = createInsertSchema(workspace)
	.omit({ createdAt: true, updatedAt: true })
	.extend({
		name: z.string().min(1),
		slug: z.string().regex(/^[a-z0-9-]+$/),
		// TODO: enforce timezone validation
		timezone: z.string().regex(/^[a-zA-Z/]+$/),
	});
export const workspaceCreateSchema = workspaceInsertSchema.omit({ id: true });
export const workspaceUpdateSchema = workspaceInsertSchema
	.partial()
	.required({ id: true });
export const workspaceDeleteSchema = workspaceInsertSchema.pick({ id: true });
