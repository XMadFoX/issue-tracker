import { issueStatus } from "db/features/tracker/issue-statuses.schema";
import { createInsertSchema } from "drizzle-zod";

export const issueStatusInsertSchema = createInsertSchema(issueStatus);

export const issueStatusCreateSchema = issueStatusInsertSchema.omit({
	id: true,
});

export const issueStatusUpdateSchema = issueStatusInsertSchema
	.partial()
	.required({ id: true, workspaceId: true });

export const issueStatusDeleteSchema = issueStatusInsertSchema.pick({
	id: true,
	workspaceId: true,
});
