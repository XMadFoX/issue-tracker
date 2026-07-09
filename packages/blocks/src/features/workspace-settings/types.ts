import { workspaceUpdateSchema } from "@prism/api/src/features/workspaces/schema";
import type { Outputs } from "@prism/api/src/router";
import type { z } from "zod";

export type Workspace = Outputs["workspace"]["getBySlug"];

export type SubmitResult = { success: true } | { error: unknown };
export type SubmitHandler<TInput> = {
	bivarianceHack(input: TInput): Promise<SubmitResult>;
}["bivarianceHack"];

export const workspaceGeneralDraftSchema = workspaceUpdateSchema
	.pick({ name: true, slug: true, timezone: true })
	.required();

export type WorkspaceGeneralDraft = z.output<
	typeof workspaceGeneralDraftSchema
>;
export type WorkspaceGeneralUpdateInput = WorkspaceGeneralDraft &
	Pick<z.output<typeof workspaceUpdateSchema>, "id">;
