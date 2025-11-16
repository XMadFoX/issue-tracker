import { rolePermissions } from "db/features/abac/abac.schema";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { sanitizeAttributes } from "../../lib/permissions-helpers";

// TODO: implement type-safe errors using the .errors() method on the routes

export const rolePermissionsInsertSchema = createInsertSchema(rolePermissions);

export const rolePermissionsCreateSchema = z.object({
	roleId: z.string(),
	workspaceId: z.string(),
	permissionId: z.string(),
	effect: z.enum(["allow", "deny"]),
	constraintId: z.string().optional(),
	attributes: z
		.record(z.string(), z.unknown())
		.optional()
		.transform((val) => sanitizeAttributes(val || {})),
});

export const rolePermissionsListSchema = z.object({
	roleId: z.string(),
	workspaceId: z.string(),
	limit: z.number().min(1).max(100).default(50),
	offset: z.number().min(0).default(0),
});

export const rolePermissionsGetSchema = z.object({
	roleId: z.string(),
	workspaceId: z.string(),
	permissionId: z.string(),
	constraintId: z.string().optional(),
});

export const rolePermissionsUpdateSchema = z.object({
	roleId: z.string(),
	workspaceId: z.string(),
	permissionId: z.string(),
	constraintId: z.string().optional(),
	effect: z.enum(["allow", "deny"]).optional(),
	attributes: z
		.record(z.string(), z.unknown())
		.optional()
		.transform((val) => sanitizeAttributes(val || {})),
});

export const rolePermissionsDeleteSchema = z.object({
	roleId: z.string(),
	workspaceId: z.string(),
	permissionId: z.string(),
	constraintId: z.string().optional(),
});
