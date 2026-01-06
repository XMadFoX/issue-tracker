/**
 * LexoRank Utilities
 *
 * Implements a base-36 string-based ranking algorithm for efficient issue ordering.
 * Uses variable-length strings (6-10 chars) to provide a vast range while keeping strings compact.
 *
 * Key properties:
 * - Base-36 encoding (0-9, a-z)
 * - Variable length (expands as needed: "a00" → "a00a00" → ...)
 * - Gap-based insertion to minimize rebalancing
 * - Supports rebalancing when ranks become too tight
 */

/**
 * Converts a custom rank string to a number.
 * Format: letter (a-z) + two digits (00-99)
 * Examples: "a00" = 0, "a01" = 1, "a99" = 99, "b00" = 100, "z99" = 2599
 * @param rank - The custom rank string (e.g., "a00", "z99")
 * @returns The numeric value
 */
export function rankToNumber(rank: string): number {
	const letter = rank.charCodeAt(0) - 97; // 'a' = 97
	const tens = Number.parseInt(rank[1] ?? "0", 10);
	const ones = Number.parseInt(rank[2] ?? "0", 10);
	return letter * 100 + tens * 10 + ones;
}

/**
 * Converts a number to a custom rank string.
 * Format: letter (a-z) + two digits (00-99)
 * @param num - The numeric value
 * @returns The custom rank string
 */
export function numberToRank(num: number): string {
	const letter = String.fromCharCode(97 + Math.floor(num / 100)); // 97 = 'a'
	const remainder = num % 100;
	const tens = Math.floor(remainder / 10);
	const ones = remainder % 10;
	return `${letter}${tens}${ones}`;
}

/**
 * Calculates a rank that falls between two existing ranks.
 * @param before - Rank string before the insertion point
 * @param after - Rank string after the insertion point
 * @returns A rank string that sorts between before and after
 * @throws {Error} If no valid rank can be calculated (rank exhausted)
 */
export function calculateMiddleRank(before: string, after: string): string {
	const beforeNum = rankToNumber(before);
	const afterNum = rankToNumber(after);

	// Calculate midpoint
	const middle = Math.floor((beforeNum + afterNum) / 2);

	// If no space between ranks, rebalance is needed
	if (middle <= beforeNum) {
		throw new Error("RANK_EXHAUSTED: No space between ranks");
	}

	return numberToRank(middle);
}

/**
 * Calculates a rank before the first item (for moving to top).
 * @param first - The first rank string
 * @param gap - Gap size to use (default: 100)
 * @returns A rank string before the first item
 */
export function calculateBeforeRank(first: string, gap = 100): string {
	const firstNum = rankToNumber(first);
	const newNum = Math.max(0, firstNum - gap);
	return numberToRank(newNum);
}

/**
 * Calculates a rank after the last item (for appending to bottom).
 * @param last - The last rank string
 * @param gap - Gap size to use (default: 100)
 * @returns A rank string after the last item
 */
export function calculateAfterRank(last: string, gap = 100): string {
	const lastNum = rankToNumber(last);
	const newNum = Math.min(lastNum + gap, 2599); // Max value is 'z99'
	return numberToRank(newNum);
}

/**
 * Checks if ranks in a sequence are too tight and need rebalancing.
 * Returns true if any adjacent gap is below the threshold.
 *
 * @param ranks - Array of rank strings sorted in ascending order
 * @param threshold - Minimum acceptable gap (default: 100)
 * @returns True if rebalancing is needed
 */
export function needsRebalancing(ranks: string[], threshold = 100): boolean {
	if (ranks.length < 2) return false;

	for (let i = 0; i < ranks.length - 1; i++) {
		const current = rankToNumber(ranks[i]);
		const next = rankToNumber(ranks[i + 1]);
		const gap = next - current;

		if (gap < threshold) {
			return true;
		}
	}

	return false;
}

/**
 * Generates evenly spaced ranks for rebalancing.
 * @param count - Number of ranks to generate
 * @param startRank - Starting rank string (or "a00" if not provided)
 * @param gap - Gap between ranks (default: 10000)
 * @returns Array of evenly spaced rank strings
 */
export function generateEvenlySpacedRanks(
	count: number,
	startRank = "a00",
	gap = 10000,
): string[] {
	const startNum = rankToNumber(startRank);
	const ranks: string[] = [];

	for (let i = 0; i < count; i++) {
		const newNum = startNum + i * gap;
		ranks.push(numberToRank(newNum));
	}

	return ranks;
}

/**
 * Calculates the initial rank for a new issue in an empty status.
 * @returns The initial rank string ("a00")
 */
export function getInitialRank(): string {
	return "a00";
}
