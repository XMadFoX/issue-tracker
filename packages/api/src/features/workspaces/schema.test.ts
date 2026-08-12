import { describe, expect, it } from "bun:test";
import {
	workspaceCreateSchema,
	workspaceGetBySlugSchema,
	workspaceUpdateSchema,
} from "./schema";

describe("workspaceCreateSchema", () => {
	it("validates valid workspace creation payload", () => {
		const input = {
			name: "Acme Product",
			slug: "acme-product",
			timezone: "UTC",
		};
		const parsed = workspaceCreateSchema.parse(input);
		expect(parsed.name).toBe("Acme Product");
		expect(parsed.slug).toBe("acme-product");
	});

	it("rejects slug with uppercase letters or invalid characters", () => {
		const invalid = {
			name: "Acme Product",
			slug: "Acme_Product!",
			timezone: "UTC",
		};
		expect(() => workspaceCreateSchema.parse(invalid)).toThrow();
	});

	it("rejects empty workspace name", () => {
		const invalid = {
			name: "",
			slug: "acme",
			timezone: "UTC",
		};
		expect(() => workspaceCreateSchema.parse(invalid)).toThrow();
	});
});

describe("workspaceGetBySlugSchema", () => {
	it("validates get by slug", () => {
		const payload = { slug: "engineering-dept" };
		expect(workspaceGetBySlugSchema.parse(payload)).toEqual(payload);
	});
});

describe("workspaceUpdateSchema", () => {
	it("requires workspace id for updates", () => {
		const valid = { id: "cjld2cjxh0000qzrmn831i7rn", name: "New Name" };
		expect(workspaceUpdateSchema.parse(valid)).toEqual(valid);

		const invalid = { name: "New Name" };
		expect(() => workspaceUpdateSchema.parse(invalid)).toThrow();
	});
});
