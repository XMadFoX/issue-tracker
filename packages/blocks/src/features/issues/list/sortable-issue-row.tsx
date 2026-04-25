import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { TableCell, TableRow } from "@prism/ui/components/table";
import { GripVertical } from "lucide-react";
import { IssueAssigneeSelect } from "../components/issue-assignee-select";
import { IssueLabelSelect } from "../components/issue-label-select";
import { IssuePrioritySelect } from "../components/issue-priority-select";
import { SubIssuesPopover } from "../components/sub-issues-popover";
import type {
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
	workspaceId: string;
	issueActions: Pick<IssueActions, "updatePriority" | "updateAssignee">;
	labelActions: LabelActions;
	navigation?: IssueNavigation;
	subIssues: Array<IssueListItem>;
};

export function SortableIssueRow({
	issue,
	labels,
	priorities,
	teamMembers,
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
			className={
				navigation?.onIssueClick ? "cursor-pointer hover:bg-muted/50" : ""
			}
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
			<TableCell className="font-medium">{issue.title}</TableCell>
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
