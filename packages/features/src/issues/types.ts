import type { RouterClient } from "@orpc/server";
import type { RouterUtils } from "@orpc/tanstack-query";
import type { router } from "@prism/api";
import type { issueCreateSchema } from "@prism/api/src/features/issues/schema";
import type { Inputs, Outputs } from "@prism/api/src/router";
import type z from "zod";

export type PrismRouterClient = RouterClient<typeof router>;
export type PrismOrpc = RouterUtils<PrismRouterClient>;

export type IssueCreateInput = z.input<typeof issueCreateSchema>;
export type SubmitResult = { success: true } | { error: unknown };
export type IssueListItem = Outputs["issue"]["list"][number];
export type IssueListData = Outputs["issue"]["list"];
export type IssueDetailData = Outputs["issue"]["get"];
export type IssueActivityList = Outputs["issue"]["activity"]["list"];
export type IssueSearchResult = Outputs["issue"]["search"]["issues"][number];
export type CycleList = Outputs["cycle"]["list"];

export type IssueType = Outputs["issueType"]["list"][number];
export type IssueTypeList = Outputs["issueType"]["list"];
export type IssueTypeListInput = Inputs["issueType"]["list"];
export type IssueTypeAllowedStatusListInput =
	Inputs["issueType"]["listAllowedStatuses"];
export type IssueTypeCreateInput = Inputs["issueType"]["create"];
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

export type TeamIssuesInput = {
	workspaceId: string;
	teamId: string;
	archivedFilter?: Inputs["issue"]["list"]["archivedFilter"];
	issueTypeId?: Inputs["issue"]["list"]["issueTypeId"];
};

export type IssueArchivedFilter = NonNullable<
	TeamIssuesInput["archivedFilter"]
>;
export type NormalizedTeamIssuesInput = Omit<
	TeamIssuesInput,
	"archivedFilter"
> & {
	archivedFilter: IssueArchivedFilter;
};

export const DEFAULT_ARCHIVED_FILTER =
	"unarchived" satisfies IssueArchivedFilter;
export const ISSUE_ARCHIVED_FILTERS = [
	DEFAULT_ARCHIVED_FILTER,
	"archived",
	"all",
] satisfies ReadonlyArray<IssueArchivedFilter>;

export function normalizeTeamIssuesInput({
	workspaceId,
	teamId,
	archivedFilter,
	issueTypeId,
}: TeamIssuesInput): NormalizedTeamIssuesInput {
	return {
		workspaceId,
		teamId,
		archivedFilter: archivedFilter ?? DEFAULT_ARCHIVED_FILTER,
		...(issueTypeId !== undefined ? { issueTypeId } : {}),
	};
}

export type TeamBySlugInput = {
	workspaceId: string;
	teamSlug: string;
};

export type IssueDetailInput = {
	workspaceId: string;
	issueId: string;
};

export type IssueSearchInput = {
	workspaceId: string;
	teamId: string;
	query: string;
};

export type IssueCycleUpdateInput = {
	id: string;
	workspaceId: string;
	cycleId: string | null;
};

export type UpdateIssueTypeResult =
	| { ok: true }
	| {
			ok: false;
			reason: "STATUS_REQUIRED";
			compatibleStatuses: Outputs["issue"]["status"]["list"];
	  };

export type IssueActions = {
	update: (
		input: Inputs["issue"]["update"],
	) => Promise<Outputs["issue"]["update"]>;
	updateIssueType: (input: {
		id: string;
		workspaceId: string;
		issueTypeId: string;
	}) => Promise<UpdateIssueTypeResult>;
	updatePriority: (
		input: Inputs["issue"]["updatePriority"],
	) => Promise<Outputs["issue"]["updatePriority"]>;
	updateAssignee: (
		input: Inputs["issue"]["updateAssignee"],
	) => Promise<Outputs["issue"]["updateAssignee"]>;
	updateCycle: (input: IssueCycleUpdateInput) => Promise<unknown>;
	move?: (input: Inputs["issue"]["move"]) => Promise<unknown>;
	create: (issue: IssueCreateInput) => Promise<SubmitResult>;
};

export type LabelActions = {
	addLabels: (input: Inputs["issue"]["labels"]["bulkAdd"]) => Promise<void>;
	deleteLabels: (
		input: Inputs["issue"]["labels"]["bulkDelete"],
	) => Promise<void>;
};

export type IssueTypeActions = {
	createIssueType: (
		input: IssueTypeCreateInput,
	) => Promise<Outputs["issueType"]["create"]>;
	updateIssueType: (
		input: IssueTypeUpdateInput,
	) => Promise<Outputs["issueType"]["update"]>;
	archiveIssueType: (
		input: IssueTypeArchiveInput,
	) => Promise<Outputs["issueType"]["archive"]>;
	reassignAndArchiveIssueType: (
		input: IssueTypeReassignAndArchiveInput,
	) => Promise<Outputs["issueType"]["reassignAndArchive"]>;
	reorderIssueTypes: (
		input: IssueTypeReorderInput,
	) => Promise<Outputs["issueType"]["reorder"]>;
	setDefaultIssueType: (
		input: IssueTypeSetDefaultInput,
	) => Promise<Outputs["issueType"]["setDefault"]>;
	hideIssueTypeForTeam: (
		input: IssueTypeHideForTeamInput,
	) => Promise<Outputs["issueType"]["hideForTeam"]>;
	replaceIssueTypeForTeam: (
		input: IssueTypeReplaceForTeamInput,
	) => Promise<Outputs["issueType"]["replaceForTeam"]>;
	restoreIssueTypeForTeam: (
		input: IssueTypeRestoreForTeamInput,
	) => Promise<Outputs["issueType"]["restoreForTeam"]>;
};

export type SubIssueSearchState = {
	query: string;
	onQueryChange: (query: string) => void;
	results: Array<IssueSearchResult>;
	isSearching: boolean;
	hasSearched: boolean;
	minQueryLength: number;
};

export type SubIssueActions = {
	attach?: (issue: IssueSearchResult) => Promise<void>;
	detach?: (issueId: string) => Promise<void>;
	create?: (issue: IssueCreateInput) => Promise<SubmitResult>;
};

export type IssueFeatureNotifications = {
	success: (message: string) => void;
	error: (message: string) => void;
};
