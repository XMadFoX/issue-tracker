import { createId } from "@paralleldrive/cuid2";
import type { db } from "db";
import { issueType } from "db/features/tracker/issue-types.schema";
import { and, eq, isNull, sql } from "drizzle-orm";

type DbTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
type DbExecutor = typeof db | DbTransaction;

export type IssueTypeInsert = typeof issueType.$inferInsert;

export const DEFAULT_ISSUE_TYPES = [
	{
		name: "Task",
		key: "task",
		icon: "✅",
		color: "#64748b",
		description: "Default work item for general tasks.",
		orderIndex: 0,
		isDefault: true,
		isEditable: true,
	},
	{
		name: "Bug",
		key: "bug",
		icon: "🐛",
		color: "#ef4444",
		description: "Defect or regression that needs investigation.",
		orderIndex: 1,
		isDefault: false,
		isEditable: true,
	},
	{
		name: "Feature",
		key: "feature",
		icon: "✨",
		color: "#3b82f6",
		description: "New user-facing capability or enhancement.",
		orderIndex: 2,
		isDefault: false,
		isEditable: true,
	},
	{
		name: "Chore",
		key: "chore",
		icon: "🔧",
		color: "#a855f7",
		description: "Maintenance or operational work.",
		orderIndex: 3,
		isDefault: false,
		isEditable: true,
	},
] as const;

export const DEFAULT_TASK_ISSUE_TYPE_KEY = "task";

export const buildDefaultIssueTypeSeed = (workspaceId: string) => {
	const issueTypes: IssueTypeInsert[] = DEFAULT_ISSUE_TYPES.map((type) => ({
		id: createId(),
		workspaceId,
		teamId: null,
		...type,
	}));

	return { issueTypes };
};

async function acquireSeedLock(executor: DbExecutor, key: string) {
	await executor.execute(sql`select pg_advisory_xact_lock(hashtext(${key}))`);
}

export class IssueTypeDefaultConflictError extends Error {
	constructor({
		workspaceId,
		conflictingIssueTypeId,
		conflictingIssueTypeName,
	}: {
		workspaceId: string;
		conflictingIssueTypeId: string;
		conflictingIssueTypeName: string;
	}) {
		super(
			`Workspace ${workspaceId} already has global default issue type ${conflictingIssueTypeId} (${conflictingIssueTypeName}); resolve it before assigning Task as default.`,
		);
		this.name = "IssueTypeDefaultConflictError";
	}
}

export async function ensureDefaultIssueTypes({
	executor,
	workspaceId,
}: {
	executor: DbExecutor;
	workspaceId: string;
}) {
	await acquireSeedLock(executor, `issue-types-defaults:${workspaceId}`);

	const existingRows = await executor
		.select()
		.from(issueType)
		.where(
			and(eq(issueType.workspaceId, workspaceId), isNull(issueType.teamId)),
		);

	const rowsByKey = new Map(existingRows.map((row) => [row.key, row]));
	const existingDefault = existingRows.find((row) => row.isDefault);
	const taskRow = rowsByKey.get(DEFAULT_TASK_ISSUE_TYPE_KEY);

	if (taskRow && !taskRow.isDefault) {
		if (existingDefault) {
			throw new IssueTypeDefaultConflictError({
				workspaceId,
				conflictingIssueTypeId: existingDefault.id,
				conflictingIssueTypeName: existingDefault.name,
			});
		}

		const [updatedTaskRow] = await executor
			.update(issueType)
			.set({ isDefault: true })
			.where(eq(issueType.id, taskRow.id))
			.returning();

		if (updatedTaskRow) {
			rowsByKey.set(DEFAULT_TASK_ISSUE_TYPE_KEY, updatedTaskRow);
		}
	}

	const insertedIssueTypes: (typeof issueType.$inferSelect)[] = [];

	for (const defaultIssueType of DEFAULT_ISSUE_TYPES) {
		if (rowsByKey.has(defaultIssueType.key)) {
			continue;
		}

		if (defaultIssueType.isDefault && existingDefault) {
			throw new IssueTypeDefaultConflictError({
				workspaceId,
				conflictingIssueTypeId: existingDefault.id,
				conflictingIssueTypeName: existingDefault.name,
			});
		}

		const [insertedIssueType] = await executor
			.insert(issueType)
			.values({
				id: createId(),
				workspaceId,
				teamId: null,
				...defaultIssueType,
			})
			.returning();

		if (insertedIssueType) {
			insertedIssueTypes.push(insertedIssueType);
			rowsByKey.set(defaultIssueType.key, insertedIssueType);
		}
	}

	const ensuredIssueTypes = DEFAULT_ISSUE_TYPES.map((defaultIssueType) =>
		rowsByKey.get(defaultIssueType.key),
	).filter((row) => row !== undefined);
	const ensuredTaskIssueType = rowsByKey.get(DEFAULT_TASK_ISSUE_TYPE_KEY);

	if (!ensuredTaskIssueType) {
		throw new Error(
			`Workspace ${workspaceId} does not have a global Task issue type after ensuring defaults.`,
		);
	}

	return {
		taskIssueTypeId: ensuredTaskIssueType.id,
		issueTypes: ensuredIssueTypes,
		insertedIssueTypes,
	};
}
