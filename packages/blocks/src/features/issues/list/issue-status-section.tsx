import { useDroppable } from "@dnd-kit/core";
import { Badge } from "@prism/ui/components/badge";
import { Button } from "@prism/ui/components/button";
import { Plus } from "lucide-react";
import { IssueCreateModal } from "../modal/issue-create-modal";
import type {
	CycleList,
	IssueActions,
	IssueListData,
	IssueListItem,
	IssueNavigation,
	IssueStatusList,
	IssueTypeAllowedStatusIdsByType,
	IssueTypeList,
	LabelActions,
	LabelList,
	PriorityList,
	TeamMemberList,
} from "../types";
import { IssuesTable } from "./issues-table";

export const ISSUE_STATUS_DROP_ID_PREFIX = "issue-status:";

function CreateIssueButton() {
	return (
		<Button variant="ghost" size="icon" type="button" className="ml-auto p-2">
			<Plus className="size-3" />
		</Button>
	);
}

function AddIssueInlineButton() {
	return (
		<Button
			variant="link"
			type="button"
			className="inline h-auto border-0 bg-transparent p-0 align-baseline font-normal text-muted-foreground shadow-none hover:bg-transparent hover:text-foreground hover:underline"
		>
			Add one
		</Button>
	);
}

type EmptyStatusDropZoneProps = Pick<
	Props,
	| "teamId"
	| "workspaceId"
	| "priorities"
	| "statuses"
	| "issueTypes"
	| "allowedStatusesByIssueTypeId"
	| "initialIssueTypeId"
	| "teamMembers"
	| "labels"
> & {
	statusId: string;
	/** Pre-selected status for the create form; may differ from statusId when
	 *  the column's status is incompatible with the active type filter. */
	initialStatusId: string | undefined;
	onCreate: IssueActions["create"];
};

function EmptyStatusDropZone({
	statusId,
	initialStatusId,
	workspaceId,
	teamId,
	priorities,
	statuses,
	issueTypes,
	allowedStatusesByIssueTypeId,
	initialIssueTypeId,
	teamMembers,
	labels,
	onCreate,
}: EmptyStatusDropZoneProps) {
	const { isOver, setNodeRef } = useDroppable({
		id: `${ISSUE_STATUS_DROP_ID_PREFIX}${statusId}`,
	});

	return (
		<div
			ref={setNodeRef}
			className={`grid h-24 place-items-center rounded-md border border-dashed px-4 text-center text-muted-foreground text-sm transition-colors ${
				isOver ? "border-primary bg-primary/10 text-foreground" : ""
			}`}
		>
			<div className="flex h-10 flex-col justify-center">
				{isOver ? (
					<p className="font-medium text-foreground">Drop issue here</p>
				) : (
					<>
						<p className="font-medium text-foreground">No issues</p>
						<p>
							Drag an issue here or{" "}
							<IssueCreateModal
								workspaceId={workspaceId}
								teamId={teamId}
								priorities={priorities}
								statuses={statuses}
								issueTypes={issueTypes}
								allowedStatusesByIssueTypeId={allowedStatusesByIssueTypeId}
								assignees={teamMembers}
								labels={labels}
								trigger={AddIssueInlineButton()}
								onSubmit={onCreate}
								initialStatusId={initialStatusId}
								initialIssueTypeId={initialIssueTypeId}
							/>
						</p>
					</>
				)}
			</div>
		</div>
	);
}

type Props = {
	status: IssueStatusList[number];
	statusIssues: IssueListData;
	statuses: IssueStatusList;
	workspaceId: string;
	teamId: string;
	priorities: PriorityList;
	issueTypes: IssueTypeList;
	allowedStatusesByIssueTypeId?: IssueTypeAllowedStatusIdsByType;
	initialIssueTypeId?: string;
	labels: LabelList;
	teamMembers: TeamMemberList;
	cycles: CycleList;
	issueActions: Pick<
		IssueActions,
		| "create"
		| "update"
		| "updateIssueType"
		| "updatePriority"
		| "updateAssignee"
		| "updateCycle"
	>;
	labelActions: LabelActions;
	navigation?: IssueNavigation;
	subIssuesByParentId: Map<string, Array<IssueListItem>>;
};

/**
 * Returns false only when we have explicit allowed-status data showing this
 * status is NOT in the allowed set for the given issue type.  When the map is
 * absent or the type has an empty list (meaning "all allowed"), returns true.
 */
function isStatusCompatibleWithType(
	statusId: string,
	issueTypeId: string | undefined,
	allowedStatusesByIssueTypeId: IssueTypeAllowedStatusIdsByType | undefined,
): boolean {
	if (!issueTypeId) return true;
	const allowed = allowedStatusesByIssueTypeId?.[issueTypeId];
	return (
		allowed === undefined || allowed.length === 0 || allowed.includes(statusId)
	);
}

export function IssueStatusSection({
	status,
	statusIssues,
	statuses,
	workspaceId,
	teamId,
	priorities,
	issueTypes,
	allowedStatusesByIssueTypeId,
	initialIssueTypeId,
	labels,
	teamMembers,
	cycles,
	issueActions,
	labelActions,
	navigation,
	subIssuesByParentId,
}: Props) {
	// When a type filter is active and this column's status is incompatible with
	// that type, omit the status pre-fill so the form keeps the filtered type
	// rather than silently switching to a different, compatible type.
	const effectiveInitialStatusId = isStatusCompatibleWithType(
		status.id,
		initialIssueTypeId,
		allowedStatusesByIssueTypeId,
	)
		? status.id
		: undefined;

	return (
		<div className="space-y-4">
			<div className="flex items-center gap-2 px-1">
				<div
					className="size-2.5 rounded-full"
					style={{ backgroundColor: status.color ?? "#ccc" }}
				/>
				<h2 className="font-semibold text-muted-foreground text-sm uppercase tracking-wider">
					{status.name}
				</h2>
				<Badge variant="secondary" className="ml-1 h-5 px-1.5 py-0">
					{statusIssues.length}
				</Badge>
				<IssueCreateModal
					workspaceId={workspaceId}
					teamId={teamId}
					priorities={priorities}
					statuses={statuses}
					issueTypes={issueTypes}
					allowedStatusesByIssueTypeId={allowedStatusesByIssueTypeId}
					assignees={teamMembers}
					labels={labels}
					trigger={CreateIssueButton()}
					onSubmit={issueActions.create}
					initialStatusId={effectiveInitialStatusId}
					initialIssueTypeId={initialIssueTypeId}
				/>
			</div>

			{statusIssues.length > 0 ? (
				<IssuesTable
					statusIssues={statusIssues}
					labels={labels}
					priorities={priorities}
					issueTypes={issueTypes}
					statuses={statuses}
					allowedStatusesByIssueTypeId={allowedStatusesByIssueTypeId}
					teamMembers={teamMembers}
					cycles={cycles}
					workspaceId={workspaceId}
					issueActions={issueActions}
					labelActions={labelActions}
					navigation={navigation}
					subIssuesByParentId={subIssuesByParentId}
				/>
			) : (
				<EmptyStatusDropZone
					statusId={status.id}
					initialStatusId={effectiveInitialStatusId}
					workspaceId={workspaceId}
					teamId={teamId}
					priorities={priorities}
					statuses={statuses}
					issueTypes={issueTypes}
					allowedStatusesByIssueTypeId={allowedStatusesByIssueTypeId}
					initialIssueTypeId={initialIssueTypeId}
					teamMembers={teamMembers}
					labels={labels}
					onCreate={issueActions.create}
				/>
			)}
		</div>
	);
}
