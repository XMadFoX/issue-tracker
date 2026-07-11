import { describe, expect, test } from "bun:test";
import { cycleCompleteSchema } from "./schema";

const workspaceId = "abcdefghijklmnopqrstuv";
const cycleId = "bcdefghijklmnopqrstuvw";
const targetCycleId = "cdefghijklmnopqrstuvwx";

describe("cycleCompleteSchema", () => {
	test("accepts an explicit carry-over target", () => {
		expect(
			cycleCompleteSchema.parse({
				workspaceId,
				cycleId,
				disposition: { type: "carryOver", targetCycleId },
			}),
		).toEqual({
			workspaceId,
			cycleId,
			disposition: { type: "carryOver", targetCycleId },
		});
	});

	test("accepts moving eligible work to backlog without a target", () => {
		expect(
			cycleCompleteSchema.parse({
				workspaceId,
				cycleId,
				disposition: { type: "moveToBacklog" },
			}),
		).toEqual({
			workspaceId,
			cycleId,
			disposition: { type: "moveToBacklog" },
		});
	});

	test("rejects implicit carry-over and unknown dispositions", () => {
		expect(
			cycleCompleteSchema.safeParse({
				workspaceId,
				cycleId,
				disposition: { type: "carryOver" },
			}).success,
		).toBeFalse();
		expect(
			cycleCompleteSchema.safeParse({
				workspaceId,
				cycleId,
				disposition: { type: "keep" },
			}).success,
		).toBeFalse();
	});
});
