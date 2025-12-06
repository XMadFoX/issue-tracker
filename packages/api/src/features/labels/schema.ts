import { label } from "db/features/tracker/labels.schema";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { teamInsertSchema } from "../teams/schema";
import { workspaceInsertSchema } from "../workspaces/schema";

export const labelInsertSchema = createInsertSchema(label);

export const labelCreateSchema = labelInsertSchema.omit({
	id: true,
	createdAt: true,
	updatedAt: true,
});

export const labelUpdateSchema = labelInsertSchema
	.partial()
	.required({ id: true, workspaceId: true });

export const labelDeleteSchema = labelInsertSchema.pick({
	id: true,
	workspaceId: true,
});

const commonListSchema = z.object({
	workspaceId: workspaceInsertSchema.shape.id,
	scope: z.enum(["workspace", "team", "all"]).default("all"),
	limit: z.number().min(1).max(200).default(100),
	offset: z.number().min(0).default(0),
});

export const labelListSchema = z.discriminatedUnion("scope", [
	commonListSchema.extend({
		scope: z.literal("team"),
		teamId: teamInsertSchema.shape.id,
	}),
	commonListSchema.extend({
		scope: z.literal("all"),
		teamId: teamInsertSchema.shape.id.nullish(),
	}),
	commonListSchema.extend({
		scope: z.literal("workspace"),
	}),
]);
