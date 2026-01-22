import type { Inputs, Outputs } from "@prism/api/src/router";
import {
	Sheet,
	SheetContent,
	SheetHeader,
	SheetTitle,
} from "@prism/ui/components/sheet";
import { ExternalLink } from "lucide-react";
import { useRouterAdapter } from "../../../router/adapter";
import { IssueDetail } from "../view/issue-detail";

type Props = {
	issue: Outputs["issue"]["get"];
	onClose: () => void;
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
	fullPageUrl: `/${string}`;
};

export function IssueDetailSheet({
	issue,
	onClose,
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
	fullPageUrl,
}: Props) {
	const { Link } = useRouterAdapter();

	return (
		<Sheet open={true} onOpenChange={(open) => !open && onClose()}>
			<SheetContent
				side="right"
				className="w-full sm:max-w-4xl! overflow-y-auto"
			>
				<SheetHeader className="mb-4">
					<div className="flex items-center justify-between pr-8">
						<SheetTitle className="sr-only">{issue.title}</SheetTitle>
						<Link
							to={fullPageUrl}
							className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
						>
							<span>Open full page</span>
							<ExternalLink className="size-4" />
						</Link>
					</div>
				</SheetHeader>
				<IssueDetail
					issue={issue}
					statuses={statuses}
					priorities={priorities}
					labels={labels}
					teamMembers={teamMembers}
					workspaceId={workspaceId}
					onUpdate={onUpdate}
					updateIssuePriority={updateIssuePriority}
					updateIssueAssignee={updateIssueAssignee}
					addLabels={addLabels}
					deleteLabels={deleteLabels}
					className="px-4"
				/>
			</SheetContent>
		</Sheet>
	);
}
