import { db } from "db";
import { issue, issueLabel } from "db/features/tracker/issues.schema";
import { team } from "db/features/tracker/tracker.schema";
import type { SQL } from "drizzle-orm";
import { and, eq, exists, gte, inArray, isNull, lte, sql } from "drizzle-orm";
import type { z } from "zod";
import { env } from "../../env";
import { embedText } from "../../lib/ai";
import { parseIssueReferenceSearch } from "./reference-search";
import type { issueSearchSchema } from "./schema";

export async function getIssueWithRelations(id: string, workspaceId: string) {
	return db.query.issue.findFirst({
		where: {
			id,
			workspaceId,
		},
		with: {
			status: {
				with: {
					statusGroup: true,
				},
			},
			priority: true,
			assignee: true,
			team: true,
			labelLinks: {
				with: {
					label: true,
				},
			},
		},
	});
}

export type IssueWithRelations = NonNullable<
	Awaited<ReturnType<typeof getIssueWithRelations>>
>;

export type SearchIssueResult = IssueWithRelations & {
	status?: IssueWithRelations["status"];
	priority?: IssueWithRelations["priority"];
	assignee?: IssueWithRelations["assignee"];
	team?: IssueWithRelations["team"];
	labelLinks?: IssueWithRelations["labelLinks"];
	debug?: {
		score: number;
		ftsScore: number;
		trigramScore: number;
		semanticScore: number;
	};
};

const EMBEDDINGS_ENABLED = env.ENABLE_EMBEDDINGS;

type IssueSearchScope = {
	accessibleTeamIds?: Array<string>;
};

function buildIssueSearchWhere(input: {
	workspaceId: string;
	teamId?: string | null;
	statusId?: string | null;
	assigneeId?: string | null;
	priorityId?: string | null;
	reporterId?: string | null;
	creatorId?: string | null;
	rawConditions: Array<SQL>;
}) {
	const rawWhere =
		input.rawConditions.length > 0
			? { RAW: () => and(...input.rawConditions) ?? sql`true` }
			: {};

	return {
		workspaceId: input.workspaceId,
		...(input.teamId ? { teamId: input.teamId } : {}),
		...(input.statusId ? { statusId: input.statusId } : {}),
		...(input.assigneeId ? { assigneeId: input.assigneeId } : {}),
		...(input.priorityId ? { priorityId: input.priorityId } : {}),
		...(input.reporterId ? { reporterId: input.reporterId } : {}),
		...(input.creatorId ? { creatorId: input.creatorId } : {}),
		...rawWhere,
	};
}

export async function searchIssues(
	input: z.infer<typeof issueSearchSchema>,
	scope: IssueSearchScope = {},
) {
	const {
		workspaceId,
		query: searchQuery,
		mode,
		includeArchived,
		options,
		filters = {},
	} = input;

	const {
		teamId,
		statusId,
		assigneeId,
		priorityId,
		reporterId,
		creatorId,
		createdAtFrom,
		createdAtTo,
		dueDateFrom,
		dueDateTo,
		labelIds,
	} = filters;

	const {
		includeStatus = false,
		includeStatusGroup = false,
		includePriority = false,
		includeAssignee = false,
		includeTeam = false,
		includeLabels = false,
		includeDebugInfo = false,
		minScore = 0.2,
		embeddingThreshold = 0.7,
	} = options ?? {};

	const searchMode =
		!EMBEDDINGS_ENABLED && mode === "semantic" ? "trigram" : mode;
	const shouldCalculateSemantic =
		EMBEDDINGS_ENABLED && (mode === "semantic" || mode === "hybrid");
	const rawConditions: Array<SQL> = [];

	if (!teamId && scope.accessibleTeamIds) {
		if (scope.accessibleTeamIds.length === 0) return [];
		rawConditions.push(inArray(issue.teamId, scope.accessibleTeamIds));
	}
	if (createdAtFrom) {
		rawConditions.push(gte(issue.createdAt, new Date(createdAtFrom)));
	}
	if (createdAtTo) {
		rawConditions.push(lte(issue.createdAt, new Date(createdAtTo)));
	}
	if (dueDateFrom) {
		rawConditions.push(gte(issue.dueDate, new Date(dueDateFrom)));
	}
	if (dueDateTo) {
		rawConditions.push(lte(issue.dueDate, new Date(dueDateTo)));
	}

	if (!includeArchived) {
		rawConditions.push(isNull(issue.archivedAt));
	}

	if (labelIds?.length) {
		rawConditions.push(
			exists(
				db
					.select({ one: sql`1` })
					.from(issueLabel)
					.where(
						and(
							eq(issueLabel.issueId, issue.id),
							inArray(issueLabel.labelId, labelIds),
						),
					),
			),
		);
	}

	const withClause: {
		status?: { with: { statusGroup: true } } | true;
		priority?: true;
		assignee?: true;
		team?: true;
		labelLinks?: { with: { label: true } };
	} = {
		...(includeStatus
			? { status: includeStatusGroup ? { with: { statusGroup: true } } : true }
			: {}),
		...(includePriority ? { priority: true } : {}),
		...(includeAssignee ? { assignee: true } : {}),
		...(includeTeam ? { team: true } : {}),
		...(includeLabels ? { labelLinks: { with: { label: true } } } : {}),
	};

	const teamConditions = [eq(team.workspaceId, workspaceId)];
	if (teamId) teamConditions.push(eq(team.id, teamId));
	if (!teamId && scope.accessibleTeamIds) {
		teamConditions.push(inArray(team.id, scope.accessibleTeamIds));
	}

	const searchableTeams = await db
		.select({ id: team.id, key: team.key })
		.from(team)
		.where(and(...teamConditions));
	const referenceSearch = parseIssueReferenceSearch(
		searchQuery,
		searchableTeams,
	);

	if (referenceSearch?.kind === "number") {
		rawConditions.push(eq(issue.number, referenceSearch.number));

		return await db.query.issue.findMany({
			where: buildIssueSearchWhere({
				workspaceId,
				teamId,
				statusId,
				assigneeId,
				priorityId,
				reporterId,
				creatorId,
				rawConditions,
			}),
			with: withClause,
			orderBy: {
				updatedAt: "desc",
			},
			limit: 50,
		});
	}

	if (
		referenceSearch?.kind === "teamNumber" &&
		referenceSearch.candidates.length > 0
	) {
		let referenceCondition = sql`false`;
		for (const candidate of referenceSearch.candidates) {
			referenceCondition = sql`${referenceCondition} OR (${issue.teamId} = ${candidate.teamId} AND ${issue.number} = ${candidate.number})`;
		}
		rawConditions.push(sql`(${referenceCondition})`);

		return await db.query.issue.findMany({
			where: buildIssueSearchWhere({
				workspaceId,
				teamId,
				statusId,
				assigneeId,
				priorityId,
				reporterId,
				creatorId,
				rawConditions,
			}),
			with: withClause,
			orderBy: {
				updatedAt: "desc",
			},
			limit: 50,
		});
	}

	const queryEmbedding = shouldCalculateSemantic
		? await embedText(searchQuery)
		: null;

	const ftsScore = sql<number>`
		CASE WHEN ${searchMode} IN ('fts', 'hybrid')
		THEN COALESCE(ts_rank_cd(${issue.searchVector}, websearch_to_tsquery('english', ${searchQuery})), 0)
		ELSE 0 END
	`;

	const trigramScore = sql<number>`
		CASE WHEN ${searchMode} IN ('trigram', 'hybrid')
		THEN COALESCE(similarity(${issue.searchText}, ${searchQuery}), 0)
		ELSE 0 END
	`;

	const semanticScore =
		shouldCalculateSemantic && queryEmbedding
			? sql<number>`
				CASE WHEN ${searchMode} IN ('semantic', 'hybrid')
				THEN COALESCE(
					CASE WHEN 1 - (${issue.embedding} <=> ${JSON.stringify(queryEmbedding)}::vector) >= ${embeddingThreshold}
					THEN 1 - (${issue.embedding} <=> ${JSON.stringify(queryEmbedding)}::vector)
					ELSE 0 END,
					0
				)
				ELSE 0 END
			`
			: sql<number>`0`;

	const hybridScore = EMBEDDINGS_ENABLED
		? sql<number>`
			CASE ${searchMode}
				WHEN 'fts' THEN ${ftsScore}
				WHEN 'trigram' THEN ${trigramScore}
				WHEN 'semantic' THEN ${semanticScore}
				WHEN 'hybrid' THEN (${ftsScore} + ${trigramScore} + ${semanticScore}) / 3.0
			END
		`
		: sql<number>`
			CASE ${searchMode}
				WHEN 'fts' THEN ${ftsScore}
				WHEN 'trigram' THEN ${trigramScore}
				WHEN 'semantic' THEN ${semanticScore}
				WHEN 'hybrid' THEN (${ftsScore} + ${trigramScore}) / 2.0
			END
	`;

	const scoreCondition =
		minScore > 0 ? sql`(${hybridScore}) >= ${minScore}` : undefined;

	if (scoreCondition) {
		rawConditions.push(scoreCondition);
	}

	const results = await db.query.issue.findMany({
		where: buildIssueSearchWhere({
			workspaceId,
			teamId,
			statusId,
			assigneeId,
			priorityId,
			reporterId,
			creatorId,
			rawConditions,
		}),
		with: withClause,
		orderBy: {
			updatedAt: "desc",
		},
		limit: 50,
	});

	if (!includeDebugInfo || results.length === 0) {
		return results;
	}

	const resultIds = results.map((result) => result.id);
	const debugRows = await db
		.select({
			id: issue.id,
			score: hybridScore,
			ftsScore,
			trigramScore,
			semanticScore,
		})
		.from(issue)
		.where(
			and(eq(issue.workspaceId, workspaceId), inArray(issue.id, resultIds)),
		);

	const debugById = new Map(
		debugRows.map((row) => [
			row.id,
			{
				score: row.score,
				ftsScore: row.ftsScore,
				trigramScore: row.trigramScore,
				semanticScore: row.semanticScore,
			},
		]),
	);

	return results.map((result) => ({
		...result,
		debug: debugById.get(result.id),
	}));
}
