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
import { Check } from "lucide-react";
import { type ComponentProps, useState } from "react";
import { IssueLabelSelect } from "../components/issue-label-select";

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
};

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
}: Props) {
	const [isEditingTitle, setIsEditingTitle] = useState(false);
	const [editedTitle, setEditedTitle] = useState(issue.title);

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
		<div className="space-y-6">
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
							statusId: newStatusId,
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
				{issue.description ? (
					<div dangerouslySetInnerHTML={{ __html: issue.description }} />
				) : (
					<p className="text-muted-foreground italic">
						No description provided.
					</p>
				)}
			</div>
		</div>
	);
}
