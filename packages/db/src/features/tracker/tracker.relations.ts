import { defineRelationsPart } from "drizzle-orm";
import * as schema from "../../schema";

export const trackerRelations = defineRelationsPart(schema, (r) => ({
	workspace: {
		memberships: r.many.workspaceMembership(),
		invitations: r.many.workspaceInvitation(),
		teams: r.many.team(),
		roleDefinitions: r.many.roleDefinitions(),
		policyConstraints: r.many.policyConstraints(),
		roleAssignments: r.many.roleAssignments(),
	},
	workspaceMembership: {
		workspace: r.one.workspace({
			from: r.workspaceMembership.workspaceId,
			to: r.workspace.id,
		}),
		user: r.one.user({ from: r.workspaceMembership.userId, to: r.user.id }),
		invitedBy: r.one.user({
			from: r.workspaceMembership.invitedBy,
			to: r.user.id,
		}),
		role: r.one.roleDefinitions({
			from: r.workspaceMembership.roleId,
			to: r.roleDefinitions.id,
		}),
	},
	workspaceInvitation: {
		workspace: r.one.workspace({
			from: r.workspaceInvitation.workspaceId,
			to: r.workspace.id,
		}),
		role: r.one.roleDefinitions({
			from: r.workspaceInvitation.roleId,
			to: r.roleDefinitions.id,
		}),
		inviter: r.one.user({
			from: r.workspaceInvitation.invitedBy,
			to: r.user.id,
			alias: "WorkspaceInvitationInviter",
		}),
		acceptedByUser: r.one.user({
			from: r.workspaceInvitation.acceptedByUserId,
			to: r.user.id,
			alias: "WorkspaceInvitationAcceptedByUser",
		}),
		teams: r.many.workspaceInvitationTeam(),
	},
	workspaceInvitationTeam: {
		invitation: r.one.workspaceInvitation({
			from: r.workspaceInvitationTeam.invitationId,
			to: r.workspaceInvitation.id,
		}),
		team: r.one.team({ from: r.workspaceInvitationTeam.teamId, to: r.team.id }),
	},
	team: {
		workspace: r.one.workspace({
			from: r.team.workspaceId,
			to: r.workspace.id,
		}),
		lead: r.one.user({ from: r.team.leadId, to: r.user.id }),
		memberships: r.many.teamMembership(),
		roleDefinitions: r.many.roleDefinitions(),
		roleAssignments: r.many.roleAssignments(),
	},
	teamMembership: {
		team: r.one.team({ from: r.teamMembership.teamId, to: r.team.id }),
		user: r.one.user({ from: r.teamMembership.userId, to: r.user.id }),
		invitedBy: r.one.user({ from: r.teamMembership.invitedBy, to: r.user.id }),
		role: r.one.roleDefinitions({
			from: r.teamMembership.roleId,
			to: r.roleDefinitions.id,
		}),
	},
}));
