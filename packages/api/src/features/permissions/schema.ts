import { rolePermissions } from "db/features/abac/abac.schema";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { sanitizeAttributes } from "../../lib/permissions-helpers";
import { workspaceInsertSchema } from "../workspaces/schema";

// TODO: implement type-safe errors using the .errors() method on the routes

export const rolePermissionsInsertSchema = createInsertSchema(rolePermissions);

export const rolePermissionsCreateSchema = rolePermissionsInsertSchema.extend({
	workspaceId: workspaceInsertSchema.shape.id,
	attributes: z
		.record(z.string(), z.unknown())
		.optional()
		.transform((val) => sanitizeAttributes(val || {})),
});

export const rolePermissionsListSchema = rolePermissionsInsertSchema
	.pick({ roleId: true })
	.extend({
		workspaceId: workspaceInsertSchema.shape.id,
		limit: z.number().min(1).max(100).default(50),
		offset: z.number().min(0).default(0),
	});

export const rolePermissionsGetSchema = rolePermissionsInsertSchema
	.pick({ roleId: true, permissionId: true, constraintId: true })
	.extend({
		workspaceId: workspaceInsertSchema.shape.id,
	});

export const rolePermissionsUpdateSchema = rolePermissionsInsertSchema
	.pick({ roleId: true, permissionId: true, effect: true, constraintId: true })
	.extend({
		workspaceId: workspaceInsertSchema.shape.id,
		attributes: z
			.record(z.string(), z.unknown())
			.optional()
			.transform((val) => sanitizeAttributes(val || {})),
	})
	.partial({ effect: true });

export const rolePermissionsDeleteSchema = rolePermissionsInsertSchema
	.pick({ roleId: true, permissionId: true, constraintId: true })
	.extend({
		workspaceId: workspaceInsertSchema.shape.id,
	});
