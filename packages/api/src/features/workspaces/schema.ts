import { workspace } from "db/features/tracker/tracker.schema";
import { createInsertSchema } from "drizzle-zod";

export const workspaceInsertSchema = createInsertSchema(workspace);
export const workspaceCreateSchema = workspaceInsertSchema.omit({ id: true });
export const workspaceUpdateSchema = workspaceInsertSchema
	.partial()
	.required({ id: true });
export const workspaceDeleteSchema = workspaceInsertSchema.pick({ id: true });
