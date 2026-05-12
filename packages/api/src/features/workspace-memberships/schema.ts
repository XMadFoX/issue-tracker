import { workspaceMembership } from "db/features/tracker/tracker.schema";
import { createInsertSchema } from "drizzle-orm/zod";
import { z } from "zod";
import { roleInsertSchema } from "../roles/schema";

export const workspaceMembershipInsertSchema =
	createInsertSchema(workspaceMembership);

const attributesSchema = z.record(z.string(), z.unknown());

export const workspaceMembershipCreateSchema = workspaceMembershipInsertSchema
	.omit({ id: true, joinedAt: true, lastSeenAt: true })
	.extend({
		roleId: roleInsertSchema.shape.id.optional(), // Optional, can be auto-assigned
		attributes: attributesSchema.optional(),
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
	.required({ id: true, workspaceId: true })
	.extend({
		attributes: attributesSchema.optional(),
	});

export const workspaceMembershipDeleteSchema =
	workspaceMembershipInsertSchema.pick({
		id: true,
		workspaceId: true,
	});
