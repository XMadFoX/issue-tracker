import type { issueCreateSchema } from "@prism/api/src/features/issues/schema";
import type { Inputs, Outputs } from "@prism/api/src/router";
import type z from "zod";

export type IssueCreateInput = z.input<typeof issueCreateSchema>;
export type SubmitResult = { success: true } | { error: unknown };

export type IssueListItem = Outputs["issue"]["list"][number];
export type IssueListData = Outputs["issue"]["list"];
export type IssueDetailData = Outputs["issue"]["get"];
export type IssueSearchResult = Outputs["issue"]["search"]["issues"][number];
export type IssueStatusList = Outputs["issue"]["status"]["list"];
export type PriorityList = Outputs["priority"]["list"];
export type LabelList = Outputs["label"]["list"];
export type TeamMemberList = Outputs["teamMembership"]["list"];

export type IssueLinkTarget = {
	id: string;
	number?: number | null;
	team?: {
		key: string;
	} | null;
};

export type LabelActions = {
	addLabels: (input: Inputs["issue"]["labels"]["bulkAdd"]) => Promise<void>;
	deleteLabels: (
		input: Inputs["issue"]["labels"]["bulkDelete"],
	) => Promise<void>;
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

export type IssueNavigation = {
	onIssueClick?: (issueId: string) => void;
	getIssueUrl?: (issue: IssueLinkTarget) => `/${string}`;
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
