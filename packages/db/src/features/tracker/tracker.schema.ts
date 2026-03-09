import { relations } from "drizzle-orm";
import {
	integer,
	jsonb,
	pgTable,
	text,
	timestamp,
	uniqueIndex,
} from "drizzle-orm/pg-core";
import {
	policyConstraints,
	roleAssignments,
	roleDefinitions,
} from "../abac/abac.schema"; // Import roleDefinitions
import { user } from "../auth/auth.schema";

export const workspace = pgTable(
	"workspace",
	{
		id: text("id").primaryKey(),
		name: text("name").notNull(),
		slug: text("slug").notNull(),
		timezone: text("timezone").notNull(),
		createdAt: timestamp("created_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
	},
	(table) => [uniqueIndex("workspace_slug_key").on(table.slug)],
);

export const workspaceRelations = relations(workspace, ({ many }) => ({
	memberships: many(workspaceMembership),
	invitations: many(workspaceInvitation),
	teams: many(team),
	roleDefinitions: many(roleDefinitions),
	policyConstraints: many(policyConstraints),
	roleAssignments: many(roleAssignments),
}));

export const workspaceMembership = pgTable(
	"workspace_membership",
	{
		id: text("id").primaryKey(),
		workspaceId: text("workspace_id")
			.notNull()
			.references(() => workspace.id, { onDelete: "cascade" }),
		userId: text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		roleId: text("role_id")
			.notNull()
			.references(() => roleDefinitions.id, { onDelete: "cascade" }),
		attributes: jsonb("attributes")
			.$type<Record<string, unknown>>()
			.default({})
			.notNull(),
		status: text("status").notNull(),
		invitedBy: text("invited_by").references(() => user.id, {
			onDelete: "set null",
		}),
		joinedAt: timestamp("joined_at", { withTimezone: true }),
		lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
		createdAt: timestamp("created_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
	},
	(table) => [
		uniqueIndex("workspace_membership_workspace_user_key").on(
			table.workspaceId,
			table.userId,
		),
	],
);

export const workspaceMembershipRelations = relations(
	workspaceMembership,
	({ one }) => ({
		workspace: one(workspace, {
			fields: [workspaceMembership.workspaceId],
			references: [workspace.id],
		}),
		user: one(user, {
			fields: [workspaceMembership.userId],
			references: [user.id],
		}),
		invitedBy: one(user, {
			fields: [workspaceMembership.invitedBy],
			references: [user.id],
		}),
		role: one(roleDefinitions, {
			fields: [workspaceMembership.roleId],
			references: [roleDefinitions.id],
		}),
	}),
);

export const workspaceInvitation = pgTable("workspace_invitation", {
	id: text("id").primaryKey(),
	workspaceId: text("workspace_id")
		.notNull()
		.references(() => workspace.id, { onDelete: "cascade" }),
	email: text("email").notNull(),
	normalizedEmail: text("normalized_email").notNull(),
	roleId: text("role_id")
		.notNull()
		.references(() => roleDefinitions.id, { onDelete: "cascade" }),
	invitedBy: text("invited_by")
		.notNull()
		.references(() => user.id, { onDelete: "restrict" }),
	tokenHash: text("token_hash").notNull().unique(),
	status: text("status").notNull(),
	expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
	acceptedAt: timestamp("accepted_at", { withTimezone: true }),
	acceptedByUserId: text("accepted_by_user_id").references(() => user.id, {
		onDelete: "set null",
	}),
	createdAt: timestamp("created_at", { withTimezone: true })
		.defaultNow()
		.notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true })
		.defaultNow()
		.notNull(),
});

export const workspaceInvitationRelations = relations(
	workspaceInvitation,
	({ one, many }) => ({
		workspace: one(workspace, {
			fields: [workspaceInvitation.workspaceId],
			references: [workspace.id],
		}),
		role: one(roleDefinitions, {
			fields: [workspaceInvitation.roleId],
			references: [roleDefinitions.id],
		}),
		inviter: one(user, {
			fields: [workspaceInvitation.invitedBy],
			references: [user.id],
			relationName: "WorkspaceInvitationInviter",
		}),
		acceptedByUser: one(user, {
			fields: [workspaceInvitation.acceptedByUserId],
			references: [user.id],
			relationName: "WorkspaceInvitationAcceptedByUser",
		}),
		teams: many(workspaceInvitationTeam),
	}),
);

export const workspaceInvitationTeam = pgTable(
	"workspace_invitation_team",
	{
		invitationId: text("invitation_id")
			.notNull()
			.references(() => workspaceInvitation.id, { onDelete: "cascade" }),
		teamId: text("team_id")
			.notNull()
			.references(() => team.id, { onDelete: "cascade" }),
	},
	(table) => [
		uniqueIndex("workspace_invitation_team_invitation_team_idx").on(
			table.invitationId,
			table.teamId,
		),
	],
);

export const workspaceInvitationTeamRelations = relations(
	workspaceInvitationTeam,
	({ one }) => ({
		invitation: one(workspaceInvitation, {
			fields: [workspaceInvitationTeam.invitationId],
			references: [workspaceInvitation.id],
		}),
		team: one(team, {
			fields: [workspaceInvitationTeam.teamId],
			references: [team.id],
		}),
	}),
);

export const team = pgTable(
	"team",
	{
		id: text("id").primaryKey(),
		workspaceId: text("workspace_id")
			.notNull()
			.references(() => workspace.id, { onDelete: "cascade" }),
		name: text("name").notNull(),
		key: text("key").notNull(),
		color: text("color"),
		leadId: text("lead_id").references(() => user.id, {
			onDelete: "set null",
		}),
		cycleDuration: integer("cycle_duration"),
		triageMode: text("triage_mode"),
		privacy: text("privacy").notNull(),
		createdAt: timestamp("created_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
	},
	(table) => [
		uniqueIndex("team_workspace_key_key").on(table.workspaceId, table.key),
	],
);

export const teamRelations = relations(team, ({ one, many }) => ({
	workspace: one(workspace, {
		fields: [team.workspaceId],
		references: [workspace.id],
	}),
	lead: one(user, {
		fields: [team.leadId],
		references: [user.id],
	}),
	memberships: many(teamMembership),
	roleDefinitions: many(roleDefinitions),
	roleAssignments: many(roleAssignments),
}));

export const teamMembership = pgTable(
	"team_membership",
	{
		id: text("id").primaryKey(),
		teamId: text("team_id")
			.notNull()
			.references(() => team.id, { onDelete: "cascade" }),
		userId: text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		roleId: text("role_id")
			.notNull()
			.references(() => roleDefinitions.id, { onDelete: "cascade" }),
		status: text("status").default("active").notNull(),
		invitedBy: text("invited_by").references(() => user.id, {
			onDelete: "set null",
		}),
		attributes: jsonb("attributes")
			.$type<Record<string, unknown>>()
			.default({})
			.notNull(),
		joinedAt: timestamp("joined_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
		lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
	},
	(table) => [
		uniqueIndex("team_membership_team_user_key").on(table.teamId, table.userId),
	],
);

export const teamMembershipRelations = relations(teamMembership, ({ one }) => ({
	team: one(team, {
		fields: [teamMembership.teamId],
		references: [team.id],
	}),
	user: one(user, {
		fields: [teamMembership.userId],
		references: [user.id],
	}),
	invitedBy: one(user, {
		fields: [teamMembership.invitedBy],
		references: [user.id],
	}),
	role: one(roleDefinitions, {
		fields: [teamMembership.roleId],
		references: [roleDefinitions.id],
	}),
}));
