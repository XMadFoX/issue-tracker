import { z } from "zod";
import { workspaceInsertSchema } from "../workspaces/schema";
import { issueStatusGroupInsertSchema } from "./group/schema";
import { issueStatusInsertSchema } from "./issue-status.schema";

const baseReorderSchema = z.object({
	workspaceId: workspaceInsertSchema.shape.id,
});

/**
 * Schema for bulk reordering of issue status groups.
 * Expects the workspace ID and an ordered list of group IDs.
 */
export const reorderStatusGroupsSchema = baseReorderSchema.extend({
	orderedIds: z.array(issueStatusGroupInsertSchema.shape.id),
});

/**
 * Schema for bulk reordering of issue statuses.
 * Expects the workspace ID and an ordered list of status IDs.
 */
export const reorderStatusesSchema = baseReorderSchema.extend({
	orderedIds: z.array(issueStatusInsertSchema.shape.id),
});
