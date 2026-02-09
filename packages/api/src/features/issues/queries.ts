import { db } from "db";
import { issue, issueLabel } from "db/features/tracker/issues.schema";
import { and, eq, exists, gte, inArray, isNull, lte, sql } from "drizzle-orm";
import type { z } from "zod";
import { embedText } from "../../lib/ai";
import type { issueSearchSchema } from "./schema";

export async function getIssueWithRelations(id: string, workspaceId: string) {
	return db.query.issue.findFirst({
		where: (issueTable, { eq, and }) =>
			and(eq(issueTable.id, id), eq(issueTable.workspaceId, workspaceId)),
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
};

export async function searchIssues(input: z.infer<typeof issueSearchSchema>) {
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
		minScore = 0,
		embeddingThreshold = 0.7,
	} = options ?? {};

	const queryEmbedding = embedText(searchQuery);
	const conditions = [eq(issue.workspaceId, workspaceId)];

	if (teamId) conditions.push(eq(issue.teamId, teamId));
	if (statusId) conditions.push(eq(issue.statusId, statusId));
	if (assigneeId) conditions.push(eq(issue.assigneeId, assigneeId));
	if (priorityId) conditions.push(eq(issue.priorityId, priorityId));
	if (reporterId) conditions.push(eq(issue.reporterId, reporterId));
	if (creatorId) conditions.push(eq(issue.creatorId, creatorId));
	if (createdAtFrom)
		conditions.push(gte(issue.createdAt, new Date(createdAtFrom)));
	if (createdAtTo) conditions.push(lte(issue.createdAt, new Date(createdAtTo)));
	if (dueDateFrom) conditions.push(gte(issue.dueDate, new Date(dueDateFrom)));
	if (dueDateTo) conditions.push(lte(issue.dueDate, new Date(dueDateTo)));

	if (!includeArchived) {
		conditions.push(isNull(issue.archivedAt));
	}

	if (labelIds?.length) {
		conditions.push(
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

	const ftsScore = sql<number>`
		CASE WHEN ${mode} IN ('fts', 'hybrid')
		THEN COALESCE(ts_rank_cd(${issue.searchVector}, websearch_to_tsquery('english', ${searchQuery})), 0)
		ELSE 0 END
	`;

	const trigramScore = sql<number>`
		CASE WHEN ${mode} IN ('trigram', 'hybrid')
		THEN COALESCE(similarity(${issue.searchText}, ${searchQuery}), 0)
		ELSE 0 END
	`;

	const semanticScore = sql<number>`
		CASE WHEN ${mode} IN ('semantic', 'hybrid')
		THEN COALESCE(
			CASE WHEN 1 - (${issue.embedding} <=> ${JSON.stringify(queryEmbedding)}::vector) >= ${embeddingThreshold}
			THEN 1 - (${issue.embedding} <=> ${JSON.stringify(queryEmbedding)}::vector)
			ELSE 0 END,
			0
		)
		ELSE 0 END
	`;

	const hybridScore = sql<number>`
		CASE ${mode}
			WHEN 'fts' THEN ${ftsScore}
			WHEN 'trigram' THEN ${trigramScore}
			WHEN 'semantic' THEN ${semanticScore}
			WHEN 'hybrid' THEN (${ftsScore} + ${trigramScore} + ${semanticScore}) / 3.0
		END
	`;

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

	const scoreCondition =
		minScore > 0 ? sql`(${hybridScore}) >= ${minScore}` : undefined;

	if (scoreCondition) {
		conditions.push(scoreCondition);
	}

	const results = await db.query.issue.findMany({
		where: (_issueTable, { and }) => and(...conditions),
		with: withClause,
		orderBy: [sql`(${hybridScore}) DESC`, sql`${issue.updatedAt} DESC`],
		limit: 50,
	});

	return results;
}
