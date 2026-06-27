import {
	IssueDetailSheet,
	type IssueLinkTarget,
	IssueList,
	type IssueTypeAllowedStatusIdsByType,
} from "@prism/blocks/src/features/issues";
import {
	type IssueArchivedFilter,
	type IssueTypeList,
	useIssueDetailModel,
} from "@prism/features/issues";
import { Badge } from "@prism/ui/components/badge";
import { Button } from "@prism/ui/components/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuLabel,
	DropdownMenuRadioGroup,
	DropdownMenuRadioItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@prism/ui/components/dropdown-menu";
import {
	useQuery,
	useSuspenseQueries,
	useSuspenseQuery,
} from "@tanstack/react-query";
import { Outlet, useNavigate } from "@tanstack/react-router";
import { type ComponentProps, useMemo } from "react";
import { buildIssueUrl } from "./issue-url";
import {
	issueQueries,
	useIssueLiveUpdates,
	useIssueMutations,
	useSubIssueSearch,
} from "./issues-feature";

type Props = {
	slug: string;
	teamSlug: string;
	selectedIssueId?: string;
	archivedFilter: IssueArchivedFilter;
	issueTypeId?: string;
};

const issueArchiveFilterOptions = [
	{ value: "unarchived", label: "Exclude archived" },
	{ value: "all", label: "Include archived" },
	{ value: "archived", label: "Only archived" },
] satisfies Array<{ value: IssueArchivedFilter; label: string }>;

const issueArchiveFilterSummary: Record<IssueArchivedFilter, string> = {
	unarchived: "Active only",
	all: "Including archived",
	archived: "Archived only",
};

function getIssueArchiveFilter(value: string): IssueArchivedFilter | null {
	return (
		issueArchiveFilterOptions.find((option) => option.value === value)?.value ??
		null
	);
}

export function IssuesRouteContainer({
	slug,
	teamSlug,
	selectedIssueId,
	archivedFilter,
	issueTypeId,
}: Props) {
	const navigate = useNavigate();
	const workspace = useSuspenseQuery(issueQueries.workspaceBySlug(slug));
	const workspaceId = workspace.data.id;
	const team = useSuspenseQuery(
		issueQueries.teamBySlug({ workspaceId, teamSlug }),
	);
	const teamId = team.data.id;
	const listInput = { workspaceId, teamId, archivedFilter, issueTypeId };
	const priorities = useSuspenseQuery(issueQueries.priorities(workspaceId));
	const statuses = useSuspenseQuery(issueQueries.statuses(workspaceId));
	const labels = useSuspenseQuery(issueQueries.labels(listInput));
	const teamMembers = useSuspenseQuery(issueQueries.teamMembers(listInput));
	const cycles = useSuspenseQuery(issueQueries.cycles(listInput));
	const issues = useSuspenseQuery(issueQueries.issueList(listInput));
	const issueTypes = useSuspenseQuery(
		issueQueries.issueTypes({ workspaceId, teamId }),
	);
	const issueTypeAllowedStatuses = useSuspenseQueries({
		queries: issueTypes.data.map((type) =>
			issueQueries.issueTypeAllowedStatuses({
				workspaceId,
				teamId,
				issueTypeId: type.id,
			}),
		),
	});
	const allowedStatusesByIssueTypeId = useMemo(
		() =>
			Object.fromEntries(
				issueTypes.data.map((type, index) => [
					type.id,
					issueTypeAllowedStatuses[index]?.data.map(
						(allowedStatus) => allowedStatus.statusId,
					) ?? [],
				]),
			),
		[issueTypes.data, issueTypeAllowedStatuses],
	);
	const { issueActions, labelActions } = useIssueMutations({
		workspaceId,
		teamId,
		selectedIssueId,
	});

	useIssueLiveUpdates(listInput);

	const getIssueUrl = (issue: IssueLinkTarget) =>
		buildIssueUrl({ slug, teamSlug, issue });

	const selectedTypeName =
		issueTypeId !== undefined
			? issueTypes.data.find((t) => t.id === issueTypeId)?.name
			: undefined;

	return (
		<div className="relative w-full space-y-8 p-6">
			<div className="flex items-center justify-between gap-4">
				<div className="flex items-center gap-3">
					<h1 className="font-bold text-2xl">Issues</h1>
					{archivedFilter !== "unarchived" ? (
						<Badge variant="secondary" className="font-normal">
							{issueArchiveFilterSummary[archivedFilter]}
						</Badge>
					) : null}
					{selectedTypeName ? (
						<Badge variant="secondary" className="font-normal">
							Type: {selectedTypeName}
						</Badge>
					) : null}
				</div>
				<DropdownMenu>
					<DropdownMenuTrigger
						render={
							<Button type="button" variant="ghost" size="sm">
								View options
							</Button>
						}
					/>
					<DropdownMenuContent align="end" className="w-56">
						<DropdownMenuGroup>
							<DropdownMenuLabel>Archived issues</DropdownMenuLabel>
							<DropdownMenuSeparator />
							<DropdownMenuRadioGroup
								value={archivedFilter}
								onValueChange={(value) => {
									const nextFilter = getIssueArchiveFilter(value);
									if (!nextFilter) return;

									navigate({
										to: ".",
										search: {
											archivedFilter: nextFilter,
											selectedIssue: undefined,
											issueTypeId,
										},
									});
								}}
							>
								{issueArchiveFilterOptions.map((option) => (
									<DropdownMenuRadioItem
										key={option.value}
										value={option.value}
									>
										{option.label}
									</DropdownMenuRadioItem>
								))}
							</DropdownMenuRadioGroup>
						</DropdownMenuGroup>
						{issueTypes.data.length > 0 ? (
							<DropdownMenuGroup>
								<DropdownMenuSeparator />
								<DropdownMenuLabel>Issue type</DropdownMenuLabel>
								<DropdownMenuSeparator />
								<DropdownMenuRadioGroup
									value={issueTypeId ?? ""}
									onValueChange={(value) => {
										navigate({
											to: ".",
											search: {
												archivedFilter,
												selectedIssue: undefined,
												issueTypeId: value || undefined,
											},
										});
									}}
								>
									<DropdownMenuRadioItem value="">
										All types
									</DropdownMenuRadioItem>
									{issueTypes.data.map((type) => (
										<DropdownMenuRadioItem key={type.id} value={type.id}>
											{type.icon} {type.name}
										</DropdownMenuRadioItem>
									))}
								</DropdownMenuRadioGroup>
							</DropdownMenuGroup>
						) : null}
					</DropdownMenuContent>
				</DropdownMenu>
			</div>

			<IssueList
				issues={issues.data}
				statuses={statuses.data}
				teamId={teamId}
				priorities={priorities.data}
				issueTypes={issueTypes.data}
				allowedStatusesByIssueTypeId={allowedStatusesByIssueTypeId}
				initialIssueTypeId={issueTypeId}
				labels={labels.data}
				teamMembers={teamMembers.data}
				cycles={cycles.data}
				workspaceId={workspaceId}
				issueActions={issueActions}
				labelActions={labelActions}
				navigation={{
					onIssueClick: (issueId) => {
						navigate({
							to: ".",
							search: { archivedFilter, issueTypeId, selectedIssue: issueId },
						});
					},
					getIssueUrl,
				}}
			/>
			<Outlet />
			{selectedIssueId ? (
				<SelectedIssueSheet
					issueId={selectedIssueId}
					slug={slug}
					teamSlug={teamSlug}
					workspaceId={workspaceId}
					teamId={teamId}
					issues={issues.data}
					statuses={statuses.data}
					priorities={priorities.data}
					issueTypes={issueTypes.data}
					allowedStatusesByIssueTypeId={allowedStatusesByIssueTypeId}
					labels={labels.data}
					cycles={cycles.data}
					teamMembers={teamMembers.data}
					getIssueUrl={getIssueUrl}
					onClose={() => {
						navigate({
							to: ".",
							search: { archivedFilter, issueTypeId, selectedIssue: undefined },
						});
					}}
				/>
			) : null}
		</div>
	);
}

type SelectedIssueSheetProps = {
	issueId: string;
	slug: string;
	teamSlug: string;
	workspaceId: string;
	teamId: string;
	issues: ComponentProps<typeof IssueList>["issues"];
	statuses: ComponentProps<typeof IssueDetailSheet>["statuses"];
	priorities: ComponentProps<typeof IssueDetailSheet>["priorities"];
	issueTypes: IssueTypeList;
	allowedStatusesByIssueTypeId?: IssueTypeAllowedStatusIdsByType;
	labels: ComponentProps<typeof IssueDetailSheet>["labels"];
	teamMembers: ComponentProps<typeof IssueDetailSheet>["teamMembers"];
	cycles: ComponentProps<typeof IssueDetailSheet>["cycles"];
	getIssueUrl: (issue: IssueLinkTarget) => `/${string}`;
	onClose: () => void;
};

function SelectedIssueSheet({
	issueId,
	slug,
	teamSlug,
	workspaceId,
	teamId,
	issues,
	statuses,
	priorities,
	issueTypes,
	allowedStatusesByIssueTypeId,
	labels,
	teamMembers,
	cycles,
	getIssueUrl,
	onClose,
}: SelectedIssueSheetProps) {
	const selectedIssue = useQuery(
		issueQueries.issueDetail({ workspaceId, issueId }),
	);
	const activity = useQuery({
		...issueQueries.issueActivity({ workspaceId, issueId }),
		enabled: selectedIssue.data !== undefined,
	});
	const { issueActions, labelActions, subIssueActions } = useIssueMutations({
		workspaceId,
		teamId,
		selectedIssueId: issueId,
	});
	const { parentIssue, subIssues } = useIssueDetailModel({
		issue: selectedIssue.data,
		issues,
	});
	const subIssueSearch = useSubIssueSearch({
		workspaceId,
		teamId,
		selectedIssueId: issueId,
		subIssues,
	});

	if (!selectedIssue.data) return null;

	return (
		<IssueDetailSheet
			issue={selectedIssue.data}
			activity={activity.data ?? []}
			onClose={onClose}
			statuses={statuses}
			priorities={priorities}
			issueTypes={issueTypes}
			allowedStatusesByIssueTypeId={allowedStatusesByIssueTypeId}
			labels={labels}
			teamMembers={teamMembers}
			cycles={cycles}
			workspaceId={workspaceId}
			teamId={teamId}
			issueActions={issueActions}
			labelActions={labelActions}
			parentIssue={parentIssue}
			subIssues={subIssues}
			subIssueSearch={subIssueSearch}
			subIssueActions={subIssueActions}
			navigation={{ getIssueUrl }}
			fullPageUrl={`/workspace/${slug}/teams/${teamSlug}/issue/${issueId}`}
		/>
	);
}
