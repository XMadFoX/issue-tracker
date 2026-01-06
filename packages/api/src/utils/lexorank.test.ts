import {
	calculateAfterRank,
	calculateBeforeRank,
	calculateMiddleRank,
	generateEvenlySpacedRanks,
	getInitialRank,
	needsRebalancing,
	numberToRank,
	rankToNumber,
} from "../utils/lexorank";

describe("rankToNumber", () => {
	it("converts custom rank string to number", () => {
		expect(rankToNumber("a00")).toBe(0);
		expect(rankToNumber("a01")).toBe(1);
		expect(rankToNumber("a99")).toBe(99);
		expect(rankToNumber("b00")).toBe(100);
		expect(rankToNumber("z99")).toBe(2599);
	});
});

describe("numberToRank", () => {
	it("converts number to custom rank string", () => {
		expect(numberToRank(0)).toBe("a00");
		expect(numberToRank(1)).toBe("a01");
		expect(numberToRank(99)).toBe("a99");
		expect(numberToRank(100)).toBe("b00");
		expect(numberToRank(2599)).toBe("z99");
	});
});

describe("calculateMiddleRank", () => {
	it("calculates rank between two values", () => {
		expect(calculateMiddleRank("a00", "a02")).toBe("a01");
		expect(calculateMiddleRank("a00", "a10")).toBe("a05");
		expect(calculateMiddleRank("a50", "a52")).toBe("a51");
	});

	it("throws when ranks are too close", () => {
		expect(() => calculateMiddleRank("a00", "a01")).toThrow(
			"RANK_EXHAUSTED: No space between ranks",
		);
		expect(() => calculateMiddleRank("a50", "a51")).toThrow(
			"RANK_EXHAUSTED: No space between ranks",
		);
	});
});

describe("calculateBeforeRank", () => {
	it("calculates rank before first item", () => {
		expect(calculateBeforeRank("a50")).toBe("a00");
		expect(calculateBeforeRank("a10")).toBe("a00");
		expect(calculateBeforeRank("a05")).toBe("a00");
	});

	it("respects negative bounds", () => {
		expect(calculateBeforeRank("a05")).toBe("a00");
	});
});

describe("calculateAfterRank", () => {
	it("calculates rank after last item", () => {
		expect(calculateAfterRank("a00")).toBe("b00");
		expect(calculateAfterRank("a50")).toBe("b50");
		expect(calculateAfterRank("z90")).toBe("z99");
	});
});

describe("needsRebalancing", () => {
	it("returns false for empty or single-item arrays", () => {
		expect(needsRebalancing([])).toBe(false);
		expect(needsRebalancing(["a00"])).toBe(false);
	});

	it("returns false for ranks with adequate gaps", () => {
		expect(needsRebalancing(["a00", "b00"])).toBe(false);
		expect(needsRebalancing(["a00", "b00", "c00"])).toBe(false);
	});

	it("returns true when gaps are below threshold", () => {
		expect(needsRebalancing(["a00", "a01"])).toBe(true);
		expect(needsRebalancing(["a00", "b00", "b01"])).toBe(true);
	});

	it("uses custom threshold", () => {
		expect(needsRebalancing(["a00", "b00"], 100)).toBe(false);
		expect(needsRebalancing(["a00", "b00"], 200)).toBe(true);
	});
});

describe("generateEvenlySpacedRanks", () => {
	it("generates evenly spaced ranks", () => {
		const ranks = generateEvenlySpacedRanks(3, "a00", 50);
		expect(ranks).toEqual(["a00", "a50", "b00"]);
	});

	it("uses default start rank and gap", () => {
		const ranks = generateEvenlySpacedRanks(2);
		expect(ranks).toEqual(["a00", "Å00"]);
	});

	it("generates correct count", () => {
		expect(generateEvenlySpacedRanks(5).length).toBe(5);
		expect(generateEvenlySpacedRanks(0).length).toBe(0);
	});
});

describe("getInitialRank", () => {
	it("returns initial rank for empty status", () => {
		expect(getInitialRank()).toBe("a00");
	});
});
