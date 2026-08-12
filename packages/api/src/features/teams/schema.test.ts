import { describe, expect, it } from "bun:test";
import { teamCreateSchema, teamGetBySlugSchema } from "./schema";

describe("teamCreateSchema", () => {
	it("validates correct team creation parameters", () => {
		const input = {
			workspaceId: "cjld2cjxh0000qzrmn831i7rn",
			name: "Core Infrastructure",
			key: "INFRA",
			privacy: "private",
		};
		const parsed = teamCreateSchema.parse(input);
		expect(parsed.name).toBe("Core Infrastructure");
		expect(parsed.key).toBe("INFRA");
	});

	it("rejects team key with spaces or invalid characters", () => {
		const invalid = {
			workspaceId: "cjld2cjxh0000qzrmn831i7rn",
			name: "Core Infrastructure",
			key: "INFRA KEY!",
			privacy: "private",
		};
		expect(() => teamCreateSchema.parse(invalid)).toThrow();
	});

	it("rejects key longer than 12 characters", () => {
		const invalid = {
			workspaceId: "cjld2cjxh0000qzrmn831i7rn",
			name: "Core Infrastructure",
			key: "VERYLONGKEYNAME",
			privacy: "private",
		};
		expect(() => teamCreateSchema.parse(invalid)).toThrow();
	});

	it("rejects empty team name", () => {
		const invalid = {
			workspaceId: "cjld2cjxh0000qzrmn831i7rn",
			name: "",
			key: "ENG",
			privacy: "private",
		};
		expect(() => teamCreateSchema.parse(invalid)).toThrow();
	});
});

describe("teamGetBySlugSchema & teamDeleteSchema", () => {
	it("validates get team by slug payload", () => {
		const payload = {
			key: "ENG",
			workspaceId: "cjld2cjxh0000qzrmn831i7rn",
		};
		expect(teamGetBySlugSchema.parse(payload)).toEqual(payload);
	});
});
