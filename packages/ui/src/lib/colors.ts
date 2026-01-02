import Color from "color";

export const PRESET_COLORS = [
	"#EF4444",
	"#F97316",
	"#EAB308",
	"#22C55E",
	"#06B6D4",
	"#0EA5E9",
	"#6366F1",
	"#8B5CF6",
	"#D946EF",
	"#EC4899",
	"#64748B",
] as const;

export function generateRandomColor(): string {
	return Color({
		r: Math.floor(Math.random() * 255),
		g: Math.floor(Math.random() * 255),
		b: Math.floor(Math.random() * 255),
	}).hex();
}
