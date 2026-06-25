import {
	issueType,
	issueTypeTeamOverride,
} from "db/features/tracker/issue-types.schema";
import { createInsertSchema } from "drizzle-orm/zod";
import { z } from "zod";
import { workspaceInsertSchema } from "../workspaces/schema";

export const issueTypeInsertSchema = createInsertSchema(issueType).extend({
	id: z.cuid2(),
	workspaceId: workspaceInsertSchema.shape.id,
	teamId: z.cuid2().nullable().optional(),
	name: z.string().min(1).max(64),
	key: z
		.string()
		.min(1)
		.max(32)
		.regex(/^[a-z0-9-]+$/),
	icon: z.string().min(1).max(32),
	color: z.string().min(1).max(32),
	description: z.string().max(500).nullable().optional(),
	orderIndex: z.number().int().min(0),
});

export const issueTypeTeamOverrideInsertSchema = createInsertSchema(
	issueTypeTeamOverride,
).extend({
	id: z.cuid2(),
	workspaceId: workspaceInsertSchema.shape.id,
	teamId: z.cuid2(),
	sourceIssueTypeId: z.cuid2(),
	replacementIssueTypeId: z.cuid2().nullable().optional(),
});

export const issueTypeListSchema = z.object({
	workspaceId: workspaceInsertSchema.shape.id,
	teamId: z.cuid2().optional(),
	includeArchived: z.boolean().default(false),
});

export const issueTypeCreateSchema = issueTypeInsertSchema
	.omit({
		id: true,
		createdAt: true,
		updatedAt: true,
		archivedAt: true,
		isDefault: true,
		isEditable: true,
	})
	.extend({
		teamId: z.cuid2().nullable().optional(),
	});

export const issueTypeUpdateSchema = issueTypeInsertSchema
	.pick({
		id: true,
		workspaceId: true,
		name: true,
		key: true,
		icon: true,
		color: true,
		description: true,
		orderIndex: true,
	})
	.partial()
	.required({ id: true, workspaceId: true })
	.refine(
		({ id: _id, workspaceId: _workspaceId, ...values }) =>
			Object.values(values).some((value) => value !== undefined),
		{
			message: "At least one mutable issue field is required",
		},
	);

export const issueTypeArchiveSchema = issueTypeInsertSchema.pick({
	id: true,
	workspaceId: true,
});

export const issueTypeReassignAndArchiveSchema = issueTypeArchiveSchema.extend({
	replacementIssueTypeId: issueTypeInsertSchema.shape.id,
});

const MAX_REORDERED_ISSUE_TYPES = 100;

export const issueTypeReorderSchema = z
	.object({
		workspaceId: workspaceInsertSchema.shape.id,
		teamId: z.cuid2().nullable().optional(),
		orderedIds: z
			.array(issueTypeInsertSchema.shape.id)
			.min(1)
			.max(MAX_REORDERED_ISSUE_TYPES),
	})
	.refine(
		({ orderedIds }) => new Set(orderedIds).size === orderedIds.length,
		{ message: "orderedIds must not contain duplicates" },
	);

export const issueTypeSetDefaultSchema = issueTypeArchiveSchema;

export const issueTypeHideForTeamSchema = z.object({
	workspaceId: workspaceInsertSchema.shape.id,
	teamId: z.cuid2(),
	sourceIssueTypeId: issueTypeInsertSchema.shape.id,
});

export const issueTypeReplaceForTeamSchema = issueTypeHideForTeamSchema.extend({
	replacementIssueTypeId: issueTypeInsertSchema.shape.id,
});

export const issueTypeRestoreForTeamSchema = issueTypeHideForTeamSchema;
