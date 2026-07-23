import { describe, expect, test } from "bun:test";
import { redactErrorSummary } from "./cycles-worker-errors";

describe("cycle worker error redaction", () => {
	test("redacts SQL, DSNs, credentials, and tokens", () => {
		const result = redactErrorSummary(
			new Error(
				"password=supersecret postgres://user:pass@example.test/db SELECT * FROM users; Authorization: Bearer abc123 token=xyz",
			),
		);
		expect(result).not.toContain("supersecret");
		expect(result).not.toContain("postgres://");
		expect(result).not.toContain("SELECT *");
		expect(result).not.toContain("abc123");
		expect(result).not.toContain("xyz");
	});

	test("normalizes and bounds summaries", () => {
		const result = redactErrorSummary(`code=DB_FAILURE   ${"x".repeat(1000)}`);
		expect(result.length).toBe(512);
		expect(result).toContain("code=DB_FAILURE");
	});
});
