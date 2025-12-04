import { createId } from "@paralleldrive/cuid2";
import type {
	issueStatus,
	issueStatusGroup,
} from "db/features/tracker/issue-statuses.schema";

export type IssueStatusGroupInsert = typeof issueStatusGroup.$inferInsert;
export type IssueStatusInsert = typeof issueStatus.$inferInsert;

type DefaultStatusSeed = Pick<
	IssueStatusInsert,
	"name" | "color" | "description"
>;

type DefaultGroupSeed = Omit<
	IssueStatusGroupInsert,
	"id" | "workspaceId" | "orderIndex"
> & {
	statuses: DefaultStatusSeed[];
};

export const DEFAULT_ISSUE_STATUS_GROUPS: readonly DefaultGroupSeed[] = [
	{
		key: "backlog",
		name: "Backlog",
		canonicalCategory: "backlog",
		description: "Incoming ideas or requests that have not been prioritized.",
		statuses: [
			{
				name: "Backlog",
				color: "#6B7280",
				description: "Untriaged issues awaiting refinement.",
			},
		],
	},
	{
		key: "planned",
		name: "Planned",
		canonicalCategory: "planned",
		description: "Prioritized work that is ready to be scheduled.",
		statuses: [
			{
				name: "Ready",
				color: "#3B82F6",
				description: "Groomed work items ready for kickoff.",
			},
		],
	},
	{
		key: "in_progress",
		name: "In Progress",
		canonicalCategory: "in_progress",
		description: "Active delivery work that is currently being executed.",
		statuses: [
			{
				name: "In Progress",
				color: "#F59E0B",
				description: "Engineers are currently developing the solution.",
			},
			{
				name: "Review",
				color: "#8B5CF6",
				description: "Awaiting code review, QA, or stakeholder feedback.",
			},
		],
	},
	{
		key: "completed",
		name: "Completed",
		canonicalCategory: "completed",
		description: "Work that has shipped or is ready to deploy.",
		statuses: [
			{
				name: "Done",
				color: "#10B981",
				description: "Fully delivered and released to customers.",
			},
		],
	},
	{
		key: "canceled",
		name: "Canceled",
		canonicalCategory: "canceled",
		description: "Items that will not continue through the delivery process.",
		statuses: [
			{
				name: "Canceled",
				color: "#EF4444",
				description: "Work stopped due to deprioritization or invalidation.",
			},
		],
	},
] as const;

export const buildDefaultIssueStatusSeed = (workspaceId: string) => {
	const groups: IssueStatusGroupInsert[] = [];
	const statuses: IssueStatusInsert[] = [];

	DEFAULT_ISSUE_STATUS_GROUPS.forEach((group, groupIndex) => {
		const groupId = createId();
		groups.push({
			id: groupId,
			workspaceId,
			key: group.key,
			name: group.name,
			canonicalCategory: group.canonicalCategory,
			description: group.description ?? null,
			orderIndex: groupIndex + 1,
			isEditable: false,
		});

		group.statuses.forEach((status, statusIndex) => {
			statuses.push({
				id: createId(),
				workspaceId,
				teamId: null,
				statusGroupId: groupId,
				name: status.name,
				color: status.color,
				description: status.description ?? null,
				orderIndex: statusIndex + 1,
			});
		});
	});

	return { groups, statuses };
};
