import { z } from "zod";

export function isValidIanaTimezone(timezone: string): boolean {
	try {
		new Intl.DateTimeFormat("en-US", { timeZone: timezone });
		return true;
	} catch {
		return false;
	}
}

export const ianaTimezoneSchema = z
	.string()
	.min(1)
	.refine(isValidIanaTimezone, "Invalid timezone");
