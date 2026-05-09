import { cycle, cycleStateEnum } from "db/features/tracker/cycles.schema";
import { createInsertSchema, createSelectSchema } from "drizzle-orm/zod";
import { z } from "zod";

export const cycleStateSchema = createSelectSchema(cycleStateEnum);
export const cycleInsertSchema = createInsertSchema(cycle).extend({
	// TODO: cleanup after migrating drizzle-zod
	id: z.cuid2(),
	workspaceId: z.cuid2(),
	teamId: z.cuid2(),
	name: z.string().min(1).max(100),
	startDate: z.iso.datetime(),
	endDate: z.iso.datetime(),
	capacity: z.number().int().min(0).nullable(),
	velocity: z.number().int().min(0).nullable(),
});

export const cycleListSchema = cycleInsertSchema
	.pick({
		workspaceId: true,
		teamId: true,
	})
	.extend({
		state: cycleStateSchema.optional(),
		limit: z.number().int().min(1).max(200).default(100),
		offset: z.number().int().min(0).default(0),
	});

export const cycleGetSchema = cycleInsertSchema.pick({
	workspaceId: true,
	id: true,
});

export const cycleCreateSchema = cycleInsertSchema
	.pick({
		workspaceId: true,
		teamId: true,
		name: true,
		startDate: true,
		endDate: true,
		capacity: true,
	})
	.partial({
		name: true,
		endDate: true,
		capacity: true,
	});

export const cycleUpdateSchema = cycleInsertSchema
	.pick({
		workspaceId: true,
		id: true,
		name: true,
		startDate: true,
		endDate: true,
		state: true,
		capacity: true,
		velocity: true,
	})
	.partial()
	.required({
		workspaceId: true,
		id: true,
	});

export const cycleDeleteSchema = cycleGetSchema;

export const cycleAssignIssueSchema = z.object({
	workspaceId: cycleInsertSchema.shape.workspaceId,
	cycleId: cycleInsertSchema.shape.id,
	issueId: cycleInsertSchema.shape.id,
});

export const cycleUnassignIssueSchema = z.object({
	workspaceId: cycleInsertSchema.shape.workspaceId,
	issueId: cycleInsertSchema.shape.id,
	cycleId: cycleInsertSchema.shape.id.optional(),
});

export const cycleMetricsSchema = z.object({
	workspaceId: cycleInsertSchema.shape.workspaceId,
	cycleId: cycleInsertSchema.shape.id,
});
