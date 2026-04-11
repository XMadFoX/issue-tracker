import type { db } from "db";
import { issue } from "db/features/tracker/issues.schema";
import { and, eq, inArray, sql } from "drizzle-orm";

type DbExecutor =
	| typeof db
	| Parameters<Parameters<typeof db.transaction>[0]>[0];

export const MAX_ISSUE_HIERARCHY_DEPTH = 5;

export type IssueHierarchyValidationErrorCode =
	| "INVALID_PARENT"
	| "HIERARCHY_LOOP"
	| "HIERARCHY_DEPTH_EXCEEDED";

type IssueHierarchyValidationResult =
	| { ok: true }
	| { ok: false; code: IssueHierarchyValidationErrorCode };

type AncestorIdsResult =
	| { ok: true; ancestorIds: string[] }
	| { ok: false; code: IssueHierarchyValidationErrorCode };

type SubtreeHeightResult =
	| { ok: true; height: number }
	| { ok: false; code: IssueHierarchyValidationErrorCode };

type ValidateIssueParentAssignmentInput = {
	workspaceId: string;
	teamId: string;
	parentIssueId?: string | null;
	issueId?: string;
};

export async function acquireIssueHierarchyLock(
	executor: DbExecutor,
	input: Pick<ValidateIssueParentAssignmentInput, "workspaceId" | "teamId">,
) {
	await executor.execute(
		sql`select pg_advisory_xact_lock(hashtext(${`issue-hierarchy:${input.workspaceId}:${input.teamId}`}))`,
	);
}

async function getAncestorIds(
	executor: DbExecutor,
	input: Pick<
		ValidateIssueParentAssignmentInput,
		"workspaceId" | "teamId" | "parentIssueId"
	>,
): Promise<AncestorIdsResult> {
	const parentIssueId = input.parentIssueId ?? null;
	if (!parentIssueId) {
		return { ok: true, ancestorIds: [] };
	}

	const ancestorIds: string[] = [];
	const visited = new Set<string>();
	let currentIssueId: string | null = parentIssueId;

	while (currentIssueId) {
		if (visited.has(currentIssueId)) {
			return { ok: false, code: "HIERARCHY_LOOP" };
		}

		visited.add(currentIssueId);

		const [currentIssue] = await executor
			.select({
				id: issue.id,
				teamId: issue.teamId,
				parentIssueId: issue.parentIssueId,
			})
			.from(issue)
			.where(
				and(
					eq(issue.id, currentIssueId),
					eq(issue.workspaceId, input.workspaceId),
				),
			)
			.limit(1)
			.for("update");

		if (!currentIssue || currentIssue.teamId !== input.teamId) {
			return { ok: false, code: "INVALID_PARENT" };
		}

		ancestorIds.push(currentIssue.id);
		currentIssueId = currentIssue.parentIssueId;
	}

	return { ok: true, ancestorIds };
}

async function getSubtreeHeight(
	executor: DbExecutor,
	input: Pick<ValidateIssueParentAssignmentInput, "workspaceId" | "issueId">,
): Promise<SubtreeHeightResult> {
	if (!input.issueId) {
		return { ok: true, height: 0 };
	}

	const visited = new Set([input.issueId]);
	let frontier = [input.issueId];
	let height = 0;

	while (frontier.length > 0) {
		const children = await executor
			.select({
				id: issue.id,
			})
			.from(issue)
			.where(
				and(
					eq(issue.workspaceId, input.workspaceId),
					inArray(issue.parentIssueId, frontier),
				),
			);

		if (children.length === 0) {
			return { ok: true, height };
		}

		const nextFrontier: string[] = [];

		for (const childIssue of children) {
			if (visited.has(childIssue.id)) {
				return { ok: false, code: "HIERARCHY_LOOP" };
			}

			visited.add(childIssue.id);
			nextFrontier.push(childIssue.id);
		}

		frontier = nextFrontier;
		height += 1;
	}

	return { ok: true, height };
}

export async function validateIssueParentAssignment(
	executor: DbExecutor,
	input: ValidateIssueParentAssignmentInput,
): Promise<IssueHierarchyValidationResult> {
	const parentIssueId = input.parentIssueId ?? null;
	if (!parentIssueId) {
		return { ok: true };
	}

	if (input.issueId && input.issueId === parentIssueId) {
		return { ok: false, code: "HIERARCHY_LOOP" };
	}

	const ancestorResult = await getAncestorIds(executor, input);
	if (!ancestorResult.ok) {
		return ancestorResult;
	}

	if (input.issueId && ancestorResult.ancestorIds.includes(input.issueId)) {
		return { ok: false, code: "HIERARCHY_LOOP" };
	}

	const subtreeResult = await getSubtreeHeight(executor, input);
	if (!subtreeResult.ok) {
		return subtreeResult;
	}

	// Root issues are depth 0, direct children are depth 1.
	const resultingMaxDepth =
		ancestorResult.ancestorIds.length + subtreeResult.height;

	if (resultingMaxDepth > MAX_ISSUE_HIERARCHY_DEPTH) {
		return { ok: false, code: "HIERARCHY_DEPTH_EXCEEDED" };
	}

	return { ok: true };
}
