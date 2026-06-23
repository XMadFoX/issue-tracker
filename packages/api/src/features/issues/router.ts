import { createId } from "@paralleldrive/cuid2";
import { db } from "db";
import { cycle } from "db/features/tracker/cycles.schema";
import {
	issueStatus,
	issueStatusGroup,
} from "db/features/tracker/issue-statuses.schema";
import {
	issueType,
	issueTypeAllowedStatus,
	issueTypeTeamOverride,
} from "db/features/tracker/issue-types.schema";
import { issue, issueLabel } from "db/features/tracker/issues.schema";
import { and, asc, eq, inArray, isNull, or, sql } from "drizzle-orm";
import { omit } from "remeda";
import { z } from "zod";
import { authedRouter } from "../../context";
import { isAllowed } from "../../lib/abac";
import { getReadableTeamIdsForPermission } from "../../lib/permissions-helpers";
import {
	calculateAfterRank,
	calculateBeforeRank,
	calculateMiddleRank,
} from "../../utils/lexorank";
import { rebalanceStatusIssues } from "../../utils/rebalancing";
import { type DbExecutor, writeIssueActivity } from "./activity";
import {
	acquireIssueHierarchyLock,
	type IssueHierarchyValidationErrorCode,
	validateIssueParentAssignment,
} from "./hierarchy";
import { issuePublisher } from "./publisher";
import { getIssueWithRelations, searchIssues } from "./queries";
import {
	issueActivityListSchema,
	issueCreateSchema,
	issueDeleteSchema,
	issueGetSchema,
	issueLabelsSchema,
	issueListSchema,
	issueMoveSchema,
	issuePriorityUpdateSchema,
	issueSearchSchema,
	issueUpdateAssigneeSchema,
	issueUpdateParentSchema,
	issueUpdateSchema,
} from "./schema";
import { buildIssueSearchFields } from "./search-fields";

const commonErrors = {
	UNAUTHORIZED: {},
	NOT_FOUND: {},
};

const hierarchyErrors = {
	INVALID_PARENT: {},
	HIERARCHY_LOOP: {},
	HIERARCHY_DEPTH_EXCEEDED: {},
};

const issueRelationErrors = {
	INVALID_CYCLE: {},
	CYCLE_CLOSED: {},
};

const issueTypeErrors = {
	INVALID_ISSUE_TYPE: {},
	ISSUE_TYPE_STATUS_REQUIRED: {},
	INVALID_ISSUE_TYPE_STATUS: {},
};

const updateDeleteErrors = {
	...commonErrors,
	...hierarchyErrors,
	...issueRelationErrors,
	...issueTypeErrors,
	INVALID_MOVE: {},
	RANK_EXHAUSTED: {},
};

const createErrors = {
	...commonErrors,
	...hierarchyErrors,
	...issueRelationErrors,
	...issueTypeErrors,
};

function isRankExhaustedError(error: unknown): error is Error {
	return error instanceof Error && error.message.includes("RANK_EXHAUSTED");
}

function areJsonValuesEqual(left: unknown, right: unknown) {
	return JSON.stringify(left) === JSON.stringify(right);
}

function areNullableDatesEqual(left: unknown, right: unknown) {
	if (left === null || right === null) return left === right;

	return (
		left instanceof Date &&
		right instanceof Date &&
		left.getTime() === right.getTime()
	);
}

function hasChangedValue(
	currentValue: unknown,
	nextValue: unknown,
	isEqual: (currentValue: unknown, nextValue: unknown) => boolean = Object.is,
) {
	return nextValue !== undefined && !isEqual(currentValue, nextValue);
}

type IssueRecord = typeof issue.$inferSelect;
type IssueUpdateInput = z.infer<typeof issueUpdateSchema>;
type IssueUpdateValues = Partial<typeof issue.$inferInsert>;
type IssueUpdateField = Exclude<keyof IssueUpdateInput, "id" | "workspaceId">;
type IssueWhere = NonNullable<
	NonNullable<Parameters<typeof db.query.issue.findMany>[0]>["where"]
>;

type IssueUpdateFieldRule<Field extends IssueUpdateField = IssueUpdateField> = {
	field: Field;
	isEqual?: (currentValue: unknown, nextValue: unknown) => boolean;
};

type MissingIssueUpdateFields<Fields extends readonly IssueUpdateFieldRule[]> =
	Exclude<IssueUpdateField, Fields[number]["field"]>;

function defineIssueUpdateFields<
	const Fields extends readonly IssueUpdateFieldRule[],
>(
	fields: Fields &
		(MissingIssueUpdateFields<Fields> extends never
			? unknown
			: {
					readonly __missingIssueUpdateFields: MissingIssueUpdateFields<Fields>;
				}),
): readonly IssueUpdateFieldRule[] {
	return fields;
}

const issueUpdateFields = defineIssueUpdateFields([
	{ field: "title" },
	{ field: "description", isEqual: areJsonValuesEqual },
	{ field: "statusId" },
	{ field: "issueTypeId" },
	{ field: "priorityId" },
	{ field: "cycleId" },
	{ field: "estimate" },
	{ field: "dueDate", isEqual: areNullableDatesEqual },
	{ field: "sortOrder" },
	{ field: "assigneeId" },
	{ field: "reporterId" },
	{ field: "archivedAt", isEqual: areNullableDatesEqual },
]);

const dedicatedActivityFields = new Set<IssueUpdateField>([
	"statusId",
	"cycleId",
	"estimate",
]);

function getChangedIssueUpdateFields(
	existingIssue: IssueRecord,
	input: IssueUpdateInput,
) {
	const values: IssueUpdateValues = {};
	const updatedFields: IssueUpdateField[] = [];

	for (const { field, isEqual } of issueUpdateFields) {
		const currentValue = existingIssue[field];
		const nextValue = input[field];

		if (!hasChangedValue(currentValue, nextValue, isEqual)) continue;

		Object.assign(values, { [field]: nextValue });
		updatedFields.push(field);
	}

	return {
		values,
		updatedFields,
		updatedFieldSet: new Set<IssueUpdateField>(updatedFields),
	};
}

function getArchivedIssueFilter(
	archivedFilter: z.infer<typeof issueListSchema>["archivedFilter"],
): IssueWhere {
	switch (archivedFilter) {
		case "archived":
			return { NOT: { archivedAt: { isNull: true } } };
		case "unarchived":
			return { archivedAt: { isNull: true } };
		case "all":
			return {};
	}
}

async function validateIssueCycleAssignment(
	executor: DbExecutor,
	input: {
		cycleId: string | null | undefined;
		workspaceId: string;
		teamId: string;
	},
) {
	if (input.cycleId === null || input.cycleId === undefined) {
		return { ok: true } as const;
	}

	const [row] = await executor
		.select({ id: cycle.id, state: cycle.state })
		.from(cycle)
		.where(
			and(
				eq(cycle.id, input.cycleId),
				eq(cycle.workspaceId, input.workspaceId),
				eq(cycle.teamId, input.teamId),
			),
		)
		.limit(1);

	if (!row) return { ok: false, code: "INVALID_CYCLE" } as const;
	if (row.state === "completed" || row.state === "canceled") {
		return { ok: false, code: "CYCLE_CLOSED" } as const;
	}

	return { ok: true } as const;
}

async function canUseCycle({
	userId,
	workspaceId,
	teamId,
}: {
	userId: string;
	workspaceId: string;
	teamId: string;
}) {
	const [canRead, canUpdate] = await Promise.all([
		isAllowed({
			userId,
			workspaceId,
			teamId,
			permissionKey: "cycle:read",
		}),
		isAllowed({
			userId,
			workspaceId,
			teamId,
			permissionKey: "cycle:update",
		}),
	]);

	return canRead || canUpdate;
}

function throwCycleAssignmentError(
	errors: {
		INVALID_CYCLE: () => unknown;
		CYCLE_CLOSED: () => unknown;
	},
	code: "INVALID_CYCLE" | "CYCLE_CLOSED",
): never {
	switch (code) {
		case "INVALID_CYCLE":
			throw errors.INVALID_CYCLE();
		case "CYCLE_CLOSED":
			throw errors.CYCLE_CLOSED();
	}
}

function throwHierarchyError(
	errors: {
		INVALID_PARENT: () => unknown;
		HIERARCHY_LOOP: () => unknown;
		HIERARCHY_DEPTH_EXCEEDED: () => unknown;
	},
	code: IssueHierarchyValidationErrorCode,
): never {
	switch (code) {
		case "INVALID_PARENT":
			throw errors.INVALID_PARENT();
		case "HIERARCHY_LOOP":
			throw errors.HIERARCHY_LOOP();
		case "HIERARCHY_DEPTH_EXCEEDED":
			throw errors.HIERARCHY_DEPTH_EXCEEDED();
	}
}

async function getStatusCanonicalCategory(
	executor: DbExecutor,
	statusId: (typeof issueStatus.$inferSelect)["id"],
	workspaceId: (typeof issueStatus.$inferSelect)["workspaceId"],
) {
	const [row] = await executor
		.select({ canonicalCategory: issueStatusGroup.canonicalCategory })
		.from(issueStatus)
		.innerJoin(
			issueStatusGroup,
			eq(issueStatus.statusGroupId, issueStatusGroup.id),
		)
		.where(
			and(
				eq(issueStatus.id, statusId),
				eq(issueStatus.workspaceId, workspaceId),
			),
		)
		.limit(1);

	return row?.canonicalCategory ?? null;
}

async function getIssueTeamId(id: string, workspaceId: string) {
	const [row] = await db
		.select({ teamId: issue.teamId })
		.from(issue)
		.where(and(eq(issue.id, id), eq(issue.workspaceId, workspaceId)))
		.limit(1);

	return row?.teamId ?? null;
}

async function getIssueTypeById(
	executor: DbExecutor,
	workspaceId: string,
	issueTypeId: string,
) {
	const [row] = await executor
		.select()
		.from(issueType)
		.where(
			and(
				eq(issueType.id, issueTypeId),
				eq(issueType.workspaceId, workspaceId),
			),
		)
		.limit(1);
	return row ?? null;
}

async function getTeamOverrideForSource(
	executor: DbExecutor,
	workspaceId: string,
	teamId: string,
	sourceIssueTypeId: string,
) {
	const [row] = await executor
		.select()
		.from(issueTypeTeamOverride)
		.where(
			and(
				eq(issueTypeTeamOverride.workspaceId, workspaceId),
				eq(issueTypeTeamOverride.teamId, teamId),
				eq(issueTypeTeamOverride.sourceIssueTypeId, sourceIssueTypeId),
			),
		)
		.limit(1);
	return row ?? null;
}

async function isSelectableIssueType(
	executor: DbExecutor,
	{
		workspaceId,
		teamId,
		issueTypeId,
	}: {
		workspaceId: string;
		teamId: string;
		issueTypeId: string;
	},
) {
	const type = await getIssueTypeById(executor, workspaceId, issueTypeId);
	if (!type) return false;
	if (type.archivedAt) return false;
	if (type.workspaceId !== workspaceId) return false;

	if (type.teamId === teamId) return true;
	if (type.teamId !== null) return false;

	const override = await getTeamOverrideForSource(
		executor,
		workspaceId,
		teamId,
		issueTypeId,
	);
	return !(override?.hiddenAt ?? override?.replacementIssueTypeId);
}

async function resolveEffectiveIssueTypeForTeam(
	executor: DbExecutor,
	{
		workspaceId,
		teamId,
		issueTypeId,
	}: {
		workspaceId: string;
		teamId: string;
		issueTypeId: string;
	},
): Promise<string | null> {
	const type = await getIssueTypeById(executor, workspaceId, issueTypeId);
	if (!type) return null;
	if (type.archivedAt) return null;
	if (type.workspaceId !== workspaceId) return null;

	if (type.teamId === teamId) return type.id;
	if (type.teamId !== null) return null;

	const override = await getTeamOverrideForSource(
		executor,
		workspaceId,
		teamId,
		issueTypeId,
	);
	if (override?.hiddenAt && !override.replacementIssueTypeId) return null;
	if (override?.replacementIssueTypeId) {
		const replacement = await getIssueTypeById(
			executor,
			workspaceId,
			override.replacementIssueTypeId,
		);
		if (
			replacement &&
			!replacement.archivedAt &&
			replacement.teamId === teamId
		) {
			return replacement.id;
		}
		return null;
	}

	return type.id;
}

async function resolveDefaultIssueTypeForCreate(
	executor: DbExecutor,
	{
		workspaceId,
		teamId,
	}: {
		workspaceId: string;
		teamId: string;
	},
) {
	const candidates = await executor
		.select()
		.from(issueType)
		.where(
			and(
				eq(issueType.workspaceId, workspaceId),
				isNull(issueType.archivedAt),
				eq(issueType.isDefault, true),
				or(isNull(issueType.teamId), eq(issueType.teamId, teamId)),
			),
		)
		.orderBy(asc(issueType.teamId), asc(issueType.orderIndex));

	const teamDefault = candidates.find((row) => row.teamId === teamId);
	const globalDefault = candidates.find((row) => row.teamId === null);
	const orderedCandidates = [
		...(teamDefault ? [teamDefault] : []),
		...(globalDefault ? [globalDefault] : []),
	];

	for (const candidate of orderedCandidates) {
		const effectiveId = await resolveEffectiveIssueTypeForTeam(executor, {
			workspaceId,
			teamId,
			issueTypeId: candidate.id,
		});
		if (effectiveId) {
			return { ok: true, issueTypeId: effectiveId } as const;
		}
	}

	const [taskRow] = await executor
		.select()
		.from(issueType)
		.where(
			and(
				eq(issueType.workspaceId, workspaceId),
				isNull(issueType.teamId),
				isNull(issueType.archivedAt),
				eq(issueType.key, "task"),
			),
		)
		.limit(1);

	if (taskRow) {
		const effectiveId = await resolveEffectiveIssueTypeForTeam(executor, {
			workspaceId,
			teamId,
			issueTypeId: taskRow.id,
		});
		if (effectiveId) {
			return { ok: true, issueTypeId: effectiveId } as const;
		}
	}

	return { ok: false, code: "NO_DEFAULT_ISSUE_TYPE" } as const;
}

async function resolveIssueTypeForCreate(
	executor: DbExecutor,
	{
		workspaceId,
		teamId,
		issueTypeId,
	}: {
		workspaceId: string;
		teamId: string;
		issueTypeId: string | undefined;
	},
) {
	if (issueTypeId !== undefined) {
		const selectable = await isSelectableIssueType(executor, {
			workspaceId,
			teamId,
			issueTypeId,
		});
		return selectable
			? ({ ok: true, issueTypeId } as const)
			: ({ ok: false, code: "INVALID_ISSUE_TYPE" } as const);
	}

	return resolveDefaultIssueTypeForCreate(executor, { workspaceId, teamId });
}

async function validateStatusExistsInScope(
	executor: DbExecutor,
	{
		workspaceId,
		teamId,
		statusId,
	}: {
		workspaceId: string;
		teamId: string;
		statusId: string;
	},
) {
	const [row] = await executor
		.select({ id: issueStatus.id })
		.from(issueStatus)
		.where(
			and(
				eq(issueStatus.id, statusId),
				eq(issueStatus.workspaceId, workspaceId),
				or(isNull(issueStatus.teamId), eq(issueStatus.teamId, teamId)),
			),
		)
		.limit(1);
	return row !== undefined;
}

async function isStatusAllowedForIssueType(
	executor: DbExecutor,
	{
		workspaceId,
		teamId,
		issueTypeId,
		statusId,
	}: {
		workspaceId: string;
		teamId: string;
		issueTypeId: string;
		statusId: string;
	},
) {
	const statusExists = await validateStatusExistsInScope(executor, {
		workspaceId,
		teamId,
		statusId,
	});
	if (!statusExists) return false;

	const teamScopedRows = await executor
		.select({ statusId: issueTypeAllowedStatus.statusId })
		.from(issueTypeAllowedStatus)
		.where(
			and(
				eq(issueTypeAllowedStatus.workspaceId, workspaceId),
				eq(issueTypeAllowedStatus.issueTypeId, issueTypeId),
				eq(issueTypeAllowedStatus.teamId, teamId),
			),
		);

	if (teamScopedRows.length > 0) {
		return teamScopedRows.some((row) => row.statusId === statusId);
	}

	const globalRows = await executor
		.select({ statusId: issueTypeAllowedStatus.statusId })
		.from(issueTypeAllowedStatus)
		.where(
			and(
				eq(issueTypeAllowedStatus.workspaceId, workspaceId),
				eq(issueTypeAllowedStatus.issueTypeId, issueTypeId),
				isNull(issueTypeAllowedStatus.teamId),
			),
		);

	if (globalRows.length > 0) {
		return globalRows.some((row) => row.statusId === statusId);
	}

	return true;
}

const listIssues = authedRouter
	.input(issueListSchema)
	.errors(commonErrors)
	.handler(async ({ context, input, errors }) => {
		const allowed = await isAllowed({
			userId: context.auth.session.userId,
			workspaceId: input.workspaceId,
			teamId: input.teamId,
			permissionKey: "issue:read",
		});
		if (!allowed) throw errors.UNAUTHORIZED();

		const rows = await db.query.issue.findMany({
			where: {
				workspaceId: input.workspaceId,
				...(input.teamId ? { teamId: input.teamId } : {}),
				...(input.issueTypeId ? { issueTypeId: input.issueTypeId } : {}),
				...getArchivedIssueFilter(input.archivedFilter),
			},
			with: {
				status: {
					with: {
						statusGroup: true,
					},
				},
				issueType: true,
				priority: true,
				cycle: true,
				assignee: true,
				team: true,
				labelLinks: {
					with: {
						label: true,
					},
				},
			},
			orderBy: {
				sortOrder: "asc",
				createdAt: "desc",
			},
			limit: input.limit,
			offset: input.offset,
		});

		return rows;
	});

const getIssue = authedRouter
	.input(issueGetSchema)
	.errors(updateDeleteErrors)
	.handler(async ({ context, input, errors }) => {
		const teamId = await getIssueTeamId(input.id, input.workspaceId);
		if (!teamId) throw errors.NOT_FOUND();

		const allowed = await isAllowed({
			userId: context.auth.session.userId,
			workspaceId: input.workspaceId,
			teamId,
			permissionKey: "issue:read",
		});
		if (!allowed) throw errors.UNAUTHORIZED();

		const row = await getIssueWithRelations(input.id, input.workspaceId);

		if (!row) throw errors.NOT_FOUND();
		return row;
	});

const listIssueActivity = authedRouter
	.input(issueActivityListSchema)
	.errors(commonErrors)
	.handler(async ({ context, input, errors }) => {
		const teamId = await getIssueTeamId(input.issueId, input.workspaceId);
		if (!teamId) throw errors.NOT_FOUND();

		const allowed = await isAllowed({
			userId: context.auth.session.userId,
			workspaceId: input.workspaceId,
			teamId,
			permissionKey: "issue:read",
		});
		if (!allowed) throw errors.UNAUTHORIZED();

		return await db.query.issueActivity.findMany({
			where: {
				workspaceId: input.workspaceId,
				issueId: input.issueId,
			},
			with: {
				actor: true,
				cycle: true,
			},
			orderBy: {
				createdAt: "desc",
			},
			limit: input.limit,
			offset: input.offset,
		});
	});

const createIssue = authedRouter
	.input(issueCreateSchema)
	.errors(createErrors)
	.handler(async ({ context, input, errors }) => {
		const { workspaceId, teamId, labelIds } = input;
		const allowed = await isAllowed({
			userId: context.auth.session.userId,
			workspaceId,
			teamId,
			permissionKey: "issue:create",
		});
		if (!allowed) throw errors.UNAUTHORIZED();

		const [maxRow] = await db
			.select({ maxNumber: sql<number>`max(${issue.number})` })
			.from(issue)
			.where(and(eq(issue.teamId, teamId), eq(issue.workspaceId, workspaceId)))
			.limit(1);

		const validCycle = await validateIssueCycleAssignment(db, {
			cycleId: input.cycleId,
			workspaceId,
			teamId,
		});
		if (!validCycle.ok) throwCycleAssignmentError(errors, validCycle.code);
		if (input.cycleId !== null && input.cycleId !== undefined) {
			const allowedToUseCycle = await canUseCycle({
				userId: context.auth.session.userId,
				workspaceId,
				teamId,
			});
			if (!allowedToUseCycle) throw errors.UNAUTHORIZED();
		}

		const nextNumber = (maxRow?.maxNumber ?? 0) + 1;
		const searchFields = await buildIssueSearchFields({
			title: input.title,
			description: input.description,
		});

		for (let attempt = 0; attempt <= 1; attempt++) {
			try {
				const [maxSortRow] = await db
					.select({ maxSort: sql<string>`max(${issue.sortOrder})` })
					.from(issue)
					.where(eq(issue.statusId, input.statusId))
					.limit(1);

				const sortOrder = calculateAfterRank(maxSortRow?.maxSort || "a00");

				const created = await db.transaction(async (tx) => {
					await acquireIssueHierarchyLock(tx, { workspaceId, teamId });

					const resolvedType = await resolveIssueTypeForCreate(tx, {
						workspaceId,
						teamId,
						issueTypeId: input.issueTypeId,
					});
					if (!resolvedType.ok) throw errors.INVALID_ISSUE_TYPE();
					const resolvedIssueTypeId = resolvedType.issueTypeId;

					if (
						input.statusId !== undefined &&
						!(await isStatusAllowedForIssueType(tx, {
							workspaceId,
							teamId,
							issueTypeId: resolvedIssueTypeId,
							statusId: input.statusId,
						}))
					) {
						throw errors.INVALID_ISSUE_TYPE_STATUS();
					}

					const hierarchyValidation = await validateIssueParentAssignment(tx, {
						workspaceId,
						teamId,
						parentIssueId: input.parentIssueId,
					});
					if (!hierarchyValidation.ok) {
						throwHierarchyError(errors, hierarchyValidation.code);
					}

					const [newIssue] = await tx
						.insert(issue)
						.values({
							id: createId(),
							number: nextNumber,
							creatorId: context.auth.session.userId,
							sortOrder,
							...omit(input, ["labelIds"]),
							issueTypeId: resolvedIssueTypeId,
							...searchFields,
						})
						.returning();

					if (!newIssue) {
						throw new Error("Failed to create issue");
					}

					if (labelIds.length > 0) {
						await tx.insert(issueLabel).values(
							labelIds.map((labelId) => ({
								issueId: newIssue.id,
								labelId,
							})),
						);
					}

					await writeIssueActivity(tx, {
						workspaceId,
						teamId,
						issueId: newIssue.id,
						actorId: context.auth.session.userId,
						cycleId: newIssue.cycleId,
						actionType: "issue.created",
						metadata: {
							statusId: newIssue.statusId,
							estimate: newIssue.estimate,
							cycleId: newIssue.cycleId,
						},
					});

					if (newIssue.cycleId !== null) {
						await writeIssueActivity(tx, {
							workspaceId,
							teamId,
							issueId: newIssue.id,
							actorId: context.auth.session.userId,
							cycleId: newIssue.cycleId,
							actionType: "issue.cycle_assigned",
							field: "cycleId",
							fromValue: null,
							toValue: newIssue.cycleId,
							metadata: {
								estimate: newIssue.estimate,
								cycleId: newIssue.cycleId,
							},
						});
					}

					return newIssue;
				});

				const freshIssue = await getIssueWithRelations(created.id, workspaceId);
				if (freshIssue) {
					await issuePublisher.publish("issue:changed", {
						type: "create",
						workspaceId,
						teamId: freshIssue.teamId,
						issue: freshIssue,
					});
				}

				return created;
			} catch (error) {
				if (!isRankExhaustedError(error)) {
					throw error;
				}

				if (attempt === 0) {
					await rebalanceStatusIssues(input.statusId);
				} else {
					throw error;
				}
			}
		}

		throw new Error("Failed to create issue after rebalancing");
	});

const updateIssue = authedRouter
	.input(issueUpdateSchema)
	.errors(updateDeleteErrors)
	.handler(async ({ context, input, errors }) => {
		const [existingIssue] = await db
			.select()
			.from(issue)
			.where(
				and(eq(issue.id, input.id), eq(issue.workspaceId, input.workspaceId)),
			)
			.limit(1);
		if (!existingIssue) throw errors.NOT_FOUND();

		const allowed = await isAllowed({
			userId: context.auth.session.userId,
			workspaceId: input.workspaceId,
			teamId: existingIssue.teamId,
			permissionKey: "issue:update",
		});
		if (!allowed) throw errors.UNAUTHORIZED();

		const assigningCycle =
			input.cycleId !== null &&
			input.cycleId !== undefined &&
			existingIssue.cycleId !== input.cycleId;
		const unassigningCycle =
			input.cycleId === null && existingIssue.cycleId !== null;
		if (assigningCycle) {
			const validCycle = await validateIssueCycleAssignment(db, {
				cycleId: input.cycleId,
				workspaceId: input.workspaceId,
				teamId: existingIssue.teamId,
			});
			if (!validCycle.ok) throwCycleAssignmentError(errors, validCycle.code);
		}
		if (assigningCycle || unassigningCycle) {
			const allowedToUseCycle = await canUseCycle({
				userId: context.auth.session.userId,
				workspaceId: input.workspaceId,
				teamId: existingIssue.teamId,
			});
			if (!allowedToUseCycle) throw errors.UNAUTHORIZED();
		}

		const typeChanging =
			input.issueTypeId !== undefined &&
			input.issueTypeId !== existingIssue.issueTypeId;
		const effectiveIssueTypeId = typeChanging
			? input.issueTypeId
			: existingIssue.issueTypeId;

		const { values, updatedFields, updatedFieldSet } =
			getChangedIssueUpdateFields(existingIssue, input);
		const typeChanged = updatedFieldSet.has("issueTypeId");
		const genericUpdatedFields = updatedFields.filter(
			(field) => !dedicatedActivityFields.has(field) && field !== "issueTypeId",
		);
		const titleChanged = updatedFieldSet.has("title");
		const descriptionChanged = updatedFieldSet.has("description");
		const statusChanged = updatedFieldSet.has("statusId");

		if (updatedFields.length === 0) {
			return existingIssue;
		}

		// move to another status col with changing sortOrder to top
		if (statusChanged && input.statusId !== undefined) {
			const [targetStatus] = await db
				.select({ id: issueStatus.id })
				.from(issueStatus)
				.where(
					and(
						eq(issueStatus.id, input.statusId),
						eq(issueStatus.workspaceId, input.workspaceId),
						or(
							isNull(issueStatus.teamId),
							eq(issueStatus.teamId, existingIssue.teamId),
						),
					),
				)
				.limit(1);
			if (!targetStatus) throw errors.INVALID_MOVE();

			const firstRank = await db
				.select({ minSort: sql<string>`min(${issue.sortOrder})` })
				.from(issue)
				.where(
					and(
						eq(issue.workspaceId, input.workspaceId),
						eq(issue.teamId, existingIssue.teamId),
						eq(issue.statusId, input.statusId),
					),
				)
				.limit(1)
				.then((rows) => rows[0]?.minSort);

			values.sortOrder = calculateBeforeRank(firstRank || "a00");
		}

		if (titleChanged || descriptionChanged) {
			Object.assign(
				values,
				await buildIssueSearchFields({
					title: input.title ?? existingIssue.title,
					description:
						input.description !== undefined
							? input.description
							: existingIssue.description,
				}),
			);
		}

		const updated = await db.transaction(async (tx) => {
			if (typeChanging && input.issueTypeId !== undefined) {
				const selectable = await isSelectableIssueType(tx, {
					workspaceId: input.workspaceId,
					teamId: existingIssue.teamId,
					issueTypeId: input.issueTypeId,
				});
				if (!selectable) throw errors.INVALID_ISSUE_TYPE();
			}

			if (
				statusChanged &&
				input.statusId !== undefined &&
				effectiveIssueTypeId &&
				!(await isStatusAllowedForIssueType(tx, {
					workspaceId: input.workspaceId,
					teamId: existingIssue.teamId,
					issueTypeId: effectiveIssueTypeId,
					statusId: input.statusId,
				}))
			) {
				throw errors.INVALID_ISSUE_TYPE_STATUS();
			}

			if (
				typeChanging &&
				!statusChanged &&
				effectiveIssueTypeId &&
				existingIssue.statusId &&
				!(await isStatusAllowedForIssueType(tx, {
					workspaceId: input.workspaceId,
					teamId: existingIssue.teamId,
					issueTypeId: effectiveIssueTypeId,
					statusId: existingIssue.statusId,
				}))
			) {
				throw errors.ISSUE_TYPE_STATUS_REQUIRED();
			}

			const [updatedIssue] = await tx
				.update(issue)
				.set(values)
				.where(
					and(eq(issue.id, input.id), eq(issue.workspaceId, input.workspaceId)),
				)
				.returning();
			if (!updatedIssue) throw errors.NOT_FOUND();

			if (genericUpdatedFields.length > 0) {
				await writeIssueActivity(tx, {
					workspaceId: input.workspaceId,
					teamId: existingIssue.teamId,
					issueId: input.id,
					actorId: context.auth.session.userId,
					cycleId: updatedIssue.cycleId,
					actionType: "issue.updated",
					metadata: {
						updatedFields: genericUpdatedFields,
					},
				});
			}

			if (typeChanged) {
				await writeIssueActivity(tx, {
					workspaceId: input.workspaceId,
					teamId: existingIssue.teamId,
					issueId: input.id,
					actorId: context.auth.session.userId,
					cycleId: updatedIssue.cycleId,
					actionType: "issue.updated",
					field: "issueTypeId",
					fromValue: existingIssue.issueTypeId,
					toValue: updatedIssue.issueTypeId,
					metadata: {
						updatedFields: ["issueTypeId"],
					},
				});
			}

			if (input.statusId && existingIssue.statusId !== input.statusId) {
				await writeIssueActivity(tx, {
					workspaceId: input.workspaceId,
					teamId: existingIssue.teamId,
					issueId: input.id,
					actorId: context.auth.session.userId,
					cycleId: updatedIssue.cycleId,
					actionType: "issue.status_changed",
					field: "statusId",
					fromValue: existingIssue.statusId,
					toValue: input.statusId,
					metadata: {
						toStatusCategory: await getStatusCanonicalCategory(
							tx,
							input.statusId,
							input.workspaceId,
						),
						estimate: updatedIssue.estimate,
						cycleId: updatedIssue.cycleId,
					},
				});
			}

			if (
				input.estimate !== undefined &&
				existingIssue.estimate !== input.estimate
			) {
				await writeIssueActivity(tx, {
					workspaceId: input.workspaceId,
					teamId: existingIssue.teamId,
					issueId: input.id,
					actorId: context.auth.session.userId,
					cycleId: updatedIssue.cycleId,
					actionType: "issue.estimate_changed",
					field: "estimate",
					fromValue: existingIssue.estimate,
					toValue: input.estimate,
					metadata: {
						cycleId: updatedIssue.cycleId,
					},
				});
			}

			if (
				input.cycleId !== undefined &&
				existingIssue.cycleId !== updatedIssue.cycleId
			) {
				if (existingIssue.cycleId !== null) {
					await writeIssueActivity(tx, {
						workspaceId: input.workspaceId,
						teamId: existingIssue.teamId,
						issueId: input.id,
						actorId: context.auth.session.userId,
						cycleId: existingIssue.cycleId,
						actionType: "issue.cycle_unassigned",
						field: "cycleId",
						fromValue: existingIssue.cycleId,
						toValue: null,
						metadata: {
							estimate: existingIssue.estimate,
							cycleId: existingIssue.cycleId,
						},
					});
				}

				if (updatedIssue.cycleId !== null) {
					await writeIssueActivity(tx, {
						workspaceId: input.workspaceId,
						teamId: existingIssue.teamId,
						issueId: input.id,
						actorId: context.auth.session.userId,
						cycleId: updatedIssue.cycleId,
						actionType: "issue.cycle_assigned",
						field: "cycleId",
						fromValue: existingIssue.cycleId,
						toValue: updatedIssue.cycleId,
						metadata: {
							estimate: updatedIssue.estimate,
							cycleId: updatedIssue.cycleId,
						},
					});
				}
			}

			return updatedIssue;
		});

		const freshIssue = await getIssueWithRelations(input.id, input.workspaceId);
		if (freshIssue) {
			await issuePublisher.publish("issue:changed", {
				type: "update",
				workspaceId: input.workspaceId,
				teamId: freshIssue.teamId,
				issue: freshIssue,
			});
		}

		return updated;
	});

const updateParent = authedRouter
	.input(issueUpdateParentSchema)
	.errors(updateDeleteErrors)
	.handler(async ({ context, input, errors }) => {
		const [existingIssue] = await db
			.select({
				teamId: issue.teamId,
			})
			.from(issue)
			.where(
				and(eq(issue.id, input.id), eq(issue.workspaceId, input.workspaceId)),
			)
			.limit(1);
		if (!existingIssue) throw errors.NOT_FOUND();

		const allowed = await isAllowed({
			userId: context.auth.session.userId,
			workspaceId: input.workspaceId,
			teamId: existingIssue.teamId,
			permissionKey: "issue:update",
		});
		if (!allowed) throw errors.UNAUTHORIZED();

		const updated = await db.transaction(async (tx) => {
			await acquireIssueHierarchyLock(tx, {
				workspaceId: input.workspaceId,
				teamId: existingIssue.teamId,
			});

			const [lockedIssue] = await tx
				.select({
					id: issue.id,
					teamId: issue.teamId,
					parentIssueId: issue.parentIssueId,
					cycleId: issue.cycleId,
				})
				.from(issue)
				.where(
					and(eq(issue.id, input.id), eq(issue.workspaceId, input.workspaceId)),
				)
				.limit(1)
				.for("update");
			if (!lockedIssue) throw errors.NOT_FOUND();

			const hierarchyValidation = await validateIssueParentAssignment(tx, {
				workspaceId: input.workspaceId,
				teamId: lockedIssue.teamId,
				issueId: input.id,
				parentIssueId: input.parentIssueId,
			});
			if (!hierarchyValidation.ok) {
				throwHierarchyError(errors, hierarchyValidation.code);
			}

			const [updatedIssue] = await tx
				.update(issue)
				.set({ parentIssueId: input.parentIssueId })
				.where(
					and(eq(issue.id, input.id), eq(issue.workspaceId, input.workspaceId)),
				)
				.returning();
			if (!updatedIssue) throw errors.NOT_FOUND();

			if (lockedIssue.parentIssueId !== updatedIssue.parentIssueId) {
				await writeIssueActivity(tx, {
					workspaceId: input.workspaceId,
					teamId: lockedIssue.teamId,
					issueId: input.id,
					actorId: context.auth.session.userId,
					cycleId: updatedIssue.cycleId,
					actionType: "issue.updated",
					metadata: {
						updatedFields: ["parentIssueId"],
					},
				});
			}

			return updatedIssue;
		});

		const freshIssue = await getIssueWithRelations(input.id, input.workspaceId);
		if (freshIssue) {
			await issuePublisher.publish("issue:changed", {
				type: "update",
				workspaceId: input.workspaceId,
				teamId: freshIssue.teamId,
				issue: freshIssue,
			});
		}

		return updated;
	});

const deleteIssue = authedRouter
	.input(issueDeleteSchema)
	.errors(updateDeleteErrors)
	.handler(async ({ context, input, errors }) => {
		const teamId = await getIssueTeamId(input.id, input.workspaceId);
		if (!teamId) throw errors.NOT_FOUND();

		const allowed = await isAllowed({
			userId: context.auth.session.userId,
			workspaceId: input.workspaceId,
			teamId,
			permissionKey: "issue:delete",
		});
		if (!allowed) throw errors.UNAUTHORIZED();

		const { deleted, affectedChildIds } = await db.transaction(async (tx) => {
			await acquireIssueHierarchyLock(tx, {
				workspaceId: input.workspaceId,
				teamId,
			});

			const childRows = await tx
				.select({ id: issue.id })
				.from(issue)
				.where(
					and(
						eq(issue.workspaceId, input.workspaceId),
						eq(issue.parentIssueId, input.id),
					),
				)
				.for("update");

			const [deletedIssue] = await tx
				.delete(issue)
				.where(
					and(eq(issue.id, input.id), eq(issue.workspaceId, input.workspaceId)),
				)
				.returning();
			if (!deletedIssue) throw errors.NOT_FOUND();

			return {
				deleted: deletedIssue,
				affectedChildIds: childRows.map((row) => row.id),
			};
		});
		if (!deleted) throw errors.NOT_FOUND();

		await issuePublisher.publish("issue:changed", {
			type: "delete",
			workspaceId: input.workspaceId,
			teamId: deleted.teamId,
			issueId: deleted.id,
		});

		const affectedChildren = await Promise.all(
			affectedChildIds.map((childId) =>
				getIssueWithRelations(childId, input.workspaceId),
			),
		);

		for (const childIssue of affectedChildren) {
			if (!childIssue) continue;

			await issuePublisher.publish("issue:changed", {
				type: "update",
				workspaceId: input.workspaceId,
				teamId: childIssue.teamId,
				issue: childIssue,
			});
		}

		return deleted;
	});

const bulkAddLabels = authedRouter
	.input(issueLabelsSchema)
	.errors(commonErrors)
	.handler(async ({ context, input, errors }) => {
		const teamId = await getIssueTeamId(input.issueId, input.workspaceId);
		if (!teamId) throw errors.NOT_FOUND();

		const allowed = await isAllowed({
			userId: context.auth.session.userId,
			workspaceId: input.workspaceId,
			teamId,
			permissionKey: "issue:update",
		});
		if (!allowed) throw errors.UNAUTHORIZED();

		if (input.labelIds.length === 0) return;

		const [issueContext] = await db
			.select({ cycleId: issue.cycleId })
			.from(issue)
			.where(
				and(
					eq(issue.id, input.issueId),
					eq(issue.workspaceId, input.workspaceId),
				),
			)
			.limit(1);
		if (!issueContext) throw errors.NOT_FOUND();

		await db.transaction(async (tx) => {
			const insertedLabels = await tx
				.insert(issueLabel)
				.values(
					input.labelIds.map((labelId) => ({
						issueId: input.issueId,
						labelId,
					})),
				)
				.onConflictDoNothing()
				.returning({ labelId: issueLabel.labelId });

			if (insertedLabels.length === 0) return;

			await writeIssueActivity(tx, {
				workspaceId: input.workspaceId,
				teamId,
				issueId: input.issueId,
				actorId: context.auth.session.userId,
				cycleId: issueContext.cycleId,
				actionType: "issue.updated",
				metadata: {
					updatedFields: ["labels"],
				},
			});
		});

		const freshIssue = await getIssueWithRelations(
			input.issueId,
			input.workspaceId,
		);
		if (freshIssue) {
			await issuePublisher.publish("issue:changed", {
				type: "update",
				workspaceId: input.workspaceId,
				teamId: freshIssue.teamId,
				issue: freshIssue,
			});
		}
	});

const bulkDeleteLabels = authedRouter
	.input(issueLabelsSchema)
	.errors(commonErrors)
	.handler(async ({ context, input, errors }) => {
		const teamId = await getIssueTeamId(input.issueId, input.workspaceId);
		if (!teamId) throw errors.NOT_FOUND();

		const allowed = await isAllowed({
			userId: context.auth.session.userId,
			workspaceId: input.workspaceId,
			teamId,
			permissionKey: "issue:update",
		});
		if (!allowed) throw errors.UNAUTHORIZED();

		if (input.labelIds.length === 0) return;

		const [issueContext] = await db
			.select({ cycleId: issue.cycleId })
			.from(issue)
			.where(
				and(
					eq(issue.id, input.issueId),
					eq(issue.workspaceId, input.workspaceId),
				),
			)
			.limit(1);
		if (!issueContext) throw errors.NOT_FOUND();

		await db.transaction(async (tx) => {
			const deletedLabels = await tx
				.delete(issueLabel)
				.where(
					and(
						eq(issueLabel.issueId, input.issueId),
						inArray(issueLabel.labelId, input.labelIds),
					),
				)
				.returning({ labelId: issueLabel.labelId });

			if (deletedLabels.length === 0) return;

			await writeIssueActivity(tx, {
				workspaceId: input.workspaceId,
				teamId,
				issueId: input.issueId,
				actorId: context.auth.session.userId,
				cycleId: issueContext.cycleId,
				actionType: "issue.updated",
				metadata: {
					updatedFields: ["labels"],
				},
			});
		});

		const freshIssue = await getIssueWithRelations(
			input.issueId,
			input.workspaceId,
		);
		if (freshIssue) {
			await issuePublisher.publish("issue:changed", {
				type: "update",
				workspaceId: input.workspaceId,
				teamId: freshIssue.teamId,
				issue: freshIssue,
			});
		}
	});

const updatePriority = authedRouter
	.input(issuePriorityUpdateSchema)
	.errors(updateDeleteErrors)
	.handler(async ({ context, input, errors }) => {
		const [existingIssue] = await db
			.select()
			.from(issue)
			.where(
				and(eq(issue.id, input.id), eq(issue.workspaceId, input.workspaceId)),
			)
			.limit(1);
		if (!existingIssue) throw errors.NOT_FOUND();

		const allowed = await isAllowed({
			userId: context.auth.session.userId,
			workspaceId: input.workspaceId,
			teamId: existingIssue.teamId,
			permissionKey: "issue:update",
		});
		if (!allowed) throw errors.UNAUTHORIZED();

		if (existingIssue.priorityId === input.priorityId) return existingIssue;

		const updated = await db.transaction(async (tx) => {
			const [updatedIssue] = await tx
				.update(issue)
				.set({ priorityId: input.priorityId })
				.where(
					and(eq(issue.id, input.id), eq(issue.workspaceId, input.workspaceId)),
				)
				.returning();
			if (!updatedIssue) throw errors.NOT_FOUND();

			await writeIssueActivity(tx, {
				workspaceId: input.workspaceId,
				teamId: existingIssue.teamId,
				issueId: input.id,
				actorId: context.auth.session.userId,
				cycleId: updatedIssue.cycleId,
				actionType: "issue.updated",
				metadata: {
					updatedFields: ["priorityId"],
				},
			});

			return updatedIssue;
		});

		const freshIssue = await getIssueWithRelations(input.id, input.workspaceId);
		if (freshIssue) {
			await issuePublisher.publish("issue:changed", {
				type: "update",
				workspaceId: input.workspaceId,
				teamId: freshIssue.teamId,
				issue: freshIssue,
			});
		}

		return updated;
	});

const updateAssignee = authedRouter
	.input(issueUpdateAssigneeSchema)
	.errors(updateDeleteErrors)
	.handler(async ({ context, input, errors }) => {
		const [existingIssue] = await db
			.select()
			.from(issue)
			.where(
				and(eq(issue.id, input.id), eq(issue.workspaceId, input.workspaceId)),
			)
			.limit(1);
		if (!existingIssue) throw errors.NOT_FOUND();

		const allowed = await isAllowed({
			userId: context.auth.session.userId,
			workspaceId: input.workspaceId,
			teamId: existingIssue.teamId,
			permissionKey: "issue:update",
		});
		if (!allowed) throw errors.UNAUTHORIZED();

		if (existingIssue.assigneeId === input.assigneeId) return existingIssue;

		const updated = await db.transaction(async (tx) => {
			const [updatedIssue] = await tx
				.update(issue)
				.set({ assigneeId: input.assigneeId })
				.where(
					and(eq(issue.id, input.id), eq(issue.workspaceId, input.workspaceId)),
				)
				.returning();
			if (!updatedIssue) throw errors.NOT_FOUND();

			await writeIssueActivity(tx, {
				workspaceId: input.workspaceId,
				teamId: existingIssue.teamId,
				issueId: input.id,
				actorId: context.auth.session.userId,
				cycleId: updatedIssue.cycleId,
				actionType: "issue.updated",
				metadata: {
					updatedFields: ["assigneeId"],
				},
			});

			return updatedIssue;
		});

		const freshIssue = await getIssueWithRelations(input.id, input.workspaceId);
		if (freshIssue) {
			await issuePublisher.publish("issue:changed", {
				type: "update",
				workspaceId: input.workspaceId,
				teamId: freshIssue.teamId,
				issue: freshIssue,
			});
		}

		return updated;
	});

const moveIssue = authedRouter
	.input(issueMoveSchema)
	.errors(updateDeleteErrors)
	.handler(async ({ context, input, errors }) => {
		console.debug("Move issue input:", input);
		const [currentIssue] = await db
			.select({
				id: issue.id,
				teamId: issue.teamId,
				statusId: issue.statusId,
			})
			.from(issue)
			.where(
				and(eq(issue.id, input.id), eq(issue.workspaceId, input.workspaceId)),
			)
			.limit(1);
		if (!currentIssue) throw errors.NOT_FOUND();

		const allowed = await isAllowed({
			userId: context.auth.session.userId,
			workspaceId: input.workspaceId,
			teamId: currentIssue.teamId,
			permissionKey: "issue:update",
		});
		if (!allowed) throw errors.UNAUTHORIZED();

		let statusIdForRebalance = currentIssue.statusId;

		const executeMove = async (
			tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
		): ReturnType<typeof db.transaction> => {
			console.debug("Move issue: executing move transaction");
			const [issueRecord] = await tx
				.select()
				.from(issue)
				.where(
					and(eq(issue.id, input.id), eq(issue.workspaceId, input.workspaceId)),
				)
				.for("update");

			console.debug("Move issue: issue record locked", issueRecord);
			if (!issueRecord) throw errors.NOT_FOUND();

			let targetStatusId = issueRecord.statusId;
			let newSortOrder: string;

			if (input.targetId) {
				console.debug("Move issue: moving relative to target", input.targetId);
				const [targetIssue] = await tx
					.select()
					.from(issue)
					.where(
						and(
							eq(issue.id, input.targetId),
							eq(issue.workspaceId, input.workspaceId),
						),
					)
					.for("update");

				console.debug("Move issue: target issue found", targetIssue);
				if (!targetIssue) throw errors.NOT_FOUND();
				if (input.targetId === input.id) throw errors.INVALID_MOVE();
				if (targetIssue.teamId !== issueRecord.teamId)
					throw errors.INVALID_MOVE();

				targetStatusId = targetIssue.statusId;
				statusIdForRebalance = targetStatusId;

				const [targetStatus] = await tx
					.select({ id: issueStatus.id })
					.from(issueStatus)
					.where(
						and(
							eq(issueStatus.id, targetStatusId),
							eq(issueStatus.workspaceId, input.workspaceId),
							or(
								isNull(issueStatus.teamId),
								eq(issueStatus.teamId, issueRecord.teamId),
							),
						),
					)
					.limit(1);
				if (!targetStatus) throw errors.INVALID_MOVE();

				if (
					issueRecord.issueTypeId &&
					!(await isStatusAllowedForIssueType(tx, {
						workspaceId: input.workspaceId,
						teamId: issueRecord.teamId,
						issueTypeId: issueRecord.issueTypeId,
						statusId: targetStatusId,
					}))
				) {
					throw errors.INVALID_ISSUE_TYPE_STATUS();
				}

				const allNeighbors = await tx
					.select()
					.from(issue)
					.where(
						and(
							eq(issue.workspaceId, input.workspaceId),
							eq(issue.teamId, issueRecord.teamId),
							eq(issue.statusId, targetStatusId),
						),
					)
					.orderBy(issue.sortOrder);

				const filteredNeighbors = allNeighbors.filter((i) => i.id !== input.id);

				console.debug("Move issue: neighbors count", filteredNeighbors.length);

				const targetIndex = filteredNeighbors.findIndex(
					(i) => i.id === input.targetId,
				);
				const insertIndex = input.after ? targetIndex + 1 : targetIndex;
				console.debug("Move issue: indices", { targetIndex, insertIndex });

				if (insertIndex === 0) {
					const firstRank = filteredNeighbors[0]?.sortOrder || "a00";
					newSortOrder = calculateBeforeRank(firstRank);
				} else if (insertIndex >= filteredNeighbors.length) {
					const lastRank =
						filteredNeighbors[filteredNeighbors.length - 1]?.sortOrder || "a00";
					newSortOrder = calculateAfterRank(lastRank);
				} else {
					const beforeRank =
						filteredNeighbors[insertIndex - 1]?.sortOrder || "a00";
					const afterRank = filteredNeighbors[insertIndex]?.sortOrder || "b00";
					console.debug("Move issue: calculating middle rank", {
						beforeRank,
						afterRank,
					});
					try {
						newSortOrder = calculateMiddleRank(beforeRank, afterRank);
					} catch (error) {
						console.debug("Move issue: rank calculation error", error);
						if (
							error instanceof Error &&
							error.message === "RANK_EXHAUSTED: No space between ranks"
						) {
							// Rethrow original error to trigger retry with rebalancing
							throw error;
						}
						throw error;
					}
				}
			} else {
				console.debug("Move issue: moving to start/end of status");
				const allStatusIssues = await tx
					.select()
					.from(issue)
					.where(
						and(
							eq(issue.workspaceId, input.workspaceId),
							eq(issue.teamId, issueRecord.teamId),
							eq(issue.statusId, targetStatusId),
						),
					)
					.orderBy(issue.sortOrder);

				const statusIssues = allStatusIssues.filter((i) => i.id !== input.id);

				if (input.after) {
					const lastRank =
						statusIssues[statusIssues.length - 1]?.sortOrder || "a00";
					newSortOrder = calculateAfterRank(lastRank);
				} else {
					const firstRank = statusIssues[0]?.sortOrder || "a00";
					newSortOrder = calculateBeforeRank(firstRank);
				}
			}

			console.debug("Move issue: updating issue", {
				targetStatusId,
				newSortOrder,
			});
			const [updated] = await tx
				.update(issue)
				.set({
					statusId: targetStatusId,
					sortOrder: newSortOrder,
				})
				.where(
					and(
						eq(issue.id, input.id),
						eq(issue.workspaceId, input.workspaceId),
						eq(issue.teamId, issueRecord.teamId),
					),
				)
				.returning();

			if (!updated) throw errors.NOT_FOUND();

			if (issueRecord.statusId !== targetStatusId) {
				await writeIssueActivity(tx, {
					workspaceId: input.workspaceId,
					teamId: issueRecord.teamId,
					issueId: input.id,
					actorId: context.auth.session.userId,
					cycleId: updated.cycleId,
					actionType: "issue.status_changed",
					field: "statusId",
					fromValue: issueRecord.statusId,
					toValue: targetStatusId,
					metadata: {
						toStatusCategory: await getStatusCanonicalCategory(
							tx,
							targetStatusId,
							input.workspaceId,
						),
						estimate: updated.estimate,
						cycleId: updated.cycleId,
					},
				});
			}

			return updated;
		};

		for (let attempt = 0; attempt <= 1; attempt++) {
			try {
				const moved = await db.transaction(executeMove);

				const freshIssue = await getIssueWithRelations(
					input.id,
					input.workspaceId,
				);
				if (freshIssue) {
					await issuePublisher.publish("issue:changed", {
						type: "update",
						workspaceId: input.workspaceId,
						teamId: freshIssue.teamId,
						issue: freshIssue,
					});
				}

				return moved;
			} catch (error) {
				console.debug("Move issue error caught:", error);
				if (typeof error === "object") {
					try {
						console.debug("Error details:", JSON.stringify(error, null, 2));
					} catch (_e) {
						console.debug("Error details (stringify failed):", error);
					}
				}
				if (!isRankExhaustedError(error)) {
					throw error;
				}

				if (attempt === 0) {
					await rebalanceStatusIssues(statusIdForRebalance);
				} else {
					throw new Error("Failed to move issue after rebalancing");
				}
			}
		}

		throw new Error("Failed to move issue after rebalancing");
	});

const liveIssues = authedRouter
	.input(
		z.object({
			workspaceId: z.string(),
			teamId: z.string().optional(),
		}),
	)
	.errors(commonErrors)
	.handler(async function* ({ context, input, errors, signal, lastEventId }) {
		const allowed = await isAllowed({
			userId: context.auth.session.userId,
			workspaceId: input.workspaceId,
			teamId: input.teamId,
			permissionKey: "issue:read",
		});
		if (!allowed) throw errors.UNAUTHORIZED();

		const stream = issuePublisher.subscribe("issue:changed", {
			signal,
			lastEventId,
		});

		for await (const event of stream) {
			if (event.workspaceId !== input.workspaceId) continue;
			if (input.teamId && event.teamId !== input.teamId) continue;
			yield event;
		}
	});

const searchIssuesHandler = authedRouter
	.input(issueSearchSchema)
	.errors(commonErrors)
	.handler(async ({ context, input, errors }) => {
		const userId = context.auth.session.userId;

		if (!input.filters?.teamId) {
			const workspaceAllowed = await isAllowed({
				userId,
				workspaceId: input.workspaceId,
				permissionKey: "issue:read",
			});

			if (workspaceAllowed) {
				const results = await searchIssues(input);
				return { issues: results };
			}

			const accessibleTeamIds = await getReadableTeamIdsForPermission({
				userId,
				workspaceId: input.workspaceId,
				permissionKey: "issue:read",
			});
			const results = await searchIssues(input, { accessibleTeamIds });
			return { issues: results };
		}

		const allowed = await isAllowed({
			userId,
			workspaceId: input.workspaceId,
			teamId: input.filters.teamId,
			permissionKey: "issue:read",
		});
		if (!allowed) throw errors.UNAUTHORIZED();

		const results = await searchIssues(input);
		return { issues: results };
	});

export const issueRouter = {
	list: listIssues,
	get: getIssue,
	create: createIssue,
	update: updateIssue,
	updateParent,
	delete: deleteIssue,
	move: moveIssue,
	updatePriority,
	updateAssignee,
	search: searchIssuesHandler,
	live: liveIssues,
	activity: {
		list: listIssueActivity,
	},
	labels: {
		bulkAdd: bulkAddLabels,
		bulkDelete: bulkDeleteLabels,
	},
};
