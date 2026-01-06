import {
	generateEvenlySpacedRanks,
	needsRebalancing,
} from "@prism/api/src/utils/lexorank";
import { db } from "db";
import { issue } from "db/features/tracker/issues.schema";
import { eq } from "drizzle-orm";

/**
 * Rebalances issues in a single status column.
 * Generates evenly spaced ranks to prevent exhaustion.
 *
 * @param statusId - The status to rebalance
 * @returns Number of issues rebalanced
 */
export async function rebalanceStatusIssues(statusId: string): Promise<number> {
	const statusIssues = await db
		.select()
		.from(issue)
		.where(eq(issue.statusId, statusId))
		.orderBy(issue.sortOrder);

	if (statusIssues.length === 0) return 0;

	const ranks = statusIssues.map((i) => i.sortOrder);

	if (!needsRebalancing(ranks)) {
		return 0;
	}

	const newRanks = generateEvenlySpacedRanks(statusIssues.length, "a00", 1000);

	await db.transaction(async (tx) => {
		for (let i = 0; i < statusIssues.length; i++) {
			const issueItem = statusIssues[i];
			if (!issueItem) continue;

			await tx
				.update(issue)
				.set({ sortOrder: newRanks[i] })
				.where(eq(issue.id, issueItem.id));
		}
	});

	return statusIssues.length;
}
