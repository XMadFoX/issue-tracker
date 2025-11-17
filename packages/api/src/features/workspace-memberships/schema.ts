import { workspaceMembership } from "db/features/tracker/tracker.schema";
import { createInsertSchema } from "drizzle-zod";
import { roleInsertSchema } from "../roles/schema";

export const workspaceMembershipInsertSchema =
	createInsertSchema(workspaceMembership);

export const workspaceMembershipCreateSchema = workspaceMembershipInsertSchema
	.omit({ id: true, joinedAt: true, lastSeenAt: true })
	.extend({
		roleId: roleInsertSchema.shape.id.optional(), // Optional, can be auto-assigned
	});

export const workspaceMembershipListSchema =
	workspaceMembershipInsertSchema.pick({
		workspaceId: true,
	});

export const workspaceMembershipGetSchema =
	workspaceMembershipInsertSchema.pick({
		id: true,
		workspaceId: true,
	});

export const workspaceMembershipUpdateSchema = workspaceMembershipInsertSchema
	.partial()
	.required({ id: true, workspaceId: true });

export const workspaceMembershipDeleteSchema =
	workspaceMembershipInsertSchema.pick({
		id: true,
		workspaceId: true,
	});
