import type { Inputs, Outputs } from "@prism/api/src/router";
import { Editor, EditorContainer } from "@prism/ui/components/editor/editor";
import { EditorKit } from "@prism/ui/components/editor/editor-kit";
import { useDebouncedCallback } from "@tanstack/react-pacer";
import type { Value } from "platejs";
import { Plate, usePlateEditor } from "platejs/react";

type Props = {
	issue: Outputs["issue"]["get"];
	workspaceId: string;
	onUpdate: (
		input: Inputs["issue"]["update"],
	) => Promise<Outputs["issue"]["update"]>;
};

export default function DescriptionEditor({
	issue,
	workspaceId,
	onUpdate,
}: Props) {
	const initialValue: Value = (issue.description as Value) ?? [];

	const editor = usePlateEditor({
		plugins: [...EditorKit],
		value: initialValue,
	});

	const debouncedUpdate = useDebouncedCallback(
		async (input: Inputs["issue"]["update"]) => {
			await onUpdate(input);
		},
		{ wait: 300 },
	);

	const handleChange = ({ value }: { value: Value }) => {
		// Only send an update if the value actually changed.
		if (JSON.stringify(value) !== JSON.stringify(issue.description)) {
			debouncedUpdate({
				id: issue.id,
				workspaceId,
				description: value,
			});
		}
	};

	return (
		<Plate editor={editor} onChange={handleChange}>
			<EditorContainer>
				<Editor
					placeholder="Describe the issue..."
					variant="demo"
					className="px-2!"
				/>
			</EditorContainer>
		</Plate>
	);
}
