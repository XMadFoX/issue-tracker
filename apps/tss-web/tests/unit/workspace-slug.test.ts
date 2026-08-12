import { describe, expect, test } from "vitest";

function slugifyWorkspaceName(name: string): string {
	return name
		.toLowerCase()
		.trim()
		.replace(/[^a-z0-9\s-]/g, "")
		.replace(/[\s_]+/g, "-")
		.replace(/^-+|-+$/g, "");
}

describe("slugifyWorkspaceName", () => {
	test("converts workspace name into valid URL slug", () => {
		expect(slugifyWorkspaceName("Acme Corp")).toBe("acme-corp");
		expect(slugifyWorkspaceName("  Product & Design Team  ")).toBe(
			"product-design-team",
		);
		expect(slugifyWorkspaceName("Engineering 2026!!!")).toBe(
			"engineering-2026",
		);
	});

	test("handles already valid slugs", () => {
		expect(slugifyWorkspaceName("my-workspace")).toBe("my-workspace");
	});
});
