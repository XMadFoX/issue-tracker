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
export type IssueSearchResult = Outputs["issue"]["search"]["issues"][number];

export type TeamIssuesInput = {
	workspaceId: string;
	teamId: string;
};

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

export type IssueActions = {
	update: (
		input: Inputs["issue"]["update"],
	) => Promise<Outputs["issue"]["update"]>;
	updatePriority: (
		input: Inputs["issue"]["updatePriority"],
	) => Promise<Outputs["issue"]["updatePriority"]>;
	updateAssignee: (
		input: Inputs["issue"]["updateAssignee"],
	) => Promise<Outputs["issue"]["updateAssignee"]>;
	move?: (input: Inputs["issue"]["move"]) => Promise<unknown>;
	create: (issue: IssueCreateInput) => Promise<SubmitResult>;
};

export type LabelActions = {
	addLabels: (input: Inputs["issue"]["labels"]["bulkAdd"]) => Promise<void>;
	deleteLabels: (
		input: Inputs["issue"]["labels"]["bulkDelete"],
	) => Promise<void>;
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
