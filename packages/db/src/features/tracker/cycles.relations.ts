import { defineRelationsPart } from "drizzle-orm";
import * as schema from "../../schema";

export const cycleRelations = defineRelationsPart(schema, (r) => ({
	cycle: {
		workspace: r.one.workspace({
			from: r.cycle.workspaceId,
			to: r.workspace.id,
		}),
		team: r.one.team({
			from: r.cycle.teamId,
			to: r.team.id,
		}),
		issues: r.many.issue({
			from: r.cycle.id,
			to: r.issue.cycleId,
		}),
		activities: r.many.issueActivity({
			from: r.cycle.id,
			to: r.issueActivity.cycleId,
		}),
	},
}));
