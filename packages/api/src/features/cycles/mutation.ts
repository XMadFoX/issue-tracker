import type { db } from "db";
import { cycle } from "db/features/tracker/cycles.schema";
import { and, eq, gt, lt, max, ne, sql } from "drizzle-orm";

type DbTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

export type CycleTransaction = DbTransaction;

export async function lockCycleTeam({
	tx,
	workspaceId,
	teamId,
}: {
	tx: CycleTransaction;
	workspaceId: string;
	teamId: string;
}): Promise<void> {
	await tx.execute(
		sql`select pg_advisory_xact_lock(hashtext(${`cycle:${workspaceId}:${teamId}`}))`,
	);
}

export async function getOverlappingCycle({
	tx,
	workspaceId,
	teamId,
	startDate,
	endDate,
	excludeCycleId,
}: {
	tx: CycleTransaction;
	workspaceId: string;
	teamId: string;
	startDate: Date;
	endDate: Date;
	excludeCycleId?: string;
}) {
	const conditions = [
		eq(cycle.workspaceId, workspaceId),
		eq(cycle.teamId, teamId),
		ne(cycle.state, "canceled"),
		lt(cycle.startDate, endDate),
		gt(cycle.endDate, startDate),
	];
	if (excludeCycleId) conditions.push(ne(cycle.id, excludeCycleId));

	const [overlap] = await tx
		.select()
		.from(cycle)
		.where(and(...conditions))
		.limit(1)
		.for("update");
	return overlap ?? null;
}

export async function getNextCycleSequence({
	tx,
	workspaceId,
	teamId,
}: {
	tx: CycleTransaction;
	workspaceId: string;
	teamId: string;
}): Promise<number> {
	const [maxRow] = await tx
		.select({ sequence: max(cycle.sequence) })
		.from(cycle)
		.where(and(eq(cycle.workspaceId, workspaceId), eq(cycle.teamId, teamId)));
	return (maxRow?.sequence ?? 0) + 1;
}
