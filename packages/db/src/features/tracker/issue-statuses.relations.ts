import { defineRelationsPart } from "drizzle-orm";
import * as schema from "../../schema";

export const issueStatusRelations = defineRelationsPart(schema, (r) => ({
	issueStatusGroup: {
		statuses: r.many.issueStatus(),
	},
	issueStatus: {
		workspace: r.one.workspace({
			from: r.issueStatus.workspaceId,
			to: r.workspace.id,
		}),
		team: r.one.team({
			from: r.issueStatus.teamId,
			to: r.team.id,
		}),
		statusGroup: r.one.issueStatusGroup({
			from: r.issueStatus.statusGroupId,
			to: r.issueStatusGroup.id,
		}),
	},
}));
