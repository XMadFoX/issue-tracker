import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
	return twMerge(clsx(inputs));
}

export type RelativeTimeInput = Date | string | number;

export function getRelativeTime(
	date: RelativeTimeInput,
	locale: string = "en",
): string {
	const now = new Date();
	const target = new Date(date);
	const diffInSeconds = Math.round((target.getTime() - now.getTime()) / 1000);

	const absDiff = Math.abs(diffInSeconds);

	if (absDiff < 60) {
		return diffInSeconds < 0
			? "less than a minute ago"
			: "in less than a minute";
	}

	const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });

	const units: Array<[number, Intl.RelativeTimeFormatUnit]> = [
		[31536000, "year"],
		[2592000, "month"],
		[86400, "day"],
		[3600, "hour"],
		[60, "minute"],
	];

	for (const [threshold, unit] of units) {
		if (absDiff >= threshold) {
			const value = Math.round(diffInSeconds / threshold);
			return rtf.format(value, unit);
		}
	}

	return rtf.format(Math.round(diffInSeconds), "second");
}
