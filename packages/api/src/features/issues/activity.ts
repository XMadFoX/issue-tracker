import { createId } from "@paralleldrive/cuid2";
import type { db } from "db";
import {
	issueActivity,
	issueActivityActionTypeEnum,
} from "db/features/tracker/issue-activities.schema";
import type { canonicalCategoryEnum } from "db/features/tracker/issue-statuses.schema";
import type { issue } from "db/features/tracker/issues.schema";
import { and, desc, eq, gte, isNull, sql } from "drizzle-orm";

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

type IssueUpdatedActivityMetadata = {
	updatedFields: string[];
	descriptionCoalesceFirstCreatedAt?: string;
};

type IssueUpdatedActivity = ActivityInput<
	"issue.updated",
	CurrentCycle &
		NoFieldChange & {
			metadata: IssueUpdatedActivityMetadata;
		}
>;

type IssueTypeChangedActivity = ActivityInput<
	"issue.updated",
	CurrentCycle &
		FieldChange<"issueTypeId"> & {
			metadata: IssueUpdatedActivityMetadata;
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

type IssueCycleActivityMetadata = Pick<
	IssueRecord,
	"estimate" | "issueTypeId"
> & {
	cycleId: ActiveCycleId;
};

type IssueCycleAssignedActivity = ActivityInput<
	"issue.cycle_assigned",
	CurrentCycle<ActiveCycleId> &
		FieldChange<"cycleId", CycleId, ActiveCycleId> & {
			metadata: IssueCycleActivityMetadata;
		}
>;

type IssueCycleUnassignedActivity = ActivityInput<
	"issue.cycle_unassigned",
	CurrentCycle<ActiveCycleId> &
		FieldChange<"cycleId", ActiveCycleId, null> & {
			metadata: IssueCycleActivityMetadata;
		}
>;

type CycleActivityReason = "manual" | "scheduled";

type IssueCycleRolledOverActivityMetadata = Pick<
	IssueRecord,
	"estimate" | "issueTypeId"
> & {
	fromCycleId: ActiveCycleId;
	fromCycleName: string;
	reason: CycleActivityReason;
	toCycleId: ActiveCycleId;
	toCycleName: string;
};

type IssueCycleRolledOverActivity = ActivityInput<
	"issue.cycle_rolled_over",
	CurrentCycle<ActiveCycleId> &
		FieldChange<"cycleId", ActiveCycleId, ActiveCycleId> & {
			metadata: IssueCycleRolledOverActivityMetadata;
		}
>;

type IssueCycleReturnedToBacklogActivityMetadata = Pick<
	IssueRecord,
	"estimate" | "issueTypeId"
> & {
	fromCycleId: ActiveCycleId;
	fromCycleName: string;
	reason: CycleActivityReason;
};

type IssueCycleReturnedToBacklogActivity = ActivityInput<
	"issue.cycle_returned_to_backlog",
	CurrentCycle<ActiveCycleId> &
		FieldChange<"cycleId", ActiveCycleId, null> & {
			metadata: IssueCycleReturnedToBacklogActivityMetadata;
		}
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
	| IssueTypeChangedActivity
	| IssueStatusChangedActivity
	| IssueEstimateChangedActivity
	| IssueCycleAssignedActivity
	| IssueCycleUnassignedActivity
	| IssueCycleRolledOverActivity
	| IssueCycleReturnedToBacklogActivity
>;

const DESCRIPTION_ACTIVITY_ROLLING_COALESCE_WINDOW_MS = 10 * 60 * 1000;
const DESCRIPTION_ACTIVITY_FIXED_COALESCE_WINDOW_MS = 30 * 60 * 1000;
const DESCRIPTION_ONLY_UPDATED_FIELDS = ["description"];
const DESCRIPTION_ONLY_UPDATED_FIELDS_JSON = JSON.stringify(
	DESCRIPTION_ONLY_UPDATED_FIELDS,
);

function getDescriptionOnlyMetadata(
	firstCreatedAt: Date,
): IssueUpdatedActivityMetadata {
	return {
		updatedFields: DESCRIPTION_ONLY_UPDATED_FIELDS,
		descriptionCoalesceFirstCreatedAt: firstCreatedAt.toISOString(),
	};
}

async function acquireDescriptionOnlyActivityLock(
	executor: DbExecutor,
	input: IssueUpdatedActivity,
) {
	await executor.execute(
		sql`select pg_advisory_xact_lock(hashtext(${`issue-description-activity:${input.workspaceId}:${input.issueId}:${input.actorId}`}))`,
	);
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getDescriptionCoalesceFirstCreatedAt({
	createdAt,
	metadata,
}: {
	createdAt: Date;
	metadata: unknown;
}) {
	if (!isRecord(metadata)) {
		return createdAt;
	}

	const firstCreatedAt = metadata.descriptionCoalesceFirstCreatedAt;
	if (typeof firstCreatedAt !== "string") {
		return createdAt;
	}

	const parsedFirstCreatedAt = new Date(firstCreatedAt);
	if (Number.isNaN(parsedFirstCreatedAt.getTime())) {
		return createdAt;
	}

	return parsedFirstCreatedAt;
}

function isDescriptionOnlyIssueUpdatedActivity(
	input: WriteIssueActivityInput,
): input is IssueUpdatedActivity {
	return (
		input.actionType === "issue.updated" &&
		input.metadata.updatedFields.length === 1 &&
		input.metadata.updatedFields[0] === "description"
	);
}

async function coalesceDescriptionOnlyIssueActivity(
	executor: DbExecutor,
	input: IssueUpdatedActivity,
): Promise<boolean> {
	if (input.actorId === undefined || input.actorId === null) {
		return false;
	}

	const now = new Date();
	const rollingCutoff = new Date(
		now.getTime() - DESCRIPTION_ACTIVITY_ROLLING_COALESCE_WINDOW_MS,
	);
	const fixedCutoff = new Date(
		now.getTime() - DESCRIPTION_ACTIVITY_FIXED_COALESCE_WINDOW_MS,
	);
	const [existingActivity] = await executor
		.select({
			id: issueActivity.id,
			createdAt: issueActivity.createdAt,
			metadata: issueActivity.metadata,
		})
		.from(issueActivity)
		.where(
			and(
				eq(issueActivity.workspaceId, input.workspaceId),
				eq(issueActivity.issueId, input.issueId),
				eq(issueActivity.actorId, input.actorId),
				eq(issueActivity.actionType, "issue.updated"),
				isNull(issueActivity.field),
				isNull(issueActivity.fromValue),
				isNull(issueActivity.toValue),
				gte(issueActivity.createdAt, rollingCutoff),
				sql`coalesce((${issueActivity.metadata}->>'descriptionCoalesceFirstCreatedAt')::timestamptz, ${issueActivity.createdAt}) >= ${fixedCutoff}`,
				sql`${issueActivity.metadata}->'updatedFields' = ${DESCRIPTION_ONLY_UPDATED_FIELDS_JSON}::jsonb`,
			),
		)
		.orderBy(desc(issueActivity.createdAt))
		.limit(1);

	if (!existingActivity) {
		return false;
	}

	await executor
		.update(issueActivity)
		.set({
			cycleId: input.cycleId ?? null,
			metadata: getDescriptionOnlyMetadata(
				getDescriptionCoalesceFirstCreatedAt(existingActivity),
			),
			createdAt: now,
		})
		.where(eq(issueActivity.id, existingActivity.id));

	return true;
}

export async function writeIssueActivity(
	executor: DbExecutor,
	input: WriteIssueActivityInput,
): Promise<void> {
	const isDescriptionOnlyActivity =
		isDescriptionOnlyIssueUpdatedActivity(input);

	if (
		isDescriptionOnlyActivity &&
		input.actorId !== undefined &&
		input.actorId !== null
	) {
		await acquireDescriptionOnlyActivityLock(executor, input);
		if (await coalesceDescriptionOnlyIssueActivity(executor, input)) {
			return;
		}
	}

	const metadata = isDescriptionOnlyActivity
		? getDescriptionOnlyMetadata(new Date())
		: (input.metadata ?? null);

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
		metadata,
	});
}
