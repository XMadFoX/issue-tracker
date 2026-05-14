import { defineRelationsPart } from "drizzle-orm";
import * as schema from "../../schema";

export const issueActivityRelations = defineRelationsPart(schema, (r) => ({
	issueActivity: {
		workspace: r.one.workspace({
			from: r.issueActivity.workspaceId,
			to: r.workspace.id,
		}),
		team: r.one.team({
			from: r.issueActivity.teamId,
			to: r.team.id,
		}),
		issue: r.one.issue({
			from: r.issueActivity.issueId,
			to: r.issue.id,
		}),
		actor: r.one.user({
			from: r.issueActivity.actorId,
			to: r.user.id,
		}),
		cycle: r.one.cycle({
			from: r.issueActivity.cycleId,
			to: r.cycle.id,
		}),
	},
}));
