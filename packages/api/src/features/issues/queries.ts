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
	});
}

export type IssueWithRelations = NonNullable<
	Awaited<ReturnType<typeof getIssueWithRelations>>
>;

export type SearchIssueResult = IssueWithRelations & {
	status?: IssueWithRelations["status"];
	issueType?: IssueWithRelations["issueType"];
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

type IssueConditionBuilder = (fields: typeof issue) => SQL | undefined;

export function buildIssueSearchWhere(input: {
	workspaceId: string;
	teamId?: string | null;
	statusId?: string | null;
	assigneeId?: string | null;
	priorityId?: string | null;
	issueTypeId?: string | null;
	reporterId?: string | null;
	creatorId?: string | null;
	rawConditions: Array<IssueConditionBuilder>;
}) {
	const rawWhere =
		input.rawConditions.length > 0
			? {
					RAW: (fields: typeof issue) =>
						and(...input.rawConditions.map((condition) => condition(fields))) ??
						sql`true`,
				}
			: {};

	return {
		workspaceId: input.workspaceId,
		...(input.teamId ? { teamId: input.teamId } : {}),
		...(input.statusId ? { statusId: input.statusId } : {}),
		...(input.assigneeId ? { assigneeId: input.assigneeId } : {}),
		...(input.priorityId ? { priorityId: input.priorityId } : {}),
		...(input.issueTypeId ? { issueTypeId: input.issueTypeId } : {}),
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
		issueTypeId,
		issueTypeIds,
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
		includeIssueType = false,
		includeDebugInfo = false,
		minScore = 0.2,
		embeddingThreshold = 0.7,
	} = options ?? {};

	const searchMode =
		!EMBEDDINGS_ENABLED && mode === "semantic" ? "trigram" : mode;
	const shouldCalculateSemantic =
		EMBEDDINGS_ENABLED && (mode === "semantic" || mode === "hybrid");
	const rawConditions: Array<IssueConditionBuilder> = [];

	if (!teamId && scope.accessibleTeamIds) {
		const accessibleTeamIds = scope.accessibleTeamIds;
		if (accessibleTeamIds.length === 0) return [];
		rawConditions.push((fields) => inArray(fields.teamId, accessibleTeamIds));
	}
	if (createdAtFrom) {
		rawConditions.push((fields) =>
			gte(fields.createdAt, new Date(createdAtFrom)),
		);
	}
	if (createdAtTo) {
		rawConditions.push((fields) =>
			lte(fields.createdAt, new Date(createdAtTo)),
		);
	}
	if (dueDateFrom) {
		rawConditions.push((fields) => gte(fields.dueDate, new Date(dueDateFrom)));
	}
	if (dueDateTo) {
		rawConditions.push((fields) => lte(fields.dueDate, new Date(dueDateTo)));
	}

	if (!includeArchived) {
		rawConditions.push((fields) => isNull(fields.archivedAt));
	}

	if (labelIds?.length) {
		rawConditions.push((fields) =>
			exists(
				db
					.select({ one: sql`1` })
					.from(issueLabel)
					.where(
						and(
							eq(issueLabel.issueId, fields.id),
							inArray(issueLabel.labelId, labelIds),
						),
					),
			),
		);
	}

	if (issueTypeIds && issueTypeIds.length > 0) {
		rawConditions.push((fields) => inArray(fields.issueTypeId, issueTypeIds));
	}

	const withClause: {
		status?: { with: { statusGroup: true } } | true;
		issueType?: true;
		priority?: true;
		assignee?: true;
		team?: true;
		labelLinks?: { with: { label: true } };
	} = {
		...(includeStatus
			? { status: includeStatusGroup ? { with: { statusGroup: true } } : true }
			: {}),
		...(includeIssueType ? { issueType: true } : {}),
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
		rawConditions.push((fields) => eq(fields.number, referenceSearch.number));

		return await db.query.issue.findMany({
			where: buildIssueSearchWhere({
				workspaceId,
				teamId,
				statusId,
				assigneeId,
				priorityId,
				issueTypeId,
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
		rawConditions.push((fields) => {
			let referenceCondition = sql`false`;
			for (const candidate of referenceSearch.candidates) {
				referenceCondition = sql`${referenceCondition} OR (${fields.teamId} = ${candidate.teamId} AND ${fields.number} = ${candidate.number})`;
			}
			return sql`(${referenceCondition})`;
		});

		return await db.query.issue.findMany({
			where: buildIssueSearchWhere({
				workspaceId,
				teamId,
				statusId,
				assigneeId,
				priorityId,
				issueTypeId,
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

	const buildSearchScores = (fields: typeof issue) => {
		const ftsScore = sql<number>`
			CASE WHEN ${searchMode} IN ('fts', 'hybrid')
			THEN COALESCE(ts_rank_cd(${fields.searchVector}, websearch_to_tsquery('english', ${searchQuery})), 0)
			ELSE 0 END
		`;

		const trigramScore = sql<number>`
			CASE WHEN ${searchMode} IN ('trigram', 'hybrid')
			THEN COALESCE(similarity(${fields.searchText}, ${searchQuery}), 0)
			ELSE 0 END
		`;

		const semanticScore =
			shouldCalculateSemantic && queryEmbedding
				? sql<number>`
					CASE WHEN ${searchMode} IN ('semantic', 'hybrid')
					THEN COALESCE(
						CASE WHEN 1 - (${fields.embedding} <=> ${JSON.stringify(queryEmbedding)}::vector) >= ${embeddingThreshold}
						THEN 1 - (${fields.embedding} <=> ${JSON.stringify(queryEmbedding)}::vector)
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

		return { ftsScore, trigramScore, semanticScore, hybridScore };
	};

	if (minScore > 0) {
		rawConditions.push(
			(fields) =>
				sql`(${buildSearchScores(fields).hybridScore}) >= ${minScore}`,
		);
	}

	const results = await db.query.issue.findMany({
		where: buildIssueSearchWhere({
			workspaceId,
			teamId,
			statusId,
			assigneeId,
			priorityId,
			issueTypeId,
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
	const debugScores = buildSearchScores(issue);
	const debugRows = await db
		.select({
			id: issue.id,
			score: debugScores.hybridScore,
			ftsScore: debugScores.ftsScore,
			trigramScore: debugScores.trigramScore,
			semanticScore: debugScores.semanticScore,
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
