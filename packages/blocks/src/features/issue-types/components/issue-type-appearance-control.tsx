"use client";

import ColorPicker from "@prism/ui/components/color-picker";
import {
	EmojiPicker,
	EmojiPickerContent,
	EmojiPickerSearch,
} from "@prism/ui/components/emoji-picker";
import { Label } from "@prism/ui/components/label";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@prism/ui/components/popover";
import { cn } from "@prism/ui/lib/utils";
import { useState } from "react";

const DEFAULT_COLOR = "#6B7280";

type Props = {
	icon: string;
	color: string | null;
	disabled?: boolean;
	onIconChange: (icon: string) => void;
	onColorChange: (color: string) => void;
};

/**
 * Single "type identity" control combining the emoji and color into one tile.
 * The emoji sits on a tile tinted/ringed with the selected color; clicking the
 * tile opens an appearance popover with both the emoji and color controls.
 */
export function IssueTypeAppearanceControl({
	icon,
	color,
	disabled = false,
	onIconChange,
	onColorChange,
}: Props) {
	const [open, setOpen] = useState(false);
	const tileColor = color ?? DEFAULT_COLOR;

	const tile = (
		<button
			type="button"
			disabled={disabled}
			aria-label="Edit appearance"
			title={disabled ? undefined : "Edit appearance"}
			className={cn(
				"flex size-9 shrink-0 items-center justify-center rounded-md border text-lg leading-none transition-colors",
				disabled ? "cursor-default" : "cursor-pointer hover:brightness-95",
			)}
			style={{
				backgroundColor: `${tileColor}1A`,
				borderColor: `${tileColor}66`,
			}}
		>
			{icon || "🙂"}
		</button>
	);

	if (disabled) {
		return tile;
	}

	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger render={tile} />
			<PopoverContent align="start" className="w-fit space-y-3 p-3">
				<div className="space-y-2">
					<Label className="text-xs text-muted-foreground">Color</Label>
					<ColorPicker
						value={tileColor}
						onChange={onColorChange}
						showControls={false}
						trigger={
							<button
								type="button"
								aria-label="Edit color"
								className="flex items-center gap-2 rounded-md border px-2 py-1.5 text-sm hover:bg-muted"
							>
								<span
									className="size-4 rounded-full border"
									style={{ backgroundColor: tileColor }}
								/>
								<span className="font-mono uppercase">{tileColor}</span>
							</button>
						}
					/>
				</div>
				<div className="space-y-2">
					<Label className="text-xs text-muted-foreground">Emoji</Label>
					<div className="overflow-hidden rounded-md border">
						<EmojiPicker
							onEmojiSelect={({ emoji }) => {
								onIconChange(emoji);
								setOpen(false);
							}}
						>
							<EmojiPickerSearch />
							<EmojiPickerContent />
						</EmojiPicker>
					</div>
				</div>
			</PopoverContent>
		</Popover>
	);
}
