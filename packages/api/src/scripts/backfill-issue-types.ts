import { db } from "db";
import { issue } from "db/features/tracker/issues.schema";
import { workspace } from "db/features/tracker/tracker.schema";
import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";
import { ensureDefaultIssueTypes } from "../features/issue-types/defaults";

const DEFAULT_BATCH_SIZE = 500;

function getNumberFlag(flagName: string, fallback: number) {
	const flagPrefix = `--${flagName}=`;
	const flag = Bun.argv.find((arg) => arg.startsWith(flagPrefix));
	if (!flag) {
		return fallback;
	}

	const value = Number(flag.slice(flagPrefix.length));
	return Number.isFinite(value) && value > 0 ? value : fallback;
}

function printHelp() {
	console.info(`Backfill issue types for existing workspaces.

Usage:
  bun --env-file=.env packages/api/src/scripts/backfill-issue-types.ts --dry-run
  bun --env-file=.env packages/api/src/scripts/backfill-issue-types.ts --batch-size=500

The script ensures each workspace has global Task/Bug/Feature/Chore issue types,
then assigns nullable issue.issue_type_id rows to that workspace's Task type.
Run with --dry-run first. Before later NOT NULL enforcement, the readiness check
must report zero remaining rows where issue.issue_type_id is null.`);
}

async function countNullIssueTypes() {
	const [row] = await db
		.select({ count: sql<number>`count(*)::int` })
		.from(issue)
		.where(isNull(issue.issueTypeId));

	return row?.count ?? 0;
}

const DRY_RUN_ROLLBACK = Symbol("dry-run-rollback");

async function backfillWorkspace({
	workspaceId,
	batchSize,
	dryRun,
}: {
	workspaceId: string;
	batchSize: number;
	dryRun: boolean;
}) {
	let updated = 0;
	let batches = 0;
	let insertedDefaults = 0;
	let defaultsFound = 0;
	let ensuredTaskIssueTypeId: string | null = null;

	try {
		await db.transaction(async (tx) => {
			const { taskIssueTypeId, insertedIssueTypes } =
				await ensureDefaultIssueTypes({
					executor: tx,
					workspaceId,
				});
			insertedDefaults = insertedIssueTypes.length;
			defaultsFound = 4 - insertedIssueTypes.length;
			ensuredTaskIssueTypeId = taskIssueTypeId;

			if (dryRun) {
				const [row] = await tx
					.select({ count: sql<number>`count(*)::int` })
					.from(issue)
					.where(
						and(eq(issue.workspaceId, workspaceId), isNull(issue.issueTypeId)),
					);
				updated = row?.count ?? 0;
				batches = Math.ceil(updated / batchSize);
				throw DRY_RUN_ROLLBACK;
			}

			for (;;) {
				const rows = await tx
					.select({ id: issue.id })
					.from(issue)
					.where(
						and(eq(issue.workspaceId, workspaceId), isNull(issue.issueTypeId)),
					)
					.orderBy(asc(issue.createdAt), asc(issue.id))
					.limit(batchSize);

				if (rows.length === 0) {
					break;
				}

				batches += 1;

				const updatedRows = await tx
					.update(issue)
					.set({ issueTypeId: taskIssueTypeId })
					.where(
						and(
							eq(issue.workspaceId, workspaceId),
							isNull(issue.issueTypeId),
							inArray(
								issue.id,
								rows.map((row) => row.id),
							),
						),
					)
					.returning({ id: issue.id });

				updated += updatedRows.length;
			}
		});
	} catch (error) {
		if (error !== DRY_RUN_ROLLBACK) {
			throw error;
		}
	}

	return {
		updated,
		batches,
		insertedDefaults,
		defaultsFound,
		taskIssueTypeId: ensuredTaskIssueTypeId,
	};
}

async function main() {
	if (Bun.argv.includes("--help")) {
		printHelp();
		return;
	}

	const dryRun = Bun.argv.includes("--dry-run");
	const batchSize = getNumberFlag("batch-size", DEFAULT_BATCH_SIZE);
	let scanned = 0;
	let updated = 0;
	let defaultsInserted = 0;
	let defaultsFound = 0;
	let failed = 0;
	const failedWorkspaceIds: string[] = [];

	console.info(
		`Backfilling issue types (batch-size=${batchSize}, dry-run=${dryRun})`,
	);

	const workspaces = await db
		.select({ id: workspace.id })
		.from(workspace)
		.orderBy(asc(workspace.createdAt), asc(workspace.id));

	for (const row of workspaces) {
		scanned += 1;
		try {
			const result = await backfillWorkspace({
				workspaceId: row.id,
				batchSize,
				dryRun,
			});
			updated += result.updated;
			defaultsInserted += result.insertedDefaults;
			defaultsFound += result.defaultsFound;
			const defaultsInsertedLabel = dryRun
				? "defaults-would-insert"
				: "defaults-inserted";
			console.info(
				`Workspace ${row.id}: task=${result.taskIssueTypeId}, defaults-found=${result.defaultsFound}, ${defaultsInsertedLabel}=${result.insertedDefaults}, batches=${result.batches}, issues-${dryRun ? "would-update" : "updated"}=${result.updated}`,
			);
		} catch (error) {
			failed += 1;
			failedWorkspaceIds.push(row.id);
			console.error(
				`Failed workspace ${row.id}: ${error instanceof Error ? error.message : String(error)}`,
			);
		}
	}

	const remainingNullIssueTypes = dryRun
		? await countNullIssueTypes()
		: await countNullIssueTypes();
	console.info(
		`Finished: workspaces-scanned=${scanned}, defaults-found=${defaultsFound}, defaults-${dryRun ? "would-insert" : "inserted"}=${defaultsInserted}, issues-${dryRun ? "would-update" : "updated"}=${updated}, failed=${failed}, remaining-null-issue-types=${remainingNullIssueTypes}`,
	);
	console.info(
		"NOT NULL readiness check: remaining-null-issue-types must be 0 before enforcing issue.issue_type_id NOT NULL.",
	);

	if (failed > 0) {
		console.error(`Failed workspace ids: ${failedWorkspaceIds.join(", ")}`);
		process.exit(1);
	}
}

main().catch((error) => {
	console.error(error instanceof Error ? error.message : error);
	process.exit(1);
});
