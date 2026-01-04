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
import color from "color";
import { Plus } from "lucide-react";
import { type ComponentProps, useMemo } from "react";
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

function getAccessibleTextColor(
	bgColor: string | undefined,
): string | undefined {
	if (!bgColor) return undefined;
	const bg = color(bgColor);
	const whiteContrast = bg.contrast(color("#ffffff"));
	const blackContrast = bg.contrast(color("#000000"));

	return whiteContrast > blackContrast ? "#ffffff" : "#000000";
}

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
								<Select
									multiple
									value={issue.labelLinks.map((link) => link.labelId)}
									onValueChange={async (newLabelIds) => {
										const currentLabelIds = issue.labelLinks.map(
											(link) => link.labelId,
										);
										const added = newLabelIds.filter(
											(id) => !currentLabelIds.includes(id),
										);
										const removed = currentLabelIds.filter(
											(id) => !newLabelIds.includes(id),
										);

										if (added.length > 0) {
											await addLabels({
												issueId: issue.id,
												workspaceId,
												labelIds: added,
											});
										}

										if (removed.length > 0) {
											await deleteLabels({
												issueId: issue.id,
												workspaceId,
												labelIds: removed,
											});
										}
									}}
								>
									<SelectTrigger
										className="bg-transparent border px-2 py-1 text-sm cursor-pointer h-fit w-full shadow-none"
										clearable={issue.labelLinks.length > 0}
										onClear={async () => {
											deleteLabels({
												issueId: issue.id,
												workspaceId: workspaceId,
												labelIds: issue.labelLinks.map((link) => link.labelId),
											});
										}}
									>
										<SelectValue placeholder="Select labels...">
											{(value: string[]) => {
												if (value.length === 0) return "Select labels...";
												const allLabels = value;
												return allLabels.map((labelId) => {
													const label = labels.find((l) => l.id === labelId);
													if (!label) return null;
													return (
														<button
															type="button"
															onPointerDown={(e) => {
																e.stopPropagation();
																e.preventDefault();
															}}
															onClick={(e) => {
																e.stopPropagation();
																e.preventDefault();
																deleteLabels({
																	issueId: issue.id,
																	workspaceId: workspaceId,
																	labelIds: [label.id],
																});
															}}
															key={label.id}
															className="inline-block px-2 py-1 rounded text-xs font-medium mr-2"
															style={{
																backgroundColor: label.color ?? undefined,
																color: getAccessibleTextColor(
																	label.color ?? undefined,
																),
															}}
														>
															{label.name}
														</button>
													);
												});
											}}
										</SelectValue>
									</SelectTrigger>
									<SelectContent>
										{labels.map((label) => (
											<SelectItem key={label.id} value={label.id}>
												{label.name}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
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
