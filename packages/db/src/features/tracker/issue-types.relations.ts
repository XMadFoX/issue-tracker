import { defineRelationsPart } from "drizzle-orm";
import * as schema from "../../schema";

export const issueTypeRelations = defineRelationsPart(schema, (r) => ({
	issueType: {
		workspace: r.one.workspace({
			from: r.issueType.workspaceId,
			to: r.workspace.id,
		}),
		team: r.one.team({ from: r.issueType.teamId, to: r.team.id }),
		issues: r.many.issue(),
		sourceOverrides: r.many.issueTypeTeamOverride({
			from: r.issueType.id,
			to: r.issueTypeTeamOverride.sourceIssueTypeId,
			alias: "SourceIssueType",
		}),
		replacementOverrides: r.many.issueTypeTeamOverride({
			from: r.issueType.id,
			to: r.issueTypeTeamOverride.replacementIssueTypeId,
			alias: "ReplacementIssueType",
		}),
		allowedStatuses: r.many.issueTypeAllowedStatus(),
	},
	issueTypeTeamOverride: {
		workspace: r.one.workspace({
			from: r.issueTypeTeamOverride.workspaceId,
			to: r.workspace.id,
		}),
		team: r.one.team({
			from: r.issueTypeTeamOverride.teamId,
			to: r.team.id,
		}),
		sourceIssueType: r.one.issueType({
			from: r.issueTypeTeamOverride.sourceIssueTypeId,
			to: r.issueType.id,
			alias: "SourceIssueType",
		}),
		replacementIssueType: r.one.issueType({
			from: r.issueTypeTeamOverride.replacementIssueTypeId,
			to: r.issueType.id,
			alias: "ReplacementIssueType",
		}),
	},
	issueTypeAllowedStatus: {
		workspace: r.one.workspace({
			from: r.issueTypeAllowedStatus.workspaceId,
			to: r.workspace.id,
		}),
		team: r.one.team({
			from: r.issueTypeAllowedStatus.teamId,
			to: r.team.id,
		}),
		issueType: r.one.issueType({
			from: r.issueTypeAllowedStatus.issueTypeId,
			to: r.issueType.id,
		}),
		issueStatus: r.one.issueStatus({
			from: r.issueTypeAllowedStatus.statusId,
			to: r.issueStatus.id,
		}),
	},
}));
