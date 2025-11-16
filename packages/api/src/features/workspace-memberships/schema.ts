import { workspaceMembership } from "db/features/tracker/tracker.schema";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { roleInsertSchema } from "../roles/schema";

export const workspaceMembershipInsertSchema =
	createInsertSchema(workspaceMembership);

export const workspaceMembershipCreateSchema = workspaceMembershipInsertSchema
	.omit({ id: true, joinedAt: true, lastSeenAt: true })
	.extend({
		roleId: roleInsertSchema.shape.id.optional(), // Optional, can be auto-assigned
	});

export const workspaceMembershipListSchema = z.object({
	workspaceId: z.string(),
});

export const workspaceMembershipGetSchema = z.object({
	id: z.string(),
	workspaceId: z.string(),
});

export const workspaceMembershipUpdateSchema = workspaceMembershipInsertSchema
	.partial()
	.required({ id: true, workspaceId: true });

export const workspaceMembershipDeleteSchema = z.object({
	id: z.string(),
	workspaceId: z.string(),
});
