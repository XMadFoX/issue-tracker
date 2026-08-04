import { Temporal } from "@js-temporal/polyfill";

export function localDateTimeToInstant(
	value: string,
	timezone: string,
): string | null {
	if (!value) return null;
	try {
		const plain = Temporal.PlainDateTime.from(value);
		return plain
			.toZonedDateTime(timezone, { disambiguation: "compatible" })
			.toInstant()
			.toString();
	} catch {
		return null;
	}
}

export function instantToLocalDateTime(
	value: string | Date | null,
	timezone: string,
): string {
	if (!value) return "";
	try {
		const instant = Temporal.Instant.from(
			typeof value === "string" ? value : value.toISOString(),
		);
		return instant
			.toZonedDateTimeISO(timezone)
			.toPlainDateTime()
			.toString({ smallestUnit: "minute" })
			.slice(0, 16);
	} catch {
		return "";
	}
}
