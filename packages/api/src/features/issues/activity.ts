import { createId } from "@paralleldrive/cuid2";
import type { db } from "db";
import { issueActivity } from "db/features/tracker/issue-activities.schema";

export type IssueActivityActionType =
	| "issue.created"
	| "issue.updated"
	| "issue.status_changed"
	| "issue.estimate_changed"
	| "issue.cycle_assigned"
	| "issue.cycle_unassigned";

export const ISSUE_ACTIVITY_ACTION_TYPES: IssueActivityActionType[] = [
	"issue.created",
	"issue.updated",
	"issue.status_changed",
	"issue.estimate_changed",
	"issue.cycle_assigned",
	"issue.cycle_unassigned",
];

type DbExecutor =
	| typeof db
	| Parameters<Parameters<typeof db.transaction>[0]>[0];

type WriteIssueActivityInput = {
	workspaceId: string;
	teamId: string;
	issueId: string;
	actorId?: string | null;
	cycleId?: string | null;
	actionType: IssueActivityActionType;
	field?: string | null;
	fromValue?: unknown;
	toValue?: unknown;
	metadata?: unknown;
};

export async function writeIssueActivity(
	executor: DbExecutor,
	input: WriteIssueActivityInput,
) {
	await executor.insert(issueActivity).values({
		id: createId(),
		workspaceId: input.workspaceId,
		teamId: input.teamId,
		issueId: input.issueId,
		actorId: input.actorId ?? null,
		cycleId: input.cycleId ?? null,
		actionType: input.actionType,
		field: input.field ?? null,
		fromValue: input.fromValue ?? null,
		toValue: input.toValue ?? null,
		metadata: input.metadata ?? null,
	});
}
