import { Button } from "./button";
import ColorPicker from "./color-picker";
import { Label } from "./label";
import { cn } from "../lib/utils";
import { Pipette, RefreshCcw } from "lucide-react";
import { PRESET_COLORS, generateRandomColor } from "../lib/colors";

type ColorPickerFieldProps = {
	value: string;
	onChange: (color: string) => void;
	className?: string;
};

export function ColorPickerField({ value, onChange, className }: ColorPickerFieldProps) {
	return (
		<div className={cn("space-y-3", className)}>
			<Label>Color</Label>
			<div className="flex w-full items-center gap-3">
				<ColorPicker
					className="shrink-0"
					value={value ?? "#000000"}
					onChange={onChange}
					showControls={false}
					trigger={
						<Button
							type="button"
							variant="outline"
							size="icon"
							className="size-8 shrink-0 rounded-full border-border relative overflow-hidden"
							style={{ backgroundColor: value ?? "#000000" }}
						>
							<Pipette className="absolute inset-0 m-auto size-4 text-white drop-shadow-md" />
						</Button>
					}
				/>
				<Button
					type="button"
					size="icon"
					className="size-8 shrink-0 rounded-full"
					onClick={() => onChange(generateRandomColor())}
				>
					<RefreshCcw className="size-4" />
				</Button>
				<div className="h-8 w-px shrink-0 bg-border/50" />
				<div className="flex min-w-0 flex-1 gap-2 overflow-x-auto">
					{PRESET_COLORS.map((color) => (
						<button
							key={color}
							type="button"
							className={cn(
								"size-8 shrink-0 rounded-full border-2 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
								(value ?? "#000000") === color
									? "border-red-500"
									: "border-transparent",
							)}
							style={{ backgroundColor: color }}
							onClick={() => onChange(color)}
						/>
					))}
				</div>
			</div>
		</div>
	);
}
