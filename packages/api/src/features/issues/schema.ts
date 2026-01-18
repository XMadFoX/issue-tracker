import { user } from "db/features/auth/auth.schema";
import { issue } from "db/features/tracker/issues.schema";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { issuePriorityInsertSchema } from "../issue-priorities/issue-priority.schema";
import { labelInsertSchema } from "../labels/schema";
import { teamInsertSchema } from "../teams/schema";
import { workspaceInsertSchema } from "../workspaces/schema";

export const issueInsertSchema = createInsertSchema(issue);
export const userInsertSchema = createInsertSchema(user);

const assigneeIdSchema = userInsertSchema.shape.id.nullable();

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
		assigneeId: assigneeIdSchema.optional(),
		labelIds: z.array(labelInsertSchema.shape.id).default([]),
	});

export const issueUpdateAssigneeSchema = z.object({
	id: issueInsertSchema.shape.id,
	workspaceId: workspaceInsertSchema.shape.id,
	assigneeId: assigneeIdSchema,
});

export const issueListSchema = z.object({
	workspaceId: workspaceInsertSchema.shape.id,
	teamId: teamInsertSchema.shape.id.optional(),
	limit: z.number().min(1).max(200).default(100),
	offset: z.number().min(0).default(0),
});

export const issueUpdateSchema = issueInsertSchema.partial().required({
	id: true,
	workspaceId: true,
});

export const issueDeleteSchema = z.object({
	id: z.string(),
	workspaceId: z.string(),
});

export const issueLabelsSchema = z.object({
	issueId: issueInsertSchema.shape.id,
	workspaceId: workspaceInsertSchema.shape.id,
	labelIds: z.array(labelInsertSchema.shape.id),
});

export const issuePriorityUpdateSchema = z.object({
	id: issueInsertSchema.shape.id,
	workspaceId: issueInsertSchema.shape.workspaceId,
	priorityId: issuePriorityInsertSchema.shape.id.or(z.null()),
});

export const issueGetSchema = z.object({
	id: issueInsertSchema.shape.id,
	workspaceId: workspaceInsertSchema.shape.id,
});

export const issueMoveSchema = z.object({
	id: issueInsertSchema.shape.id,
	workspaceId: workspaceInsertSchema.shape.id,
	targetId: issueInsertSchema.shape.id.optional(),
	after: z.boolean().default(true),
});
