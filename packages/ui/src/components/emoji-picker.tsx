"use client";

import { EmojiPicker as Frimousse } from "frimousse";
import type * as React from "react";

import { cn } from "@/lib/utils";

function EmojiPickerRoot({
	className,
	...props
}: React.ComponentProps<typeof Frimousse.Root>) {
	return (
		<Frimousse.Root
			data-slot="emoji-picker"
			className={cn(
				"isolate flex h-72 w-fit flex-col bg-popover text-popover-foreground",
				className,
			)}
			{...props}
		/>
	);
}

function EmojiPickerSearch({
	className,
	...props
}: React.ComponentProps<typeof Frimousse.Search>) {
	return (
		<div className="p-2">
			<Frimousse.Search
				data-slot="emoji-picker-search"
				className={cn(
					"z-10 w-full appearance-none rounded-md bg-muted px-2.5 py-2 text-sm outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring",
					className,
				)}
				{...props}
			/>
		</div>
	);
}

function EmojiPickerContent({
	className,
	...props
}: React.ComponentProps<typeof Frimousse.Viewport>) {
	return (
		<Frimousse.Viewport
			data-slot="emoji-picker-content"
			className={cn("relative flex-1 outline-hidden", className)}
			{...props}
		>
			<Frimousse.Loading className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">
				Loading…
			</Frimousse.Loading>
			<Frimousse.Empty className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">
				No emoji found.
			</Frimousse.Empty>
			<Frimousse.List
				className="select-none pb-1.5"
				components={{
					CategoryHeader: ({ category, ...rest }) => (
						<div
							className="bg-popover px-2 pt-3 pb-1.5 text-xs font-medium text-muted-foreground"
							{...rest}
						>
							{category.label}
						</div>
					),
					Row: ({ children, ...rest }) => (
						<div className="scroll-my-1.5 px-1.5" {...rest}>
							{children}
						</div>
					),
					Emoji: ({ emoji, ...rest }) => (
						<button
							type="button"
							className="flex size-8 items-center justify-center rounded-md text-lg data-[active]:bg-accent"
							{...rest}
						>
							{emoji.emoji}
						</button>
					),
				}}
			/>
		</Frimousse.Viewport>
	);
}

export {
	EmojiPickerRoot as EmojiPicker,
	EmojiPickerContent,
	EmojiPickerSearch,
};
