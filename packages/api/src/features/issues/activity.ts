import { createId } from "@paralleldrive/cuid2";
import type { db } from "db";
import {
	issueActivity,
	issueActivityActionTypeEnum,
} from "db/features/tracker/issue-activities.schema";
import type { canonicalCategoryEnum } from "db/features/tracker/issue-statuses.schema";
import type { issue } from "db/features/tracker/issues.schema";

export const ISSUE_ACTIVITY_ACTION_TYPES = Object.freeze([
	...issueActivityActionTypeEnum.enumValues,
]);

export type IssueActivityActionType =
	(typeof issueActivity.$inferSelect)["actionType"];

export type DbExecutor =
	| typeof db
	| Parameters<Parameters<typeof db.transaction>[0]>[0];

type IssueRecord = typeof issue.$inferSelect;
type IssueActivityInsert = typeof issueActivity.$inferInsert;
type IssueStatusCanonicalCategory =
	(typeof canonicalCategoryEnum.enumValues)[number];

type IssueActivityBaseInput = Pick<
	IssueActivityInsert,
	"actorId" | "issueId" | "teamId" | "workspaceId"
>;

type IssueActivityPayloadColumns = Pick<
	IssueActivityInsert,
	"cycleId" | "field" | "fromValue" | "metadata" | "toValue"
>;

type ActivityInput<
	Action extends IssueActivityActionType,
	Payload extends Partial<IssueActivityPayloadColumns>,
> = IssueActivityBaseInput & {
	actionType: Action;
} & Payload;

type CycleId = IssueRecord["cycleId"];
type ActiveCycleId = NonNullable<CycleId>;

type CurrentCycle<Current extends CycleId = CycleId> = {
	cycleId: Current;
};

type NoFieldChange = {
	field?: null;
	fromValue?: null;
	toValue?: null;
};

type NoMetadata = {
	metadata?: never;
};

type FieldChange<
	Field extends keyof IssueRecord & string,
	From = IssueRecord[Field],
	To = IssueRecord[Field],
> = {
	field: Field;
	fromValue: From;
	toValue: To;
};

type IssueCreatedActivity = ActivityInput<
	"issue.created",
	CurrentCycle &
		NoFieldChange & {
			metadata: Pick<IssueRecord, "cycleId" | "estimate" | "statusId">;
		}
>;

type IssueUpdatedActivity = ActivityInput<
	"issue.updated",
	CurrentCycle &
		NoFieldChange & {
			metadata: {
				updatedFields: string[];
			};
		}
>;

type IssueStatusChangedActivity = ActivityInput<
	"issue.status_changed",
	CurrentCycle &
		FieldChange<"statusId"> & {
			metadata: Pick<IssueRecord, "cycleId" | "estimate"> & {
				toStatusCategory: IssueStatusCanonicalCategory | null;
			};
		}
>;

type IssueEstimateChangedActivity = ActivityInput<
	"issue.estimate_changed",
	CurrentCycle &
		FieldChange<"estimate"> & {
			metadata: Pick<IssueRecord, "cycleId">;
		}
>;

type IssueCycleAssignedActivity = ActivityInput<
	"issue.cycle_assigned",
	CurrentCycle<ActiveCycleId> &
		FieldChange<"cycleId", CycleId, ActiveCycleId> &
		NoMetadata
>;

type IssueCycleUnassignedActivity = ActivityInput<
	"issue.cycle_unassigned",
	CurrentCycle<ActiveCycleId> &
		FieldChange<"cycleId", ActiveCycleId, null> &
		NoMetadata
>;

type CompleteActivityUnion<
	ActivityUnion extends { actionType: IssueActivityActionType },
> =
	Exclude<IssueActivityActionType, ActivityUnion["actionType"]> extends never
		? ActivityUnion
		: never;

type WriteIssueActivityInput = CompleteActivityUnion<
	| IssueCreatedActivity
	| IssueUpdatedActivity
	| IssueStatusChangedActivity
	| IssueEstimateChangedActivity
	| IssueCycleAssignedActivity
	| IssueCycleUnassignedActivity
>;

export async function writeIssueActivity(
	executor: DbExecutor,
	input: WriteIssueActivityInput,
): Promise<void> {
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
