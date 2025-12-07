import { issuePriority } from "db/features/tracker/issue-priorities.schema";
import { createInsertSchema } from "drizzle-zod";

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
