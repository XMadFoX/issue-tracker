import { issueTypeCreateSchema } from "@prism/api/src/features/issue-types/schema";
import type { Inputs, Outputs } from "@prism/api/src/router";
import type { z } from "zod";

export type IssueType = Outputs["issueType"]["list"][number];
export type Team = Outputs["team"]["listByWorkspace"][number];

export type IssueTypeScopeValue =
	| { kind: "workspace" }
	| { kind: "team"; teamId: string };

export const issueTypeCreateDraftSchema = issueTypeCreateSchema.omit({
	key: true,
	orderIndex: true,
});

export type IssueTypeCreateDraft = z.input<typeof issueTypeCreateDraftSchema>;

export type IssueTypeUpdateInput = Inputs["issueType"]["update"];
export type IssueTypeArchiveInput = Inputs["issueType"]["archive"];
export type IssueTypeReassignAndArchiveInput =
	Inputs["issueType"]["reassignAndArchive"];
export type IssueTypeReorderInput = Inputs["issueType"]["reorder"];
export type IssueTypeSetDefaultInput = Inputs["issueType"]["setDefault"];
export type IssueTypeHideForTeamInput = Inputs["issueType"]["hideForTeam"];
export type IssueTypeReplaceForTeamInput =
	Inputs["issueType"]["replaceForTeam"];
export type IssueTypeRestoreForTeamInput =
	Inputs["issueType"]["restoreForTeam"];

export type SubmitResult = { success: true } | { error: unknown };
