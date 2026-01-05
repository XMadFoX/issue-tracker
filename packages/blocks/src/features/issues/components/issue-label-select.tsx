import type { Inputs, Outputs } from "@prism/api/src/router";
import { LabelMultiSelect } from "@/features/labels/components/label-multi-select";

/**
 * Props for the IssueLabelSelect component.
 * Used in the issues table for inline label editing.
 */
type Props = {
	/** List of available labels to choose from */
	labels: Outputs["label"]["list"];
	/** Currently selected label IDs on the issue */
	value: string[];
	/** Workspace ID for API calls */
	workspaceId: string;
	/** Issue ID being edited */
	issueId: string;
	/** API callback to add labels to an issue */
	addLabels: (input: Inputs["issue"]["labels"]["bulkAdd"]) => Promise<void>;
	/** API callback to remove labels from an issue */
	deleteLabels: (
		input: Inputs["issue"]["labels"]["bulkDelete"],
	) => Promise<void>;
};

/**
 * A multi-select component for editing issue labels inline in a table.
 * Wraps LabelMultiSelect with API callbacks for add/remove operations.
 * Automatically syncs changes with the server.
 */
export function IssueLabelSelect({
	labels,
	value,
	workspaceId,
	issueId,
	addLabels,
	deleteLabels,
}: Props) {
	return (
		<LabelMultiSelect
			labels={labels}
			value={value}
			onChange={async (newValue) => {
				const current = value;
				const added = newValue.filter((id) => !current.includes(id));
				const removed = current.filter((id) => !newValue.includes(id));

				if (added.length > 0) {
					await addLabels({
						issueId,
						workspaceId,
						labelIds: added,
					});
				}

				if (removed.length > 0) {
					await deleteLabels({
						issueId,
						workspaceId,
						labelIds: removed,
					});
				}
			}}
			className="bg-transparent border px-2 py-1 text-sm cursor-pointer h-fit w-full shadow-none"
		/>
	);
}
