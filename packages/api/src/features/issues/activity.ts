import { createId } from "@paralleldrive/cuid2";
import type { db } from "db";
import {
	issueActivity,
	issueActivityActionTypeEnum,
} from "db/features/tracker/issue-activities.schema";

export const ISSUE_ACTIVITY_ACTION_TYPES =
	issueActivityActionTypeEnum.enumValues;

export type IssueActivityActionType =
	(typeof ISSUE_ACTIVITY_ACTION_TYPES)[number];

type DbExecutor =
	| typeof db
	| Parameters<Parameters<typeof db.transaction>[0]>[0];

type WriteIssueActivityInput = Omit<
	typeof issueActivity.$inferInsert,
	"createdAt" | "id"
>;

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
