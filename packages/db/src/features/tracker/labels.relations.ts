import { defineRelationsPart } from "drizzle-orm";
import * as schema from "../../schema";

export const labelRelations = defineRelationsPart(schema, (r) => ({
	label: {
		workspace: r.one.workspace({
			from: r.label.workspaceId,
			to: r.workspace.id,
		}),
		team: r.one.team({
			from: r.label.teamId,
			to: r.team.id,
		}),
		issueLinks: r.many.issueLabel({
			from: r.label.id,
			to: r.issueLabel.labelId,
		}),
	},
}));
