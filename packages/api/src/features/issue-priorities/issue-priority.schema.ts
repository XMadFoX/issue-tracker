import { issuePriority } from "db/features/tracker/issue-priorities.schema";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { workspaceInsertSchema } from "../workspaces/schema";

export const issuePriorityInsertSchema = createInsertSchema(issuePriority);

export const issuePriorityCreateSchema = issuePriorityInsertSchema.omit({
	id: true,
});

export const issuePriorityUpdateSchema = issuePriorityInsertSchema
	.partial()
	.required({ id: true, workspaceId: true });

export const issuePriorityDeleteSchema = issuePriorityInsertSchema.pick({
	id: true,
	workspaceId: true,
});

const baseReorderSchema = z.object({
	workspaceId: workspaceInsertSchema.shape.id,
});

export const reorderPrioritiesSchema = baseReorderSchema.extend({
	orderedIds: z.array(issuePriorityInsertSchema.shape.id),
});
