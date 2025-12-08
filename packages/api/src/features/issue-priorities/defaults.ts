import { createId } from "@paralleldrive/cuid2";
import type { issuePriority } from "db/features/tracker/issue-priorities.schema";

export type IssuePriorityInsert = typeof issuePriority.$inferInsert;

type DefaultPrioritySeed = Pick<
	IssuePriorityInsert,
	"name" | "rank" | "color" | "description"
>;

export const DEFAULT_ISSUE_PRIORITIES: readonly DefaultPrioritySeed[] = [
	{
		name: "Urgent",
		rank: 0,
		color: "#EF4444",
		description: "Critical issues that block progress or affect many users.",
	},
	{
		name: "High",
		rank: 1,
		color: "#F59E0B",
		description: "High impact issues.",
	},
	{
		name: "Medium",
		rank: 2,
		color: "#6B7280",
		description: "Standard issues.",
	},
	{
		name: "Low",
		rank: 3,
		color: "#10B981",
		description: "Low impact or nice-to-haves.",
	},
] as const;

export const buildDefaultIssuePrioritySeed = (workspaceId: string) => {
	const priorities: IssuePriorityInsert[] = [];

	DEFAULT_ISSUE_PRIORITIES.forEach((priority) => {
		priorities.push({
			id: createId(),
			workspaceId,
			name: priority.name,
			rank: priority.rank,
			color: priority.color,
			description: priority.description ?? null,
		});
	});

	return { priorities };
};
