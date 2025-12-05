import { sql } from "drizzle-orm";
import { pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { team, workspace } from "./tracker.schema";

export const label = pgTable(
	"label",
	{
		id: text("id").primaryKey(),
		workspaceId: text("workspace_id")
			.notNull()
			.references(() => workspace.id, { onDelete: "cascade" }),
		teamId: text("team_id").references(() => team.id, { onDelete: "set null" }),
		name: text("name").notNull(),
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
	(t) => [
		uniqueIndex("label_workspace_name_when_global")
			.on(t.workspaceId, t.name)
			.where(sql`team_id is null`),
		uniqueIndex("label_workspace_team_name_when_scoped")
			.on(t.workspaceId, t.teamId, t.name)
			.where(sql`team_id is not null`),
	],
);
