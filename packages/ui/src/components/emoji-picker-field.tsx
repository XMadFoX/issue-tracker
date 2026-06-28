"use client";

import { useState } from "react";

import { Button } from "./button";
import {
	EmojiPicker,
	EmojiPickerContent,
	EmojiPickerSearch,
} from "./emoji-picker";
import { Label } from "./label";
import { Popover, PopoverContent, PopoverTrigger } from "./popover";
import { cn } from "../lib/utils";

type EmojiPickerFieldProps = {
	value: string;
	onChange: (emoji: string) => void;
	label?: string;
	className?: string;
};

export function EmojiPickerField({
	value,
	onChange,
	label = "Icon",
	className,
}: EmojiPickerFieldProps) {
	const [open, setOpen] = useState(false);

	return (
		<div className={cn("space-y-3", className)}>
			{label ? <Label>{label}</Label> : null}
			<Popover open={open} onOpenChange={setOpen}>
				<PopoverTrigger
					render={
						<Button
							type="button"
							variant="outline"
							size="icon"
							className="size-9 shrink-0 text-lg"
							aria-label="Select icon"
						>
							{value || "🙂"}
						</Button>
					}
				/>
				<PopoverContent className="w-fit p-0">
					<EmojiPicker
						onEmojiSelect={({ emoji }) => {
							onChange(emoji);
							setOpen(false);
						}}
					>
						<EmojiPickerSearch />
						<EmojiPickerContent />
					</EmojiPicker>
				</PopoverContent>
			</Popover>
		</div>
	);
}
