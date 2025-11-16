import {
	roleDefinitions,
	roleScopeLevelEnum,
} from "db/features/abac/abac.schema";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { teamInsertSchema } from "../teams/schema";

export const roleScopeLevelEnumSchema = createSelectSchema(roleScopeLevelEnum);
export const roleInsertSchema = createInsertSchema(roleDefinitions);

export const roleCreateSchema = roleInsertSchema
	.omit({
		id: true,
		createdBy: true,
	})
	.extend({
		teamId: teamInsertSchema.shape.id.optional(),
		scopeLevel: roleScopeLevelEnumSchema.optional(),
	});

export const roleListSchema = roleInsertSchema
	.pick({
		workspaceId: true,
	})
	.extend({
		teamId: z.string().optional(),
	});

export const roleGetSchema = roleInsertSchema
	.pick({
		id: true,
		workspaceId: true,
	})
	.extend({
		teamId: z.string().optional(),
	});

export const roleUpdateSchema = roleInsertSchema
	.partial()
	.required({ id: true, workspaceId: true })
	.extend({
		teamId: z.string().optional(),
	});

export const roleDeleteSchema = roleInsertSchema
	.pick({
		id: true,
		workspaceId: true,
	})
	.extend({
		teamId: z.string().optional(),
	});
