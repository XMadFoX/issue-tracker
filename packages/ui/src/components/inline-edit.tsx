import { Pencil, X } from "lucide-react";
import type React from "react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/button";
import { Input } from "@/components/input";
import { Textarea } from "@/components/textarea";
import { cn } from "@/lib/utils";

interface InlineEditProps {
	value: string;
	onSave: (val: string) => void;
	multiline?: boolean;
	placeholder?: string;
	className?: string;
}

export function InlineEdit({
	value,
	onSave,
	multiline = false,
	placeholder = "Click to edit",
	className,
}: InlineEditProps) {
	const [isEditing, setIsEditing] = useState(false);
	const [editValue, setEditValue] = useState(value);
	const ref = useRef<HTMLInputElement | HTMLTextAreaElement>(null);

	useEffect(() => {
		if (isEditing && ref.current) {
			ref.current.focus();
			const length = ref.current.value.length;
			ref.current.setSelectionRange(length, length);
		}
	}, [isEditing]);

	const handleSave = () => {
		if (editValue.trim()) {
			onSave(editValue);
		} else {
			setEditValue(value);
		}
		setIsEditing(false);
	};

	const handleCancel = () => {
		setEditValue(value);
		setIsEditing(false);
	};

	if (!isEditing) {
		return (
			<button
				className={cn(
					"group relative flex items-center gap-2 cursor-pointer hover:opacity-80 bg-transparent border-0 p-0 text-left",
					className,
				)}
				onClick={() => setIsEditing(true)}
				type="button"
			>
				{value || <span className="text-muted-foreground">{placeholder}</span>}
				{!value && (
					<Pencil className="size-3 opacity-0 group-hover:opacity-100" />
				)}
			</button>
		);
	}

	return (
		<div className="flex items-center gap-1">
			{multiline ? (
				<Textarea
					ref={ref as React.RefObject<HTMLTextAreaElement>}
					value={editValue}
					onChange={(e) => setEditValue(e.target.value)}
					onBlur={handleSave}
					onKeyDown={(e) => {
						if (e.key === "Enter" && !e.shiftKey) {
							e.preventDefault();
							handleSave();
						}
						if (e.key === "Escape") handleCancel();
					}}
					className="min-h-[60px] resize-none"
				/>
			) : (
				<Input
					ref={ref as React.RefObject<HTMLInputElement>}
					value={editValue}
					onChange={(e) => setEditValue(e.target.value)}
					onBlur={handleSave}
					onKeyDown={(e) => {
						if (e.key === "Enter") handleSave();
						if (e.key === "Escape") handleCancel();
					}}
					className="h-7 px-2 py-0 text-sm"
				/>
			)}
			<Button
				variant="ghost"
				size="icon-sm"
				onClick={(e) => {
					e.stopPropagation();
					handleCancel();
				}}
			>
				<X className="size-3" />
			</Button>
		</div>
	);
}
