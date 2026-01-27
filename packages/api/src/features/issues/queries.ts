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
