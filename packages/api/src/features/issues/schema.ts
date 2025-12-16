import { issue } from "db/features/tracker/issues.schema";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { teamInsertSchema } from "../teams/schema";
import { workspaceInsertSchema } from "../workspaces/schema";

export const issueInsertSchema = createInsertSchema(issue);

export const issueCreateSchema = issueInsertSchema
	.omit({
		id: true,
		creatorId: true,
		number: true,
		createdAt: true,
		updatedAt: true,
	})
	.extend({
		workspaceId: workspaceInsertSchema.shape.id,
		title: z.string().min(1).max(100),
		teamId: teamInsertSchema.shape.id,
	});

export const issueListSchema = z.object({
	workspaceId: workspaceInsertSchema.shape.id,
	limit: z.number().min(1).max(200).default(100),
	offset: z.number().min(0).default(0),
});

export const issueUpdateSchema = z
	.object({
		id: z.string(),
		workspaceId: z.string(),
	})
	.extend(issueInsertSchema.omit({ id: true, workspaceId: true }).shape);

export const issueDeleteSchema = z.object({
	id: z.string(),
	workspaceId: z.string(),
});
