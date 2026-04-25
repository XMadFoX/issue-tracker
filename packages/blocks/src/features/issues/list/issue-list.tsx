import {
	closestCenter,
	DndContext,
	type DragEndEvent,
	DragOverlay,
	type DragStartEvent,
	KeyboardSensor,
	PointerSensor,
	useSensor,
	useSensors,
} from "@dnd-kit/core";
import { sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import {
	Table,
	TableBody,
	TableCell,
	TableRow,
} from "@prism/ui/components/table";
import { useCallback, useMemo, useState } from "react";
import type {
	IssueActions,
	IssueListData,
	IssueListItem,
	IssueNavigation,
	IssueStatusList,
	LabelActions,
	LabelList,
	PriorityList,
	TeamMemberList,
} from "../types";
import { IssueStatusSection } from "./issue-status-section";

type IssueListProps = {
	issues: IssueListData;
	statuses: IssueStatusList;
	priorities: PriorityList;
	labels: LabelList;
	teamMembers: TeamMemberList;
	teamId: string;
	workspaceId: string;
	issueActions: Pick<
		IssueActions,
		"create" | "updatePriority" | "updateAssignee" | "move"
	>;
	labelActions: LabelActions;
	navigation?: IssueNavigation;
};

export function IssueList({
	issues,
	statuses,
	workspaceId,
	teamId,
	priorities,
	labels,
	teamMembers,
	issueActions,
	labelActions,
	navigation,
}: IssueListProps) {
	const groupedIssues = useMemo(() => {
		const groups: Record<string, IssueListData> = {};
		for (const status of statuses) {
			groups[status.id] = issues.filter(
				(issue) => issue.statusId === status.id,
			);
		}
		return groups;
	}, [issues, statuses]);

	const subIssuesByParentId = useMemo(() => {
		const groups = new Map<string, Array<IssueListItem>>();
		for (const issue of issues) {
			if (!issue.parentIssueId) continue;
			const current = groups.get(issue.parentIssueId) ?? [];
			current.push(issue);
			groups.set(issue.parentIssueId, current);
		}
		return groups;
	}, [issues]);

	const [activeIssueId, setActiveIssueId] = useState<string | null>(null);

	const sensors = useSensors(
		useSensor(PointerSensor),
		useSensor(KeyboardSensor, {
			coordinateGetter: sortableKeyboardCoordinates,
		}),
	);

	const handleDragStart = useCallback((event: DragStartEvent) => {
		setActiveIssueId(String(event.active.id));
	}, []);

	const handleDragEnd = useCallback(
		async (event: DragEndEvent) => {
			const { active, over } = event;
			setActiveIssueId(null);

			if (!over || !issueActions.move) return;

			const draggedIssueId = String(active.id);
			const targetId = String(over.id);
			if (draggedIssueId === targetId) return;

			const draggedIssue = issues.find((issue) => issue.id === draggedIssueId);
			const targetIssue = issues.find((issue) => issue.id === targetId);
			if (!draggedIssue || !targetIssue) return;

			const activeIndex = issues.indexOf(draggedIssue);
			const overIndex = issues.indexOf(targetIssue);
			const after =
				draggedIssue.statusId !== targetIssue.statusId
					? true
					: activeIndex < overIndex;

			await issueActions.move({
				id: draggedIssueId,
				workspaceId,
				targetId,
				after,
			});
		},
		[issues, issueActions, workspaceId],
	);

	const activeIssue = activeIssueId
		? issues.find((issue) => issue.id === activeIssueId)
		: null;

	return (
		<DndContext
			sensors={sensors}
			collisionDetection={closestCenter}
			onDragStart={handleDragStart}
			onDragEnd={handleDragEnd}
		>
			<div className="space-y-10">
				{statuses.map((status) => (
					<IssueStatusSection
						key={status.id}
						status={status}
						statusIssues={groupedIssues[status.id] ?? []}
						statuses={statuses}
						workspaceId={workspaceId}
						teamId={teamId}
						priorities={priorities}
						labels={labels}
						teamMembers={teamMembers}
						issueActions={issueActions}
						labelActions={labelActions}
						navigation={navigation}
						subIssuesByParentId={subIssuesByParentId}
					/>
				))}
			</div>
			<DragOverlay>
				{activeIssue ? (
					<div className="rotate-1 rounded-md border bg-background opacity-90 shadow-lg">
						<Table>
							<TableBody>
								<TableRow>
									<TableCell className="font-medium text-muted-foreground">
										{activeIssue.team?.key}-{activeIssue.number}
									</TableCell>
									<TableCell className="font-medium">
										{activeIssue.title}
									</TableCell>
									<TableCell>
										{priorities.find(
											(priority) => priority.id === activeIssue.priorityId,
										)?.name ?? "-"}
									</TableCell>
									<TableCell>
										{new Date(activeIssue.createdAt).toLocaleDateString()}
									</TableCell>
								</TableRow>
							</TableBody>
						</Table>
					</div>
				) : null}
			</DragOverlay>
		</DndContext>
	);
}
