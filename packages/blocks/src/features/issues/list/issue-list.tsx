import type { Inputs, Outputs } from "@prism/api/src/router";
import { Badge } from "@prism/ui/components/badge";
import { Button } from "@prism/ui/components/button";
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
import { Plus } from "lucide-react";
import { type ComponentProps, useMemo } from "react";
import { IssueLabelSelect } from "../components/issue-label-select";
import { IssueCreateModal } from "../modal/issue-create-modal";

type Props = {
	issues: Outputs["issue"]["list"];
	statuses: Outputs["issue"]["status"]["list"];
	priorities: Outputs["priority"]["list"];
	labels: Outputs["label"]["list"];
	teamMembers: Outputs["teamMembership"]["list"];
	teamId: string;
	workspaceId: string;
	onIssueSubmit: ComponentProps<typeof IssueCreateModal>["onSubmit"];
	addLabels: (input: Inputs["issue"]["labels"]["bulkAdd"]) => Promise<void>;
	deleteLabels: (
		input: Inputs["issue"]["labels"]["bulkDelete"],
	) => Promise<void>;
	updateIssuePriority: (
		input: Inputs["issue"]["updatePriority"],
	) => Promise<Outputs["issue"]["updatePriority"]>;
	updateIssueAssignee: (
		input: Inputs["issue"]["updateAssignee"],
	) => Promise<Outputs["issue"]["updateAssignee"]>;
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
	teamMembers,
	onIssueSubmit,
	addLabels,
	deleteLabels,
	updateIssuePriority,
	updateIssueAssignee,
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
								assignees={teamMembers}
								trigger={CreateIssueButton()}
								onSubmit={onIssueSubmit}
								initialStatusId={status.id}
							/>
						</div>

						{statusIssues.length > 0 && (
							<IssuesTable
								statusIssues={statusIssues}
								labels={labels}
								priorities={priorities}
								teamMembers={teamMembers}
								workspaceId={workspaceId}
								addLabels={addLabels}
								deleteLabels={deleteLabels}
								updateIssuePriority={updateIssuePriority}
								updateIssueAssignee={updateIssueAssignee}
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
	priorities,
	teamMembers,
	workspaceId,
	addLabels,
	deleteLabels,
	updateIssuePriority,
	updateIssueAssignee,
}: {
	statusIssues: StatusIssues;
	labels: Props["labels"];
	priorities: Props["priorities"];
	teamMembers: Props["teamMembers"];
	workspaceId: string;
	addLabels: Props["addLabels"];
	deleteLabels: Props["deleteLabels"];
	updateIssuePriority: Props["updateIssuePriority"];
	updateIssueAssignee: Props["updateIssueAssignee"];
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
										className="bg-transparent border px-2 py-1 text-sm cursor-pointer h-fit w-full shadow-none"
										style={{
											borderColor:
												priorities.find((p) => p.id === issue.priorityId)
													?.color ?? undefined,
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
													priorities.find((p) => p.id === value)?.name ?? value
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
							</TableCell>
							<TableCell>
								<IssueLabelSelect
									labels={labels}
									value={issue.labelLinks.map((link) => link.labelId)}
									workspaceId={workspaceId}
									issueId={issue.id}
									addLabels={addLabels}
									deleteLabels={deleteLabels}
								/>
							</TableCell>
							<TableCell>
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
										className="border px-2 py-1 text-sm cursor-pointer h-fit w-full shadow-none"
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
													teamMembers?.find((m) => m.user.id === value)?.user
														.name ?? value
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
