import { Select as SelectPrimitive } from "@base-ui/react/select"
import { CheckIcon, ChevronDownIcon, ChevronUpIcon, XIcon } from "lucide-react"
import * as React from "react"

import { cn } from "@/lib/utils"

const Select = SelectPrimitive.Root

const SelectGroup = SelectPrimitive.Group

const SelectValue = React.forwardRef<
	HTMLSpanElement,
	React.ComponentProps<typeof SelectPrimitive.Value> & { placeholder?: string }
>(({ placeholder, ...props }, ref) => (
	<SelectPrimitive.Value ref={ref} {...props}>
		{(value) => {
			const isEmpty =
				value === null ||
				value === undefined ||
				value === "" ||
				(Array.isArray(value) && value.length === 0)

			if (isEmpty) {
				return placeholder
			}

			if (typeof props.children === "function") {
				return props.children(value)
			}

			return props.children ?? value
		}}
	</SelectPrimitive.Value>
))
SelectValue.displayName = "AltSelectValue"

const SelectTrigger = React.forwardRef<
	HTMLButtonElement,
	React.ComponentProps<typeof SelectPrimitive.Trigger> & {
		size?: "sm" | "default"
		clearable?: boolean
		onClear?: (e: React.MouseEvent | React.KeyboardEvent) => void
	}
>(({ className, size = "default", children, clearable, onClear, ...props }, ref) => {
	const handleClear = (e: React.MouseEvent | React.KeyboardEvent) => {
		e.preventDefault()
		e.stopPropagation()
		onClear?.(e)
	}

	return (
		<SelectPrimitive.Trigger
			ref={ref}
			data-size={size}
			className={cn(
				"border-input data-[placeholder]:text-muted-foreground [&_svg:not([class*='text-'])]:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/50 aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive dark:bg-input/5 dark:hover:bg-input/50 flex w-fit items-center justify-between gap-2 rounded-md border bg-transparent px-3 py-2 text-sm whitespace-nowrap shadow-xs transition-[color,box-shadow] outline-none focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50 data-[size=default]:h-9 data-[size=sm]:h-8 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
				className,
			)}
			{...props}
		>
			{children}
			<div className="flex items-center gap-1">
				{clearable && (
					<button
						type="button"
						onPointerDown={(e) => {
							e.stopPropagation()
							e.preventDefault()
						}}
						onClick={handleClear}
						aria-label="Clear selection"
						className="flex size-4 items-center justify-center opacity-50 hover:opacity-100 cursor-pointer"
					>
						<XIcon className="size-4" />
					</button>
				)}
				<SelectPrimitive.Icon>
					<ChevronDownIcon className="size-4 opacity-50" />
				</SelectPrimitive.Icon>
			</div>
		</SelectPrimitive.Trigger>
	)
})
SelectTrigger.displayName = "AltSelectTrigger"

const SelectScrollUpButton = React.forwardRef<
	HTMLDivElement,
	React.ComponentProps<typeof SelectPrimitive.ScrollUpArrow>
>(({ className, ...props }, ref) => (
	<SelectPrimitive.ScrollUpArrow
		ref={ref}
		className={cn(
			"flex cursor-default items-center justify-center py-1",
			className,
		)}
		{...props}
	>
		<ChevronUpIcon className="size-4" />
	</SelectPrimitive.ScrollUpArrow>
))
SelectScrollUpButton.displayName = "AltSelectScrollUpButton"

const SelectScrollDownButton = React.forwardRef<
	HTMLDivElement,
	React.ComponentProps<typeof SelectPrimitive.ScrollDownArrow>
>(({ className, ...props }, ref) => (
	<SelectPrimitive.ScrollDownArrow
		ref={ref}
		className={cn(
			"flex cursor-default items-center justify-center py-1",
			className,
		)}
		{...props}
	>
		<ChevronDownIcon className="size-4" />
	</SelectPrimitive.ScrollDownArrow>
))
SelectScrollDownButton.displayName = "AltSelectScrollDownButton"

const SelectContent = React.forwardRef<
	HTMLDivElement,
	React.ComponentProps<typeof SelectPrimitive.Popup> & {
		positionerProps?: React.ComponentProps<typeof SelectPrimitive.Positioner>
		portalProps?: React.ComponentProps<typeof SelectPrimitive.Portal>
	}
>(({ className, children, positionerProps, portalProps, ...props }, ref) => (
	<SelectPrimitive.Portal {...portalProps}>
		<SelectPrimitive.Positioner
			className="outline-none z-50"
			sideOffset={4}
			alignItemWithTrigger={false}
			{...positionerProps}
		>
			<SelectPrimitive.Popup
				ref={ref}
				className={cn(
					"bg-popover text-popover-foreground relative max-h-[var(--available-height)] min-w-[var(--anchor-width)] overflow-hidden rounded-md border shadow-md",
					"data-[open]:animate-in data-[closed]:animate-out data-[closed]:fade-out-0 data-[open]:fade-in-0 data-[closed]:zoom-out-95 data-[open]:zoom-in-95",
					"data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2",
					className,
				)}
				{...props}
			>
				<SelectScrollUpButton />

				<SelectPrimitive.List className="p-1 overflow-y-auto max-h-[var(--available-height)]">
					{children}
				</SelectPrimitive.List>

				<SelectScrollDownButton />
			</SelectPrimitive.Popup>
		</SelectPrimitive.Positioner>
	</SelectPrimitive.Portal>
))
SelectContent.displayName = "AltSelectContent"

const SelectLabel = React.forwardRef<
	HTMLDivElement,
	React.ComponentProps<typeof SelectPrimitive.GroupLabel>
>(({ className, ...props }, ref) => (
	<SelectPrimitive.GroupLabel
		ref={ref}
		className={cn("text-muted-foreground px-2 py-1.5 text-xs", className)}
		{...props}
	/>
))
SelectLabel.displayName = "AltSelectLabel"

const SelectItem = React.forwardRef<
	HTMLDivElement,
	React.ComponentProps<typeof SelectPrimitive.Item>
>(({ className, children, ...props }, ref) => (
	<SelectPrimitive.Item
		ref={ref}
		className={cn(
			"relative flex w-full cursor-default items-center gap-2 rounded-sm py-1.5 pr-8 pl-2 text-sm outline-hidden select-none",
			"data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground",
			"data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
			"[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
			className,
		)}
		{...props}
	>
		<SelectPrimitive.ItemIndicator className="absolute right-2 flex size-3.5 items-center justify-center">
			<CheckIcon className="size-4" />
		</SelectPrimitive.ItemIndicator>
		<SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
	</SelectPrimitive.Item>
))
SelectItem.displayName = "AltSelectItem"

const SelectSeparator = React.forwardRef<
	HTMLDivElement,
	React.ComponentProps<typeof SelectPrimitive.Separator>
>(({ className, ...props }, ref) => (
	<SelectPrimitive.Separator
		ref={ref}
		className={cn("bg-border pointer-events-none -mx-1 my-1 h-px", className)}
		{...props}
	/>
))
SelectSeparator.displayName = "AltSelectSeparator"

export {
	Select as Select,
	SelectGroup as SelectGroup,
	SelectValue as SelectValue,
	SelectTrigger as SelectTrigger,
	SelectContent as SelectContent,
	SelectLabel as SelectLabel,
	SelectItem as SelectItem,
	SelectSeparator as SelectSeparator,
	SelectScrollUpButton as SelectScrollUpButton,
	SelectScrollDownButton as SelectScrollDownButton,
}
