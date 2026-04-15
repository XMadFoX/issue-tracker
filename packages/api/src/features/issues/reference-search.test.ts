import { describe, expect, it } from "bun:test";
import { parseIssueReferenceSearch } from "./reference-search";

const teams = [
	{ id: "team-def", key: "DEF" },
	{ id: "team-qa", key: "QA" },
	{ id: "team-hyphen", key: "OPS-API" },
	{ id: "team-digit", key: "DEF1" },
];

describe("parseIssueReferenceSearch", () => {
	it("parses bare issue numbers", () => {
		expect(parseIssueReferenceSearch("123", teams)).toEqual({
			kind: "number",
			number: 123,
		});
	});

	it("parses team-qualified references with a dash", () => {
		expect(parseIssueReferenceSearch("DEF-123", teams)).toEqual({
			kind: "teamNumber",
			candidates: [{ teamId: "team-def", number: 123 }],
		});
	});

	it("matches team keys case-insensitively", () => {
		expect(parseIssueReferenceSearch("def-123", teams)).toEqual({
			kind: "teamNumber",
			candidates: [{ teamId: "team-def", number: 123 }],
		});
	});

	it("parses team keys containing hyphens", () => {
		expect(parseIssueReferenceSearch("OPS-API-9", teams)).toEqual({
			kind: "teamNumber",
			candidates: [{ teamId: "team-hyphen", number: 9 }],
		});
	});

	it("parses compact references by matching team key prefixes", () => {
		expect(parseIssueReferenceSearch("QA7", teams)).toEqual({
			kind: "teamNumber",
			candidates: [{ teamId: "team-qa", number: 7 }],
		});
	});

	it("returns all compact candidates for ambiguous team key prefixes", () => {
		expect(parseIssueReferenceSearch("DEF123", teams)).toEqual({
			kind: "teamNumber",
			candidates: [
				{ teamId: "team-def", number: 123 },
				{ teamId: "team-digit", number: 23 },
			],
		});
	});

	it("does not parse dashed references when the team key is unknown", () => {
		expect(parseIssueReferenceSearch("ABC-123", teams)).toBeNull();
	});

	it("does not parse ordinary text", () => {
		expect(parseIssueReferenceSearch("dashboard bug", teams)).toBeNull();
	});
});
