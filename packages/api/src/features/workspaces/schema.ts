import { workspace } from "db/features/tracker/tracker.schema";
import { createInsertSchema } from "drizzle-orm/zod";
import z from "zod";

export const workspaceInsertSchema = createInsertSchema(workspace)
	.omit({ createdAt: true, updatedAt: true })
	.extend({
		id: z.cuid2(),
		name: z.string().trim().min(1, "Workspace name is required"),
		slug: z
			.string()
			.trim()
			.min(1, "Slug is required")
			.regex(/^[a-z0-9-]+$/, "Use lowercase letters, numbers and hyphens only"),
		timezone: z
			.string()
			.min(1)
			.refine((timezone) => {
				try {
					new Intl.DateTimeFormat("en-US", { timeZone: timezone });
					return true;
				} catch {
					return false;
				}
			}, "Invalid timezone"),
		attributes: z.record(z.string(), z.unknown()).optional(),
	});
export const workspaceGetBySlugSchema = z.object({
	slug: workspaceInsertSchema.shape.slug,
});
export const workspaceCreateSchema = workspaceInsertSchema.omit({ id: true });
export const workspaceUpdateSchema = workspaceInsertSchema
	.partial()
	.required({ id: true });
export const workspaceDeleteSchema = workspaceInsertSchema
	.pick({ id: true })
	.extend({ confirmationSlug: workspaceInsertSchema.shape.slug });
