import type { Inputs, Outputs } from "@prism/api/src/router";
import { Editor, EditorContainer } from "@prism/ui/components/editor/editor";
import { EditorKit } from "@prism/ui/components/editor/editor-kit";
import { cn } from "@prism/ui/lib/utils";
import { useDebouncedCallback } from "@tanstack/react-pacer";
import type { Value } from "platejs";
import { Plate, usePlateEditor } from "platejs/react";
import { type ComponentProps, useEffect, useRef, useState } from "react";

const EMPTY_VALUE: Value = [];

const getEditorValue = (value: unknown): Value =>
	Array.isArray(value) ? value : EMPTY_VALUE;

const serializeValue = (value: unknown) =>
	JSON.stringify(getEditorValue(value));

type IssueDescriptionEditorProps = {
	issue: Outputs["issue"]["get"];
	workspaceId: string;
	onUpdate: (
		input: Inputs["issue"]["update"],
	) => Promise<Outputs["issue"]["update"]>;
};

type DescriptionEditorProps = {
	initialValue?: unknown;
	value?: unknown;
	onChange?: (value: Value) => void;
	placeholder?: string;
	className?: string;
	editorClassName?: string;
	containerVariant?: ComponentProps<typeof EditorContainer>["variant"];
	editorVariant?: ComponentProps<typeof Editor>["variant"];
};

export function DescriptionEditor({
	initialValue,
	value,
	onChange,
	placeholder = "Describe the issue...",
	className,
	editorClassName,
	containerVariant = "default",
	editorVariant = "demo",
}: DescriptionEditorProps) {
	const isControlled = value !== undefined;
	const editor = usePlateEditor({
		plugins: [...EditorKit],
		value: getEditorValue(isControlled ? value : initialValue),
	});

	useEffect(() => {
		if (!isControlled) {
			return;
		}

		// Plate keeps its own internal document state, so when the outer value
		// changes we need to replace the editor contents to stay in sync.
		if (serializeValue(editor.children) === serializeValue(value)) {
			return;
		}

		editor.tf.replaceNodes(getEditorValue(value), {
			at: [],
			children: true,
		});
	}, [editor, isControlled, value]);

	const handleChange = ({ value }: { value: Value }) => {
		onChange?.(value);
	};

	return (
		<Plate editor={editor} onChange={handleChange}>
			<EditorContainer className={className} variant={containerVariant}>
				<Editor
					placeholder={placeholder}
					variant={editorVariant}
					className={cn("px-2!", editorClassName)}
				/>
			</EditorContainer>
		</Plate>
	);
}

export default function IssueDescriptionEditor({
	issue,
	workspaceId,
	onUpdate,
}: IssueDescriptionEditorProps) {
	const [draftValue, setDraftValue] = useState<Value>(() =>
		getEditorValue(issue.description),
	);
	const previousIssueId = useRef(issue.id);

	useEffect(() => {
		// Keep the local draft stable while saving; only reset it when the user
		// navigates to a different issue.
		if (previousIssueId.current !== issue.id) {
			previousIssueId.current = issue.id;
			setDraftValue(getEditorValue(issue.description));
		}
	}, [issue.description, issue.id]);

	// The issue detail view saves in the background, so we wrap the reusable
	// editor with a local draft and a debounced persistence layer.
	const debouncedUpdate = useDebouncedCallback(
		async (input: Inputs["issue"]["update"]) => {
			await onUpdate(input);
		},
		{ wait: 300 },
	);

	const handleChange = (value: Value) => {
		setDraftValue(value);

		if (serializeValue(value) !== serializeValue(issue.description)) {
			debouncedUpdate({
				id: issue.id,
				workspaceId,
				description: value,
			});
		}
	};

	return <DescriptionEditor value={draftValue} onChange={handleChange} />;
}
