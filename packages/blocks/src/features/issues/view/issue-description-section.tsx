import DescriptionEditor from "@/components/description-editor";
import type { IssueActions, IssueDetailData } from "../types";

type Props = {
	issue: IssueDetailData;
	workspaceId: string;
	onUpdate: IssueActions["update"];
};

export function IssueDescriptionSection({
	issue,
	workspaceId,
	onUpdate,
}: Props) {
	return (
		<div className="prose dark:prose-invert max-w-none">
			<DescriptionEditor
				issue={issue}
				workspaceId={workspaceId}
				onUpdate={onUpdate}
			/>
		</div>
	);
}
