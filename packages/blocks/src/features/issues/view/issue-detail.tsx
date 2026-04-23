import type { issueCreateSchema } from "@prism/api/src/features/issues/schema";
import type { Inputs, Outputs } from "@prism/api/src/router";
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
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@prism/ui/components/select";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@prism/ui/components/table";
import { cn } from "@prism/ui/lib/utils";
import { Check, Link2Off, Plus, Search } from "lucide-react";
import { type ComponentProps, useState } from "react";
import type z from "zod";
import DescriptionEditor from "@/components/description-editor";
import { useRouterAdapter } from "../../../router/adapter";
import { IssueLabelSelect } from "../components/issue-label-select";
import { IssueCreateForm } from "../form/create";

type IssueListItem = Outputs["issue"]["list"][number];
type IssueSearchResult = Outputs["issue"]["search"]["issues"][number];
type SubmitResult = { success: true } | { error: unknown };

type IssueLinkTarget = {
	id: string;
	team?: {
		key: string;
	} | null;
};

type SubIssueSearchState = {
	query: string;
	onQueryChange: (query: string) => void;
	results: Array<IssueSearchResult>;
	isSearching: boolean;
	hasSearched: boolean;
	minQueryLength: number;
};

type Props = {
	issue: Outputs["issue"]["get"];
	statuses: Outputs["issue"]["status"]["list"];
	priorities: Outputs["priority"]["list"];
	labels: Outputs["label"]["list"];
	teamMembers: Outputs["teamMembership"]["list"];
	workspaceId: string;
	onUpdate: (
		input: Inputs["issue"]["update"],
	) => Promise<Outputs["issue"]["update"]>;
	updateIssuePriority: (
		input: Inputs["issue"]["updatePriority"],
	) => Promise<Outputs["issue"]["updatePriority"]>;
	updateIssueAssignee: (
		input: Inputs["issue"]["updateAssignee"],
	) => Promise<Outputs["issue"]["updateAssignee"]>;
	addLabels: (input: Inputs["issue"]["labels"]["bulkAdd"]) => Promise<void>;
	deleteLabels: (
		input: Inputs["issue"]["labels"]["bulkDelete"],
	) => Promise<void>;
	teamId: string;
	parentIssue?: IssueListItem | null;
	subIssues?: Array<IssueListItem>;
	subIssueSearch?: SubIssueSearchState;
	onAttachSubIssue?: (issue: IssueSearchResult) => Promise<void>;
	onDetachSubIssue?: (issueId: string) => Promise<void>;
	onCreateSubIssue?: (
		issue: z.input<typeof issueCreateSchema>,
	) => Promise<SubmitResult>;
	getIssueUrl?: (issue: IssueLinkTarget) => `/${string}`;
	className?: ComponentProps<"div">["className"];
};

function getIssueReference(
	issue: IssueLinkTarget & { number?: number | null },
) {
	if (issue.team?.key && typeof issue.number === "number") {
		return `${issue.team.key}-${issue.number}`;
	}

	if (typeof issue.number === "number") {
		return `#${issue.number}`;
	}

	return "Issue";
}

export function IssueDetail({
	issue,
	statuses,
	priorities,
	labels,
	teamMembers,
	workspaceId,
	onUpdate,
	updateIssuePriority,
	updateIssueAssignee,
	addLabels,
	deleteLabels,
	teamId,
	parentIssue = null,
	subIssues = [],
	subIssueSearch,
	onAttachSubIssue,
	onDetachSubIssue,
	onCreateSubIssue,
	getIssueUrl,
	className,
}: Props) {
	const [isEditingTitle, setIsEditingTitle] = useState(false);
	const [editedTitle, setEditedTitle] = useState(issue.title);
	const { Link } = useRouterAdapter();
	const hasSubIssues = subIssues.length > 0;

	const handleTitleSave = async () => {
		if (editedTitle !== issue.title) {
			await onUpdate({
				id: issue.id,
				workspaceId,
				title: editedTitle,
			});
		}
		setIsEditingTitle(false);
	};

	return (
		<div className={cn("space-y-6", className)}>
			<div className="space-y-2">
				<div className="flex items-center gap-2 text-muted-foreground text-sm">
					<span>
						{issue.team?.key}-{issue.number}
					</span>
					<span>•</span>
					<span>{new Date(issue.createdAt).toLocaleDateString()}</span>
				</div>
				{isEditingTitle ? (
					<div className="flex gap-2 items-start">
						<input
							type="text"
							value={editedTitle}
							onChange={(e) => setEditedTitle(e.target.value)}
							onKeyDown={(e) => {
								if (e.key === "Enter") {
									handleTitleSave();
								} else if (e.key === "Escape") {
									setEditedTitle(issue.title);
									setIsEditingTitle(false);
								}
							}}
							className="flex-1 text-2xl font-bold bg-transparent border-b border-input focus:outline-none focus:border-primary py-1"
						/>
						<Button
							size="sm"
							variant="ghost"
							onClick={handleTitleSave}
							className="mt-1"
						>
							<Check className="size-4" />
						</Button>
					</div>
				) : (
					<button
						type="button"
						onClick={() => setIsEditingTitle(true)}
						className="text-left text-2xl font-bold hover:underline focus:outline-none focus:ring-2 focus:ring-ring rounded"
					>
						{issue.title}
					</button>
				)}
			</div>

			<div className="flex flex-wrap gap-2">
				<Select
					value={issue.priorityId ?? ""}
					onValueChange={async (newPriorityId) => {
						await updateIssuePriority({
							id: issue.id,
							workspaceId,
							priorityId: newPriorityId || null,
						});
					}}
				>
					<SelectTrigger
						className="bg-transparent border px-2 py-1 text-sm cursor-pointer h-fit w-fit shadow-none"
						style={{
							borderColor:
								priorities.find((p) => p.id === issue.priorityId)?.color ??
								undefined,
						}}
						clearable={!!issue.priorityId}
						onClear={async () => {
							await updateIssuePriority({
								id: issue.id,
								workspaceId,
								priorityId: null,
							});
						}}
					>
						<SelectValue placeholder="-">
							{(value) => {
								return (
									<Badge
										variant="outline"
										style={{
											borderColor:
												priorities.find((p) => p.id === value)?.color ??
												undefined,
											color:
												priorities.find((p) => p.id === value)?.color ??
												undefined,
										}}
									>
										{priorities.find((p) => p.id === value)?.name ?? value}
									</Badge>
								);
							}}
						</SelectValue>
					</SelectTrigger>
					<SelectContent>
						{priorities.map((priority) => (
							<SelectItem key={priority.id} value={priority.id}>
								{priority.name}
							</SelectItem>
						))}
					</SelectContent>
				</Select>

				<Select
					value={issue.statusId ?? ""}
					onValueChange={async (newStatusId) => {
						await onUpdate({
							id: issue.id,
							workspaceId,
							statusId: newStatusId ?? undefined,
						});
					}}
				>
					<SelectTrigger className="bg-transparent border px-2 py-1 text-sm cursor-pointer h-fit w-fit shadow-none">
						<SelectValue placeholder="-">
							{(value) => {
								const status = statuses.find((s) => s.id === value);
								return (
									<Badge variant="secondary">{status?.name ?? value}</Badge>
								);
							}}
						</SelectValue>
					</SelectTrigger>
					<SelectContent>
						{statuses.map((status) => (
							<SelectItem key={status.id} value={status.id}>
								{status.name}
							</SelectItem>
						))}
					</SelectContent>
				</Select>

				<Select
					value={issue.assignee?.id ?? ""}
					onValueChange={async (newAssigneeId) => {
						await updateIssueAssignee({
							id: issue.id,
							workspaceId,
							assigneeId: newAssigneeId || null,
						});
					}}
				>
					<SelectTrigger
						className="border px-2 py-1 text-sm cursor-pointer h-fit w-fit shadow-none"
						clearable={!!issue.assignee}
						onClear={async () => {
							await updateIssueAssignee({
								id: issue.id,
								workspaceId,
								assigneeId: null,
							});
						}}
					>
						<SelectValue placeholder="Unassigned">
							{(value) => {
								return (
									<Badge variant="outline">
										{teamMembers?.find((m) => m.user.id === value)?.user.name ??
											value}
									</Badge>
								);
							}}
						</SelectValue>
					</SelectTrigger>
					<SelectContent>
						{teamMembers?.map((member) => (
							<SelectItem key={member.user.id} value={member.user.id}>
								{member.user.name}
							</SelectItem>
						))}
					</SelectContent>
				</Select>

				<IssueLabelSelect
					labels={labels}
					value={issue.labelLinks.map((link) => link.labelId)}
					workspaceId={workspaceId}
					issueId={issue.id}
					addLabels={addLabels}
					deleteLabels={deleteLabels}
				/>
			</div>

			<div className="prose dark:prose-invert max-w-none">
				<DescriptionEditor
					issue={issue}
					workspaceId={workspaceId}
					onUpdate={onUpdate}
				/>
			</div>

			<div className="space-y-3">
				<div className="flex items-center justify-between gap-3">
					<h2 className="font-semibold text-sm">Sub-tasks</h2>
					{hasSubIssues &&
					onAttachSubIssue &&
					onCreateSubIssue &&
					subIssueSearch ? (
						<AddSubIssueDialog
							issue={issue}
							workspaceId={workspaceId}
							teamId={teamId}
							statuses={statuses}
							priorities={priorities}
							labels={labels}
							teamMembers={teamMembers}
							search={subIssueSearch}
							onAttachSubIssue={onAttachSubIssue}
							onCreateSubIssue={onCreateSubIssue}
						/>
					) : null}
				</div>

				{parentIssue && getIssueUrl ? (
					<div className="flex flex-wrap items-center gap-2 text-sm">
						<span className="text-muted-foreground">Parent</span>
						<Badge variant="outline" asChild>
							<Link to={getIssueUrl(parentIssue)}>
								{getIssueReference(parentIssue)}
							</Link>
						</Badge>
						<span className="truncate text-muted-foreground">
							{parentIssue.title}
						</span>
					</div>
				) : null}

				{subIssues.length > 0 ? (
					<div className="rounded-md border">
						<Table>
							<TableHeader>
								<TableRow className="hover:bg-transparent">
									<TableHead className="w-[100px]">ID</TableHead>
									<TableHead>Title</TableHead>
									<TableHead>Status</TableHead>
									<TableHead>Assignee</TableHead>
									<TableHead className="w-[60px] text-right"></TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{subIssues.map((subIssue) => {
									const issueUrl = getIssueUrl?.(subIssue);
									return (
										<TableRow key={subIssue.id}>
											<TableCell className="font-medium text-muted-foreground">
												{issueUrl ? (
													<Link
														to={issueUrl}
														className="hover:text-foreground hover:underline"
													>
														{getIssueReference(subIssue)}
													</Link>
												) : (
													getIssueReference(subIssue)
												)}
											</TableCell>
											<TableCell className="max-w-[360px] truncate font-medium">
												{issueUrl ? (
													<Link
														to={issueUrl}
														className="hover:text-foreground hover:underline"
													>
														{subIssue.title}
													</Link>
												) : (
													subIssue.title
												)}
											</TableCell>
											<TableCell>
												<Badge variant="secondary">
													{subIssue.status?.name ?? "-"}
												</Badge>
											</TableCell>
											<TableCell className="text-muted-foreground">
												{subIssue.assignee?.name ?? "Unassigned"}
											</TableCell>
											<TableCell className="text-right">
												{onDetachSubIssue ? (
													<Button
														type="button"
														variant="ghost"
														size="icon-sm"
														onClick={() => onDetachSubIssue(subIssue.id)}
													>
														<Link2Off className="size-4" />
														<span className="sr-only">Detach sub-task</span>
													</Button>
												) : null}
											</TableCell>
										</TableRow>
									);
								})}
							</TableBody>
						</Table>
					</div>
				) : (
					<div className="flex min-h-24 flex-col items-center justify-center gap-3 rounded-md border border-dashed text-center">
						<p className="text-muted-foreground text-sm">No sub-tasks yet.</p>
						{onAttachSubIssue && onCreateSubIssue && subIssueSearch ? (
							<AddSubIssueDialog
								issue={issue}
								workspaceId={workspaceId}
								teamId={teamId}
								statuses={statuses}
								priorities={priorities}
								labels={labels}
								teamMembers={teamMembers}
								search={subIssueSearch}
								onAttachSubIssue={onAttachSubIssue}
								onCreateSubIssue={onCreateSubIssue}
								triggerVariant="default"
							/>
						) : null}
					</div>
				)}
			</div>
		</div>
	);
}

function AddSubIssueDialog({
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
}: {
	issue: Outputs["issue"]["get"];
	workspaceId: string;
	teamId: string;
	statuses: Props["statuses"];
	priorities: Props["priorities"];
	labels: Props["labels"];
	teamMembers: Props["teamMembers"];
	search: SubIssueSearchState;
	onAttachSubIssue: (issue: IssueSearchResult) => Promise<void>;
	onCreateSubIssue: (
		issue: z.input<typeof issueCreateSchema>,
	) => Promise<SubmitResult>;
	triggerVariant?: ComponentProps<typeof Button>["variant"];
}) {
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
							) : search.results.length > 0 ? (
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
							) : (
								<div className="px-3 py-6 text-center text-muted-foreground text-sm">
									{showQueryLengthPrompt
										? `Type at least ${search.minQueryLength} characters, or enter an issue number.`
										: showNoResults
											? "No attachable issues found."
											: "Start typing to search issues."}
								</div>
							)}
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
