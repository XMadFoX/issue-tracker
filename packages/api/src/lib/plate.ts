import {
	createSlateEditor,
	type Editor,
	type TElement,
	type TText,
	type Value,
} from "platejs";

export function editorToPlainText(value: Value): string {
	const editor = createSlateEditor({
		plugins: [],
		value,
	});

	return extractTextFromEditor(editor);
}

function extractTextFromEditor(editor: Editor): string {
	const lines: string[] = [];

	for (const node of editor.children) {
		lines.push(extractTextFromNode(node, editor));
	}

	return lines.join("\n");
}

function extractTextFromNode(node: TText | TElement, editor: Editor): string {
	if (isTextNode(node)) {
		return node.text;
	}

	if (node.children) {
		const childrenText = node.children
			.map((child) => extractTextFromNode(child, editor))
			.join("");

		return childrenText;
	}

	return "";
}

function isTextNode(node: TText | TElement): node is TText {
	return "text" in node;
}
