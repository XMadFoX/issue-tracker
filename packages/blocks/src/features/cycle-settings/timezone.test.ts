import { describe, expect, test } from "bun:test";
import { instantToLocalDateTime, localDateTimeToInstant } from "./timezone";

describe("cycle settings timezone conversion", () => {
	test("round-trips a workspace wall time independently of browser timezone", () => {
		const instant = localDateTimeToInstant(
			"2026-01-15T09:30",
			"America/New_York",
		);
		expect(instant).toBe("2026-01-15T14:30:00Z");
		expect(instantToLocalDateTime(instant, "America/New_York")).toBe(
			"2026-01-15T09:30",
		);
	});

	test("uses Temporal compatible disambiguation for a spring gap", () => {
		const instant = localDateTimeToInstant(
			"2026-03-08T02:30",
			"America/New_York",
		);
		expect(instant).toBe("2026-03-08T07:30:00Z");
		expect(instantToLocalDateTime(instant, "America/New_York")).toBe(
			"2026-03-08T03:30",
		);
	});

	test("uses the earlier instant for a fall fold", () => {
		expect(localDateTimeToInstant("2026-11-01T01:30", "America/New_York")).toBe(
			"2026-11-01T05:30:00Z",
		);
	});

	test("keeps an empty anchor null and invalid values safe", () => {
		expect(localDateTimeToInstant("", "UTC")).toBeNull();
		expect(localDateTimeToInstant("not-a-date", "UTC")).toBeNull();
		expect(instantToLocalDateTime("not-an-instant", "UTC")).toBe("");
	});
});
