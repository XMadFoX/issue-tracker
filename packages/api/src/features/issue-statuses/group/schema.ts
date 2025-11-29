import { issueStatusGroup } from "db/features/tracker/issue-statuses.schema";
import { createInsertSchema } from "drizzle-zod";

export const issueStatusGroupInsertSchema =
	createInsertSchema(issueStatusGroup);

export const issueStatusGroupCreateSchema = issueStatusGroupInsertSchema.omit({
	id: true,
});

export const issueStatusGroupUpdateSchema = issueStatusGroupInsertSchema
	.partial()
	.required({ id: true, workspaceId: true });

export const issueStatusGroupDeleteSchema = issueStatusGroupInsertSchema.pick({
	id: true,
	workspaceId: true,
});
