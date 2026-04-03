import { issuePriorityCreateSchema } from "@prism/api/src/features/issue-priorities/issue-priority.schema";
import type { Inputs, Outputs } from "@prism/api/src/router";
import type { z } from "zod";

export type IssuePriority = Outputs["priority"]["list"][number];

export const issuePriorityCreateDraftSchema = issuePriorityCreateSchema.omit({
	rank: true,
});

export type IssuePriorityCreateDraft = z.input<
	typeof issuePriorityCreateDraftSchema
>;
export type IssuePriorityUpdateInput = Inputs["priority"]["update"];
export type IssuePriorityDeleteInput = Inputs["priority"]["delete"];
export type IssuePriorityReorderInput = Inputs["priority"]["reorder"];

export type SubmitResult = { success: true } | { error: unknown };
