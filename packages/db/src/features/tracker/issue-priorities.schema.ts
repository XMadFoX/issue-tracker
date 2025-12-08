import { sql } from "drizzle-orm";
import {
	index,
	integer,
	pgTable,
	text,
	timestamp,
	uniqueIndex,
} from "drizzle-orm/pg-core";
import { workspace } from "./tracker.schema";

export const issuePriority = pgTable(
	"issue_priority",
	{
		id: text("id").primaryKey(),
		workspaceId: text("workspace_id")
			.notNull()
			.references(() => workspace.id, { onDelete: "cascade" }),
		name: text("name").notNull(),
		// the lower the number, the higher the priority
		rank: integer("rank").notNull(),
		color: text("color"),
		description: text("description"),
		createdAt: timestamp("created_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.defaultNow()
			.notNull()
			.$onUpdate(() => sql`now()`),
	},
	(t) => {
		return {
			// list by workspace quickly
			byWorkspace: index("issue_priority_workspace_idx").on(t.workspaceId),

			// enforce single rank per workspace
			uniqueWorkspaceRank: uniqueIndex("issue_priority_ws_rank_key").on(
				t.workspaceId,
				t.rank,
			),
		};
	},
);
