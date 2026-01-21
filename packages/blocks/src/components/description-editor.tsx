import { Editor, EditorContainer } from "@prism/ui/components/editor/editor";
import { EditorKit } from "@prism/ui/components/editor/editor-kit";
import type { Value } from "platejs";
import { Plate, usePlateEditor } from "platejs/react";

const initialValue: Value = [];

export default function DescriptionEditor() {
	const editor = usePlateEditor({
		plugins: [...EditorKit],
		value: initialValue,
	});

	return (
		<Plate editor={editor}>
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
