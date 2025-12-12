import { relations, sql } from "drizzle-orm";
import {
	type AnyPgColumn,
	doublePrecision,
	index,
	integer,
	jsonb,
	pgTable,
	text,
	timestamp,
	uniqueIndex,
} from "drizzle-orm/pg-core";
import { user } from "../auth/auth.schema";
import { issuePriority } from "./issue-priorities.schema";
import { issueStatus } from "./issue-statuses.schema";
import { label } from "./labels.schema";
import { team, workspace } from "./tracker.schema";

export const issue = pgTable(
	"issue",
	{
		id: text("id").primaryKey(),
		workspaceId: text("workspace_id")
			.notNull()
			.references(() => workspace.id, { onDelete: "cascade" }),
		teamId: text("team_id")
			.notNull()
			.references(() => team.id, { onDelete: "cascade" }),
		// TODO: projectId: text("project_id").references(() => project.id, { onDelete: "set null" }),
		number: integer("number").notNull(),
		title: text("title").notNull(),
		description: jsonb("description"),
		statusId: text("status_id")
			.notNull()
			.references(() => issueStatus.id, { onDelete: "restrict" }),
		priorityId: text("priority_id").references(() => issuePriority.id, {
			onDelete: "set null",
		}),
		// TODO: cycleId: text("cycle_id").references(() => cycle.id, { onDelete: "set null" }),
		// TODO: estimate: integer("estimate"),
		dueDate: timestamp("due_date", { withTimezone: true }),
		// Sort Order (Lexorank style)
		sortOrder: doublePrecision("sort_order").notNull().default(0),
		assigneeId: text("assignee_id").references(() => user.id, {
			onDelete: "set null",
		}),
		reporterId: text("reporter_id").references(() => user.id, {
			onDelete: "set null",
		}),
		creatorId: text("creator_id")
			.notNull()
			.references(() => user.id, { onDelete: "restrict" }),
		parentIssueId: text("parent_issue_id").references(
			(): AnyPgColumn => issue.id,
			{
				onDelete: "set null",
			},
		),
		archivedAt: timestamp("archived_at", { withTimezone: true }),
		createdAt: timestamp("created_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.defaultNow()
			.notNull()
			.$onUpdate(() => sql`now()`),
	},
	(table) => [
		uniqueIndex("issue_team_number_key").on(table.teamId, table.number),
		// Speed up Kanban boards (Filtering by Team + Status + Archive state)
		index("issue_team_status_idx").on(
			table.teamId,
			table.statusId,
			table.archivedAt,
		),
		// Speed up Cycle views
		// index("issue_cycle_idx").on(table.cycleId),
		// Speed up searching by Title
		index("issue_title_search_idx").on(table.title),
		// Ensure we can quickly find sub-issues
		index("issue_parent_idx").on(table.parentIssueId),
	],
);

export const issueRelations = relations(issue, ({ one, many }) => ({
	workspace: one(workspace, {
		fields: [issue.workspaceId],
		references: [workspace.id],
	}),
	team: one(team, {
		fields: [issue.teamId],
		references: [team.id],
	}),
	// project: one(project, {
	// 	fields: [issue.projectId],
	// 	references: [project.id],
	// }),
	status: one(issueStatus, {
		fields: [issue.statusId],
		references: [issueStatus.id],
	}),
	priority: one(issuePriority, {
		fields: [issue.priorityId],
		references: [issuePriority.id],
	}),
	// cycle: one(cycle, {
	// 	fields: [issue.cycleId],
	// 	references: [cycle.id],
	// }),
	assignee: one(user, {
		fields: [issue.assigneeId],
		references: [user.id],
	}),
	reporter: one(user, {
		fields: [issue.reporterId],
		references: [user.id],
	}),
	creator: one(user, {
		fields: [issue.creatorId],
		references: [user.id],
	}),
	parent: one(issue, {
		relationName: "ParentIssue",
		fields: [issue.parentIssueId],
		references: [issue.id],
	}),
	subIssues: many(issue, { relationName: "ParentIssue" }),
	labelLinks: many(issueLabel),
}));

export const issueLabel = pgTable(
	"issue_label",
	{
		issueId: text("issue_id")
			.notNull()
			.references(() => issue.id, { onDelete: "cascade" }),
		labelId: text("label_id")
			.notNull()
			.references(() => label.id, { onDelete: "cascade" }),
	},
	(t) => [
		index("issue_label_issue_idx").on(t.issueId),
		index("issue_label_label_idx").on(t.labelId),
		uniqueIndex("issue_label_pk").on(t.issueId, t.labelId),
	],
);

export const issueLabelRelations = relations(issueLabel, ({ one }) => ({
	issue: one(issue, {
		fields: [issueLabel.issueId],
		references: [issue.id],
	}),
	label: one(label, {
		fields: [issueLabel.labelId],
		references: [label.id],
	}),
}));
