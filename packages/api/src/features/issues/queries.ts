import { db } from "db";

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

export function generateMockEmbedding(query: string): number[] {
	const seed = query
		.split("")
		.reduce((acc, char) => acc + char.charCodeAt(0), 0);
	const vector: number[] = [];
	for (let i = 0; i < 1536; i++) {
		const value =
			Math.sin(seed + i * 0.1) * 0.5 + Math.cos(seed + i * 0.05) * 0.5;
		vector.push(Math.max(-1, Math.min(1, value)));
	}
	return vector;
}
