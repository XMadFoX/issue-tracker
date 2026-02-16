import { db } from "db";
import { issue } from "db/features/tracker/issues.schema";
import { asc, eq, sql } from "drizzle-orm";
import { buildIssueSearchText } from "../features/issues/search-fields";
import { embedText } from "../lib/ai";

const DEFAULT_BATCH_SIZE = 200;
const DEFAULT_CONCURRENCY = 6;
const MAX_LOGGED_ERRORS = 20;

type IssueSeedRow = {} & Pick<
	typeof issue.$inferSelect,
	"id" | "title" | "description" | "searchText"
> & {
		hasSearchVector: boolean;
		hasEmbedding: boolean;
	};

function getNumberFlag(flagName: string, fallback: number) {
	const flagPrefix = `--${flagName}=`;
	const flag = Bun.argv.find((arg) => arg.startsWith(flagPrefix));
	if (!flag) {
		return fallback;
	}

	const value = Number(flag.slice(flagPrefix.length));
	return Number.isFinite(value) && value > 0 ? value : fallback;
}

async function runWithConcurrency<T>(
	items: readonly T[],
	concurrency: number,
	worker: (item: T) => Promise<void>,
) {
	let nextIndex = 0;
	const workerCount = Math.max(1, Math.min(concurrency, items.length));
	const runners = Array.from({ length: workerCount }, async () => {
		while (nextIndex < items.length) {
			const currentIndex = nextIndex;
			nextIndex += 1;
			const currentItem = items[currentIndex];
			if (currentItem === undefined) {
				continue;
			}
			await worker(currentItem);
		}
	});

	await Promise.all(runners);
}

async function main() {
	const dryRun = Bun.argv.includes("--dry-run");
	const force = Bun.argv.includes("--force");
	const batchSize = getNumberFlag("batch-size", DEFAULT_BATCH_SIZE);
	const concurrency = getNumberFlag("concurrency", DEFAULT_CONCURRENCY);
	const startedAt = Date.now();

	let scanned = 0;
	let updated = 0;
	let cleared = 0;
	let skipped = 0;
	let failed = 0;
	let offset = 0;
	const failedIssueIds: string[] = [];
	const embeddingCache = new Map<string, Promise<number[]>>();

	const getEmbedding = (text: string) => {
		const cached = embeddingCache.get(text);
		if (cached) {
			return cached;
		}

		const next = embedText(text);
		embeddingCache.set(text, next);
		return next;
	};

	console.info(
		`Seeding issue search data (batch-size=${batchSize}, concurrency=${concurrency}, dry-run=${dryRun}, force=${force})`,
	);

	for (;;) {
		const rows = await db
			.select({
				id: issue.id,
				title: issue.title,
				description: issue.description,
				searchText: issue.searchText,
				hasSearchVector: sql<boolean>`${issue.searchVector} is not null`.as(
					"has_search_vector",
				),
				hasEmbedding: sql<boolean>`${issue.embedding} is not null`.as(
					"has_embedding",
				),
			})
			.from(issue)
			.orderBy(asc(issue.createdAt), asc(issue.id))
			.limit(batchSize)
			.offset(offset);

		if (rows.length === 0) {
			break;
		}

		const batchRows: IssueSeedRow[] = rows;
		scanned += batchRows.length;

		await runWithConcurrency(batchRows, concurrency, async (row) => {
			try {
				const nextSearchText = buildIssueSearchText({
					title: row.title,
					description: row.description,
				});

				if (!nextSearchText) {
					if (!dryRun) {
						await db
							.update(issue)
							.set({
								searchText: null,
								searchVector: null,
								embedding: null,
							})
							.where(eq(issue.id, row.id));
					}
					cleared += 1;
					return;
				}

				if (
					!force &&
					row.searchText === nextSearchText &&
					row.hasSearchVector &&
					row.hasEmbedding
				) {
					skipped += 1;
					return;
				}

				const embedding = await getEmbedding(nextSearchText);
				if (!dryRun) {
					await db
						.update(issue)
						.set({
							searchText: nextSearchText,
							searchVector: sql<string>`to_tsvector('english', ${nextSearchText})`,
							embedding,
						})
						.where(eq(issue.id, row.id));
				}

				updated += 1;
			} catch (error) {
				failed += 1;
				if (failedIssueIds.length < MAX_LOGGED_ERRORS) {
					failedIssueIds.push(row.id);
				}
				console.error(
					`Failed processing issue ${row.id}: ${
						error instanceof Error ? error.message : String(error)
					}`,
				);
			}
		});

		offset += batchRows.length;
		console.info(
			`Processed ${scanned} issues (updated=${updated}, skipped=${skipped}, cleared=${cleared}, failed=${failed})`,
		);
	}

	const durationMs = Date.now() - startedAt;
	console.info(
		`Done in ${durationMs}ms (scanned=${scanned}, updated=${updated}, skipped=${skipped}, cleared=${cleared}, failed=${failed})`,
	);

	if (failedIssueIds.length > 0) {
		console.error(`First failed issue IDs: ${failedIssueIds.join(", ")}`);
	}

	if (failed > 0) {
		process.exitCode = 1;
	}
}

await main();
