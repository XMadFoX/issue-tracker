import type { Inputs, Outputs } from "@prism/api/src/router";
import { Badge } from "@prism/ui/components/badge";
import { Button } from "@prism/ui/components/button";
import { MultiSelect } from "@prism/ui/components/multi-select";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@prism/ui/components/table";
import { Plus } from "lucide-react";
import { type ComponentProps, useMemo } from "react";
import { IssueCreateModal } from "../modal/issue-create-modal";

type Props = {
	issues: Outputs["issue"]["list"];
	statuses: Outputs["issue"]["status"]["list"];
	priorities: Outputs["priority"]["list"];
	labels: Outputs["label"]["list"];
	teamId: string;
	workspaceId: string;
	onIssueSubmit: ComponentProps<typeof IssueCreateModal>["onSubmit"];
};

function CreateIssueButton() {
	return (
		<Button variant="ghost" size="icon" type="button" className="p-2 ml-auto">
			<Plus className="size-3" />
		</Button>
	);
}

export function IssueList({
	issues,
	statuses,
	workspaceId,
	teamId,
	priorities,
	labels,
	onIssueSubmit,
}: Props) {
	const groupedIssues = useMemo(() => {
		const groups: Record<string, typeof issues> = {};
		for (const status of statuses) {
			groups[status.id] = issues.filter((i) => i.statusId === status.id);
		}
		return groups;
	}, [issues, statuses]);

	return (
		<div className="space-y-10">
			{statuses.map((status) => {
				const statusIssues = groupedIssues[status.id] || [];
				return (
					<div key={status.id} className="space-y-4">
						<div className="flex items-center gap-2 px-1">
							<div
								className="w-2.5 h-2.5 rounded-full"
								style={{ backgroundColor: status.color ?? "#ccc" }}
							/>
							<h2 className="font-semibold text-sm uppercase tracking-wider text-muted-foreground">
								{status.name}
							</h2>
							<Badge variant="secondary" className="ml-1 px-1.5 py-0 h-5">
								{statusIssues.length}
							</Badge>
							<IssueCreateModal
								workspaceId={workspaceId}
								teamId={teamId}
								priorities={priorities}
								statuses={statuses}
								trigger={CreateIssueButton()}
								onSubmit={onIssueSubmit}
								initialStatusId={status.id}
							/>
						</div>

						{statusIssues.length > 0 && (
							<IssuesTable
								statusIssues={statusIssues}
								labels={labels}
								workspaceId={workspaceId}
							/>
						)}
					</div>
				);
			})}
		</div>
	);
}

type StatusIssues = Props["issues"];

function IssuesTable({
	statusIssues,
	labels,
	workspaceId,
}: {
	statusIssues: StatusIssues;
	labels: Props["labels"];
	workspaceId: string;
}) {
	return (
		<div className="rounded-md border">
			<Table>
				<TableHeader>
					<TableRow className="hover:bg-transparent">
						<TableHead className="w-[100px]">ID</TableHead>
						<TableHead>Title</TableHead>
						<TableHead>Priority</TableHead>
						<TableHead>Label</TableHead>
						<TableHead>Assignee</TableHead>
						<TableHead className="text-right">Created</TableHead>
					</TableRow>
				</TableHeader>
				<TableBody>
					{statusIssues.map((issue) => (
						<TableRow key={issue.id}>
							<TableCell className="font-medium text-muted-foreground">
								{issue.team?.key}-{issue.number}
							</TableCell>
							<TableCell className="font-medium">{issue.title}</TableCell>
							<TableCell>
								{issue.priority ? (
									<Badge
										variant="outline"
										className="font-normal"
										style={{
											borderColor: issue.priority.color ?? undefined,
											color: issue.priority.color ?? undefined,
										}}
									>
										{issue.priority.name}
									</Badge>
								) : (
									<span className="text-muted-foreground">-</span>
								)}
							</TableCell>
							<TableCell>
								{issue.assignee ? (
									<div className="flex items-center gap-2">
										<div className="w-5 h-5 rounded-full bg-muted flex items-center justify-center text-[10px]">
											{issue.assignee.name?.[0]}
										</div>
										<span>{issue.assignee.name}</span>
									</div>
								) : (
									<span className="text-muted-foreground">Unassigned</span>
								)}
							</TableCell>
							<TableCell className="text-right text-muted-foreground">
								{new Date(issue.createdAt).toLocaleDateString()}
							</TableCell>
						</TableRow>
					))}
				</TableBody>
			</Table>
		</div>
	);
}
