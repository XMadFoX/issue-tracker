import { db } from "db";
import { cycle } from "db/features/tracker/cycles.schema";
import {
	issueStatus,
	issueStatusGroup,
} from "db/features/tracker/issue-statuses.schema";
import { issue } from "db/features/tracker/issues.schema";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { type DbExecutor, writeIssueActivity } from "../issues/activity";

export type CycleCompletionDisposition =
	| { type: "carryOver"; targetCycleId: string }
	| { type: "moveToBacklog" };

export type CycleCompletionInput = {
	actorId: string | null;
	disposition: CycleCompletionDisposition;
	reason: "manual" | "scheduled";
	teamId: string;
	workspaceId: string;
	cycleId: string;
};

export type CycleCompletionError =
	| "CYCLE_ALREADY_COMPLETED"
	| "CYCLE_CLOSED"
	| "INVALID_ROLLOVER_TARGET"
	| "NOT_FOUND"
	| "TEAM_MISMATCH";

type CompletionCounts = {
	canceled: number;
	carriedOver: number;
	completed: number;
	returnedToBacklog: number;
};

type CompletionResult =
	| { ok: false; code: CycleCompletionError }
	| {
			ok: true;
			affectedIssueIds: string[];
			counts: CompletionCounts;
			destinationCycleId: string | null;
			source: typeof cycle.$inferSelect;
			target: typeof cycle.$inferSelect | null;
	  };

async function lockCycles(
	tx: DbExecutor,
	input: CycleCompletionInput,
): Promise<Array<typeof cycle.$inferSelect>> {
	const cycleIds =
		input.disposition.type === "carryOver"
			? [input.cycleId, input.disposition.targetCycleId]
			: [input.cycleId];
	return tx
		.select()
		.from(cycle)
		.where(
			and(
				eq(cycle.workspaceId, input.workspaceId),
				eq(cycle.teamId, input.teamId),
				inArray(cycle.id, cycleIds),
			),
		)
		.orderBy(asc(cycle.id))
		.for("update");
}

async function completeInTransaction(
	tx: DbExecutor,
	input: CycleCompletionInput,
): Promise<CompletionResult> {
	await tx.execute(
		sql`select pg_advisory_xact_lock(hashtext(${`cycle:${input.workspaceId}:${input.teamId}`}))`,
	);

	const lockedCycles = await lockCycles(tx, input);
	const source = lockedCycles.find((row) => row.id === input.cycleId);
	if (!source) return { ok: false, code: "NOT_FOUND" };
	if (source.state !== "active") {
		return {
			ok: false,
			code:
				source.state === "completed"
					? "CYCLE_ALREADY_COMPLETED"
					: "CYCLE_CLOSED",
		};
	}

	let target: typeof cycle.$inferSelect | null = null;
	if (input.disposition.type === "carryOver") {
		const targetCycleId = input.disposition.targetCycleId;
		if (targetCycleId === source.id) {
			return { ok: false, code: "INVALID_ROLLOVER_TARGET" };
		}
		target = lockedCycles.find((row) => row.id === targetCycleId) ?? null;
		if (!target) {
			const [otherTeamTarget] = await tx
				.select({ id: cycle.id })
				.from(cycle)
				.where(
					and(
						eq(cycle.id, targetCycleId),
						eq(cycle.workspaceId, input.workspaceId),
					),
				)
				.limit(1)
				.for("update");
			return {
				ok: false,
				code: otherTeamTarget ? "TEAM_MISMATCH" : "INVALID_ROLLOVER_TARGET",
			};
		}
		if (target.state !== "planned" && target.state !== "active") {
			return { ok: false, code: "INVALID_ROLLOVER_TARGET" };
		}
	}

	const members = await tx
		.select({
			canonicalCategory: issueStatusGroup.canonicalCategory,
			estimate: issue.estimate,
			id: issue.id,
			issueTypeId: issue.issueTypeId,
		})
		.from(issue)
		.innerJoin(issueStatus, eq(issue.statusId, issueStatus.id))
		.innerJoin(
			issueStatusGroup,
			eq(issueStatus.statusGroupId, issueStatusGroup.id),
		)
		.where(
			and(
				eq(issue.workspaceId, input.workspaceId),
				eq(issue.teamId, input.teamId),
				eq(issue.cycleId, source.id),
			),
		)
		.orderBy(asc(issue.id))
		.for("update");

	const counts: CompletionCounts = {
		canceled: 0,
		carriedOver: 0,
		completed: 0,
		returnedToBacklog: 0,
	};
	const affectedIssueIds: string[] = [];
	for (const member of members) {
		if (member.canonicalCategory === "completed") {
			counts.completed += 1;
			continue;
		}
		if (member.canonicalCategory === "canceled") {
			counts.canceled += 1;
			continue;
		}

		const shouldCarry =
			input.disposition.type === "carryOver" &&
			(member.canonicalCategory === "planned" ||
				member.canonicalCategory === "in_progress");
		const nextCycleId = shouldCarry ? (target?.id ?? null) : null;
		await tx
			.update(issue)
			.set({ cycleId: nextCycleId })
			.where(eq(issue.id, member.id));

		if (nextCycleId && target) {
			counts.carriedOver += 1;
			await writeIssueActivity(tx, {
				workspaceId: input.workspaceId,
				teamId: input.teamId,
				issueId: member.id,
				actorId: input.actorId,
				cycleId: target.id,
				actionType: "issue.cycle_rolled_over",
				field: "cycleId",
				fromValue: source.id,
				toValue: target.id,
				metadata: {
					estimate: member.estimate,
					issueTypeId: member.issueTypeId,
					fromCycleId: source.id,
					fromCycleName: source.name,
					reason: input.reason,
					toCycleId: target.id,
					toCycleName: target.name,
				},
			});
		} else {
			counts.returnedToBacklog += 1;
			await writeIssueActivity(tx, {
				workspaceId: input.workspaceId,
				teamId: input.teamId,
				issueId: member.id,
				actorId: input.actorId,
				cycleId: source.id,
				actionType: "issue.cycle_returned_to_backlog",
				field: "cycleId",
				fromValue: source.id,
				toValue: null,
				metadata: {
					estimate: member.estimate,
					issueTypeId: member.issueTypeId,
					fromCycleId: source.id,
					fromCycleName: source.name,
					reason: input.reason,
				},
			});
		}
		affectedIssueIds.push(member.id);
	}

	const [completedSource] = await tx
		.update(cycle)
		.set({ state: "completed" })
		.where(eq(cycle.id, source.id))
		.returning();
	if (!completedSource) return { ok: false, code: "NOT_FOUND" };

	return {
		ok: true,
		affectedIssueIds,
		counts,
		destinationCycleId: target?.id ?? null,
		source: completedSource,
		target,
	};
}

/** Completes one active cycle and atomically disposes of its open membership. */
export async function completeCycle(
	input: CycleCompletionInput,
): Promise<CompletionResult> {
	return db.transaction((tx) => completeInTransaction(tx, input));
}
