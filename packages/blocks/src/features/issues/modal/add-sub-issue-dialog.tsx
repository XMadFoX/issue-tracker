import { Badge } from "@prism/ui/components/badge";
import { Button } from "@prism/ui/components/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@prism/ui/components/dialog";
import { Input } from "@prism/ui/components/input";
import { Plus, Search } from "lucide-react";
import { type ComponentProps, useState } from "react";
import { getIssueReference } from "../components/issue-reference";
import { IssueCreateForm } from "../form/create";
import type {
	IssueDetailData,
	IssueSearchResult,
	IssueStatusList,
	LabelList,
	PriorityList,
	SubIssueSearchState,
	TeamMemberList,
} from "../types";

type Props = {
	issue: IssueDetailData;
	workspaceId: string;
	teamId: string;
	statuses: IssueStatusList;
	priorities: PriorityList;
	labels: LabelList;
	teamMembers: TeamMemberList;
	search: SubIssueSearchState;
	onAttachSubIssue: (issue: IssueSearchResult) => Promise<void>;
	onCreateSubIssue: ComponentProps<typeof IssueCreateForm>["onSubmit"];
	triggerVariant?: ComponentProps<typeof Button>["variant"];
};

function getSearchEmptyStateText({
	showQueryLengthPrompt,
	minQueryLength,
	showNoResults,
}: {
	showQueryLengthPrompt: boolean;
	minQueryLength: number;
	showNoResults: boolean;
}) {
	if (showQueryLengthPrompt) {
		return `Type at least ${minQueryLength} characters, or enter an issue number.`;
	}

	if (showNoResults) {
		return "No attachable issues found.";
	}

	return "Start typing to search issues.";
}

export function AddSubIssueDialog({
	issue,
	workspaceId,
	teamId,
	statuses,
	priorities,
	labels,
	teamMembers,
	search,
	onAttachSubIssue,
	onCreateSubIssue,
	triggerVariant = "outline",
}: Props) {
	const [open, setOpen] = useState(false);
	const [showCreateForm, setShowCreateForm] = useState(false);
	const [attachingIssueId, setAttachingIssueId] = useState<string | null>(null);
	const normalizedQuery = search.query.trim();
	const showQueryLengthPrompt =
		normalizedQuery.length > 0 &&
		normalizedQuery.length < search.minQueryLength;
	const showNoResults =
		normalizedQuery.length >= search.minQueryLength &&
		search.hasSearched &&
		!search.isSearching &&
		search.results.length === 0;

	return (
		<Dialog
			open={open}
			onOpenChange={(nextOpen) => {
				setOpen(nextOpen);
				if (!nextOpen) {
					setShowCreateForm(false);
					search.onQueryChange("");
				}
			}}
		>
			<DialogTrigger
				render={
					<Button type="button" variant={triggerVariant} size="sm">
						<Plus className="size-4" />
						Add sub-task
					</Button>
				}
			/>
			<DialogContent className="max-w-2xl">
				<DialogHeader>
					<DialogTitle>Add sub-task</DialogTitle>
					<DialogDescription>
						Search existing issues in this team or create a new child issue.
					</DialogDescription>
				</DialogHeader>
				<div className="space-y-5">
					<div className="space-y-3">
						<div className="relative">
							<Search className="-translate-y-1/2 pointer-events-none absolute top-1/2 left-3 size-4 text-muted-foreground" />
							<Input
								value={search.query}
								onChange={(event) => search.onQueryChange(event.target.value)}
								placeholder="Search by reference, number, or title"
								className="pl-9"
							/>
						</div>
						<div className="max-h-64 overflow-y-auto rounded-md border">
							{search.isSearching ? (
								<div className="px-3 py-6 text-center text-muted-foreground text-sm">
									Searching issues...
								</div>
							) : null}
							{!search.isSearching && search.results.length > 0 ? (
								<div className="divide-y">
									{search.results.map((result) => (
										<button
											key={result.id}
											type="button"
											className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left hover:bg-muted/50"
											disabled={attachingIssueId === result.id}
											onClick={async () => {
												setAttachingIssueId(result.id);
												try {
													await onAttachSubIssue(result);
													setOpen(false);
												} finally {
													setAttachingIssueId(null);
												}
											}}
										>
											<span className="min-w-0">
												<span className="block truncate font-medium">
													{result.title}
												</span>
												<span className="text-muted-foreground text-xs">
													{getIssueReference(result)}
												</span>
											</span>
											{result.status?.name ? (
												<Badge variant="secondary">{result.status.name}</Badge>
											) : null}
										</button>
									))}
								</div>
							) : null}
							{!search.isSearching && search.results.length === 0 ? (
								<div className="px-3 py-6 text-center text-muted-foreground text-sm">
									{getSearchEmptyStateText({
										showQueryLengthPrompt,
										minQueryLength: search.minQueryLength,
										showNoResults,
									})}
								</div>
							) : null}
						</div>
					</div>

					<div className="flex items-center justify-between border-t pt-4">
						<div>
							<p className="font-medium text-sm">Create a new sub-task</p>
							<p className="text-muted-foreground text-xs">
								New issue will be linked under {getIssueReference(issue)}.
							</p>
						</div>
						<Button
							type="button"
							variant="outline"
							size="sm"
							onClick={() => setShowCreateForm((value) => !value)}
						>
							{showCreateForm ? "Hide form" : "Create new"}
						</Button>
					</div>

					{showCreateForm ? (
						<IssueCreateForm
							workspaceId={workspaceId}
							teamId={teamId}
							priorities={priorities}
							statuses={statuses}
							assignees={teamMembers}
							labels={labels}
							initialStatusId={issue.statusId}
							initialParentIssueId={issue.id}
							onSubmit={async (value) => {
								const result = await onCreateSubIssue(value);
								if ("success" in result) {
									setOpen(false);
								}
								return result;
							}}
						/>
					) : null}
				</div>
			</DialogContent>
		</Dialog>
	);
}
