import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Badge } from "@prism/ui/components/badge";
import { TableCell, TableRow } from "@prism/ui/components/table";
import { cn } from "@prism/ui/lib/utils";
import { GripVertical } from "lucide-react";
import { IssueAssigneeSelect } from "../components/issue-assignee-select";
import { IssueCycleSelect } from "../components/issue-cycle-select";
import { IssueLabelSelect } from "../components/issue-label-select";
import { IssuePrioritySelect } from "../components/issue-priority-select";
import { SubIssuesPopover } from "../components/sub-issues-popover";
import type {
	CycleList,
	IssueActions,
	IssueListItem,
	IssueNavigation,
	LabelActions,
	LabelList,
	PriorityList,
	TeamMemberList,
} from "../types";

type Props = {
	issue: IssueListItem;
	labels: LabelList;
	priorities: PriorityList;
	teamMembers: TeamMemberList;
	cycles: CycleList;
	workspaceId: string;
	issueActions: Pick<
		IssueActions,
		"updatePriority" | "updateAssignee" | "updateCycle"
	>;
	labelActions: LabelActions;
	navigation?: IssueNavigation;
	subIssues: Array<IssueListItem>;
};

export function SortableIssueRow({
	issue,
	labels,
	priorities,
	teamMembers,
	cycles,
	workspaceId,
	issueActions,
	labelActions,
	navigation,
	subIssues,
}: Props) {
	const {
		attributes,
		listeners,
		setNodeRef,
		transform,
		transition,
		isDragging,
	} = useSortable({ id: issue.id });

	const style = {
		transform: CSS.Transform.toString(transform),
		transition,
		opacity: isDragging ? 0.5 : undefined,
	};

	return (
		<TableRow
			ref={setNodeRef}
			style={style}
			className={cn(
				navigation?.onIssueClick ? "cursor-pointer hover:bg-muted/50" : "",
				issue.archivedAt ? "bg-muted/20 opacity-70" : "",
			)}
			onClick={(event) => {
				const target = event.target;
				if (
					event.defaultPrevented ||
					(target instanceof HTMLElement &&
						target.closest("button, a, input, select, [role='combobox']"))
				) {
					return;
				}
				navigation?.onIssueClick?.(issue.id);
			}}
		>
			<TableCell className="w-[30px]">
				<button
					{...attributes}
					{...listeners}
					type="button"
					className="cursor-grab rounded p-1 hover:bg-muted active:cursor-grabbing"
				>
					<GripVertical className="size-4 text-muted-foreground" />
				</button>
			</TableCell>
			<TableCell className="font-medium text-muted-foreground">
				{issue.team?.key}-{issue.number}
			</TableCell>
			<TableCell className="font-medium">
				<div className="flex items-center gap-2">
					<span>{issue.title}</span>
					{issue.archivedAt ? (
						<Badge variant="secondary">Archived</Badge>
					) : null}
				</div>
			</TableCell>
			<TableCell>
				{subIssues.length > 0 ? (
					<SubIssuesPopover
						subIssues={subIssues}
						getIssueUrl={navigation?.getIssueUrl}
					/>
				) : (
					<span className="text-muted-foreground">-</span>
				)}
			</TableCell>
			<TableCell>
				<IssueCycleSelect
					cycleId={issue.cycleId}
					cycles={cycles}
					currentCycle={issue.cycle}
					triggerClassName="h-fit w-full cursor-pointer border bg-transparent px-2 py-1 text-sm shadow-none"
					onChange={(cycleId) =>
						issueActions.updateCycle({
							id: issue.id,
							workspaceId,
							cycleId,
						})
					}
				/>
			</TableCell>
			<TableCell>
				<IssuePrioritySelect
					priorityId={issue.priorityId}
					priorities={priorities}
					triggerClassName="h-fit w-full cursor-pointer border bg-transparent px-2 py-1 text-sm shadow-none"
					onChange={(priorityId) =>
						issueActions.updatePriority({
							id: issue.id,
							workspaceId,
							priorityId,
						})
					}
				/>
			</TableCell>
			<TableCell>
				<IssueLabelSelect
					labels={labels}
					value={issue.labelLinks.map((link) => link.labelId)}
					workspaceId={workspaceId}
					issueId={issue.id}
					addLabels={labelActions.addLabels}
					deleteLabels={labelActions.deleteLabels}
				/>
			</TableCell>
			<TableCell>
				<IssueAssigneeSelect
					assigneeId={issue.assignee?.id ?? null}
					teamMembers={teamMembers}
					triggerClassName="h-fit w-full cursor-pointer border px-2 py-1 text-sm shadow-none"
					onChange={(assigneeId) =>
						issueActions.updateAssignee({
							id: issue.id,
							workspaceId,
							assigneeId,
						})
					}
				/>
			</TableCell>
			<TableCell className="text-right text-muted-foreground">
				{new Date(issue.createdAt).toLocaleDateString()}
			</TableCell>
		</TableRow>
	);
}
