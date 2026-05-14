import { defineRelationsPart } from "drizzle-orm";
import * as schema from "../../schema";

export const issueRelations = defineRelationsPart(schema, (r) => ({
	issue: {
		workspace: r.one.workspace({
			from: r.issue.workspaceId,
			to: r.workspace.id,
		}),
		team: r.one.team({ from: r.issue.teamId, to: r.team.id }),
		status: r.one.issueStatus({ from: r.issue.statusId, to: r.issueStatus.id }),
		priority: r.one.issuePriority({
			from: r.issue.priorityId,
			to: r.issuePriority.id,
		}),
		cycle: r.one.cycle({ from: r.issue.cycleId, to: r.cycle.id }),
		assignee: r.one.user({ from: r.issue.assigneeId, to: r.user.id }),
		reporter: r.one.user({ from: r.issue.reporterId, to: r.user.id }),
		creator: r.one.user({ from: r.issue.creatorId, to: r.user.id }),
		parent: r.one.issue({
			from: r.issue.parentIssueId,
			to: r.issue.id,
			alias: "ParentIssue",
		}),
		subIssues: r.many.issue({ alias: "ParentIssue" }),
		labelLinks: r.many.issueLabel(),
		activities: r.many.issueActivity(),
	},
	issueLabel: {
		issue: r.one.issue({ from: r.issueLabel.issueId, to: r.issue.id }),
		label: r.one.label({ from: r.issueLabel.labelId, to: r.label.id }),
	},
}));
