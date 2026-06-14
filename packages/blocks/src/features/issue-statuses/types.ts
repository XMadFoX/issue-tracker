import { issueStatusGroupCreateSchema } from "@prism/api/src/features/issue-statuses/group/schema";
import { issueStatusCreateSchema } from "@prism/api/src/features/issue-statuses/issue-status.schema";
import type { Inputs, Outputs } from "@prism/api/src/router";
import { z } from "zod";

export type IssueStatus = Outputs["issue"]["status"]["list"][number];
export type IssueStatusGroup =
	Outputs["issue"]["status"]["group"]["list"][number];
export type Team = Outputs["team"]["listByWorkspace"][number];

export type WorkflowScopeValue =
	| { kind: "workspace" }
	| { kind: "team"; teamId: string };
export type SubmitResult = { success: true } | { error: unknown };
export type SubmitHandler<TInput> = {
	bivarianceHack(input: TInput): Promise<SubmitResult>;
}["bivarianceHack"];

export const issueStatusCreateDraftSchema = issueStatusCreateSchema
	.omit({
		orderIndex: true,
		createdAt: true,
		updatedAt: true,
	})
	.extend({
		teamId: z.null().optional(),
		statusGroupId: z.string().min(1, "Select a group"),
		name: z.string().trim().min(1, "Status name is required"),
		color: z
			.string()
			.regex(/^#[0-9a-fA-F]{6}$/, "Use a valid hex color")
			.nullish(),
		description: z.string().nullish(),
	});

export const issueStatusGroupCreateDraftSchema = issueStatusGroupCreateSchema
	.omit({
		key: true,
		orderIndex: true,
		isEditable: true,
		createdAt: true,
		updatedAt: true,
	})
	.extend({
		name: z.string().trim().min(1, "Group name is required"),
		canonicalCategory: z.enum([
			"backlog",
			"planned",
			"in_progress",
			"completed",
			"canceled",
		]),
		description: z.string().nullish(),
	});

export type IssueStatusCreateDraft = z.input<
	typeof issueStatusCreateDraftSchema
>;
export type IssueStatusGroupCreateDraft = z.input<
	typeof issueStatusGroupCreateDraftSchema
>;
export type IssueStatusUpdateInput = Inputs["issue"]["status"]["update"];
export type IssueStatusDeleteInput = Inputs["issue"]["status"]["delete"];
export type IssueStatusReorderInput = Inputs["issue"]["status"]["reorder"];
export type IssueStatusGroupUpdateInput =
	Inputs["issue"]["status"]["group"]["update"];
export type IssueStatusGroupDeleteInput =
	Inputs["issue"]["status"]["group"]["delete"];
export type IssueStatusGroupReorderInput =
	Inputs["issue"]["status"]["group"]["reorder"];
