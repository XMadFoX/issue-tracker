import {
	foreignKey,
	index,
	jsonb,
	pgEnum,
	pgTable,
	text,
	timestamp,
} from "drizzle-orm/pg-core";
import { user } from "../auth/auth.schema";
import { cycle } from "./cycles.schema";
import { issue } from "./issues.schema";
import { team, workspace } from "./tracker.schema";

export const issueActivityActionTypeEnum = pgEnum(
	"issue_activity_action_type",
	[
		"issue.created",
		"issue.updated",
		"issue.status_changed",
		"issue.estimate_changed",
		"issue.cycle_assigned",
		"issue.cycle_unassigned",
		"issue.cycle_rolled_over",
		"issue.cycle_returned_to_backlog",
	],
);

export type IssueActivityJson =
	| string
	| number
	| boolean
	| null
	| IssueActivityJson[]
	| { [key: string]: IssueActivityJson };

export const issueActivity = pgTable(
	"issue_activity",
	{
		id: text("id").primaryKey(),
		workspaceId: text("workspace_id")
			.notNull()
			.references(() => workspace.id, { onDelete: "cascade" }),
		teamId: text("team_id").notNull(),
		issueId: text("issue_id").notNull(),
		actorId: text("actor_id").references(() => user.id, {
			onDelete: "set null",
		}),
		cycleId: text("cycle_id").references(() => cycle.id, {
			onDelete: "set null",
		}),
		actionType: issueActivityActionTypeEnum("action_type").notNull(),
		field: text("field"),
		fromValue: jsonb("from_value").$type<IssueActivityJson>(),
		toValue: jsonb("to_value").$type<IssueActivityJson>(),
		metadata: jsonb("metadata").$type<IssueActivityJson>(),
		createdAt: timestamp("created_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
	},
	(table) => [
		index("issue_activity_workspace_issue_created_idx").on(
			table.workspaceId,
			table.issueId,
			table.createdAt,
		),
		index("issue_activity_workspace_team_created_idx").on(
			table.workspaceId,
			table.teamId,
			table.createdAt,
		),
		index("issue_activity_workspace_action_created_idx").on(
			table.workspaceId,
			table.actionType,
			table.createdAt,
		),
		index("issue_activity_workspace_cycle_created_idx").on(
			table.workspaceId,
			table.cycleId,
			table.createdAt,
		),
		foreignKey({
			name: "issue_activity_team_workspace_fkey",
			columns: [table.teamId, table.workspaceId],
			foreignColumns: [team.id, team.workspaceId],
		}).onDelete("cascade"),
		foreignKey({
			name: "issue_activity_issue_workspace_team_fkey",
			columns: [table.issueId, table.workspaceId, table.teamId],
			foreignColumns: [issue.id, issue.workspaceId, issue.teamId],
		}).onDelete("cascade"),
		foreignKey({
			name: "issue_activity_cycle_workspace_team_fkey",
			columns: [table.cycleId, table.workspaceId, table.teamId],
			foreignColumns: [cycle.id, cycle.workspaceId, cycle.teamId],
		}),
	],
);
