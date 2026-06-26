import { user } from "db/features/auth/auth.schema";
import { issue } from "db/features/tracker/issues.schema";
import { createInsertSchema } from "drizzle-orm/zod";
import type { Value } from "platejs";
import { z } from "zod";
import { issuePriorityInsertSchema } from "../issue-priorities/issue-priority.schema";
import { issueTypeInsertSchema } from "../issue-types/schema";
import { labelInsertSchema } from "../labels/schema";
import { teamInsertSchema } from "../teams/schema";
import { workspaceInsertSchema } from "../workspaces/schema";

export const issueInsertSchema = createInsertSchema(issue);
export const userInsertSchema = createInsertSchema(user);

const assigneeIdSchema = userInsertSchema.shape.id.nullable();
const issueDescriptionSchema = z.custom<Value>().nullable();
const estimateSchema = z.number().int().min(0).nullable();
const issueTypeIdSchema = issueTypeInsertSchema.shape.id;

export const issueCreateSchema = issueInsertSchema
	.omit({
		id: true,
		creatorId: true,
		number: true,
		searchText: true,
		searchVector: true,
		embedding: true,
		createdAt: true,
		updatedAt: true,
	})
	.extend({
		workspaceId: workspaceInsertSchema.shape.id,
		title: z.string().min(1).max(100),
		description: issueDescriptionSchema.optional(),
		teamId: teamInsertSchema.shape.id,
		statusId: issueInsertSchema.shape.statusId.optional(),
		issueTypeId: issueTypeIdSchema.optional(),
		assigneeId: assigneeIdSchema.optional(),
		estimate: estimateSchema.optional(),
		labelIds: labelInsertSchema.shape.id.array().default([]),
	});

export const issueUpdateAssigneeSchema = z.object({
	id: issueInsertSchema.shape.id,
	workspaceId: workspaceInsertSchema.shape.id,
	assigneeId: assigneeIdSchema,
});

export const issueUpdateParentSchema = z.object({
	id: issueInsertSchema.shape.id,
	workspaceId: workspaceInsertSchema.shape.id,
	parentIssueId: issueInsertSchema.shape.id.nullable(),
});

export const issueListSchema = z.object({
	workspaceId: workspaceInsertSchema.shape.id,
	teamId: teamInsertSchema.shape.id.optional(),
	issueTypeId: issueTypeIdSchema.optional(),
	limit: z.number().min(1).max(200).default(100),
	offset: z.number().min(0).default(0),
	archivedFilter: z
		.enum(["all", "archived", "unarchived"])
		.default("unarchived"),
});

export const issueUpdateSchema = issueInsertSchema
	.partial()
	.omit({
		parentIssueId: true,
		teamId: true,
		number: true,
		creatorId: true,
		searchText: true,
		searchVector: true,
		embedding: true,
		createdAt: true,
		updatedAt: true,
	})
	.extend({
		description: issueDescriptionSchema.optional(),
	})
	.extend({
		estimate: estimateSchema.optional(),
	})
	.extend({
		issueTypeId: issueTypeIdSchema.optional(),
	})
	.required({
		id: true,
		workspaceId: true,
	})
	.refine(
		({ id: _id, workspaceId: _workspaceId, ...values }) =>
			Object.values(values).some((value) => value !== undefined),
		{
			message: "At least one mutable issue field is required",
		},
	);

export const issueDeleteSchema = z.object({
	id: z.string(),
	workspaceId: z.string(),
});

export const issueLabelsSchema = z.object({
	issueId: issueInsertSchema.shape.id,
	workspaceId: workspaceInsertSchema.shape.id,
	labelIds: labelInsertSchema.shape.id.array(),
});

export const issuePriorityUpdateSchema = z.object({
	id: issueInsertSchema.shape.id,
	workspaceId: issueInsertSchema.shape.workspaceId,
	priorityId: issuePriorityInsertSchema.shape.id.nullable(),
});

export const issueGetSchema = z.object({
	id: issueInsertSchema.shape.id,
	workspaceId: workspaceInsertSchema.shape.id,
});

export const issueActivityListSchema = z.object({
	issueId: issueInsertSchema.shape.id,
	workspaceId: workspaceInsertSchema.shape.id,
	limit: z.number().int().min(1).max(100).default(50),
	offset: z.number().int().min(0).default(0),
});

export const issueMoveSchema = z.object({
	id: issueInsertSchema.shape.id,
	workspaceId: workspaceInsertSchema.shape.id,
	targetId: issueInsertSchema.shape.id.optional(),
	after: z.boolean().default(true),
});

export const issueSearchSchema = z.object({
	workspaceId: workspaceInsertSchema.shape.id,
	query: z.string().min(1).max(200),
	mode: z.enum(["fts", "trigram", "semantic", "hybrid"]).default("hybrid"),
	filters: z
		.object({
			teamId: teamInsertSchema.shape.id.optional(),
			statusId: issueInsertSchema.shape.statusId.optional(),
			assigneeId: assigneeIdSchema.optional(),
			labelIds: labelInsertSchema.shape.id.array().optional(),
			priorityId: issueInsertSchema.shape.priorityId.optional(),
			issueTypeId: issueTypeIdSchema.optional(),
			issueTypeIds: issueTypeIdSchema.array().optional(),
			reporterId: userInsertSchema.shape.id.optional(),
			creatorId: userInsertSchema.shape.id.optional(),
			createdAtFrom: z.iso.datetime().optional(),
			createdAtTo: z.iso.datetime().optional(),
			dueDateFrom: z.iso.datetime().optional(),
			dueDateTo: z.iso.datetime().optional(),
		})
		.optional(),
	options: z
		.object({
			minScore: z.number().min(0).max(1).default(0),
			embeddingThreshold: z.number().min(0).max(1).default(0.7),
			includeDebugInfo: z.boolean().default(false),
			includeStatus: z.boolean().default(false),
			includeStatusGroup: z.boolean().default(false),
			includePriority: z.boolean().default(false),
			includeAssignee: z.boolean().default(false),
			includeTeam: z.boolean().default(false),
			includeLabels: z.boolean().default(false),
			includeIssueType: z.boolean().default(false),
		})
		.optional(),
	includeArchived: z.boolean().default(false),
});
