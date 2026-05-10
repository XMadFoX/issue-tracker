import { defineRelationsPart } from "drizzle-orm";
import * as schema from "../../schema";

export const abacRelations = defineRelationsPart(schema, (r) => ({
	permissionsCatalog: {
		rolePermissions: r.many.rolePermissions(),
	},
	roleDefinitions: {
		workspace: r.one.workspace({
			from: r.roleDefinitions.workspaceId,
			to: r.workspace.id,
		}),
		team: r.one.team({
			from: r.roleDefinitions.teamId,
			to: r.team.id,
		}),
		createdBy: r.one.user({
			from: r.roleDefinitions.createdBy,
			to: r.user.id,
			alias: "CreatedRoles",
		}),
		rolePermissions: r.many.rolePermissions(),
		roleAssignments: r.many.roleAssignments(),
	},
	policyConstraints: {
		workspace: r.one.workspace({
			from: r.policyConstraints.workspaceId,
			to: r.workspace.id,
		}),
		rolePermissions: r.many.rolePermissions(),
	},
	rolePermissions: {
		role: r.one.roleDefinitions({
			from: r.rolePermissions.roleId,
			to: r.roleDefinitions.id,
		}),
		permission: r.one.permissionsCatalog({
			from: r.rolePermissions.permissionId,
			to: r.permissionsCatalog.id,
		}),
		constraint: r.one.policyConstraints({
			from: r.rolePermissions.constraintId,
			to: r.policyConstraints.id,
		}),
	},
	roleAssignments: {
		role: r.one.roleDefinitions({
			from: r.roleAssignments.roleId,
			to: r.roleDefinitions.id,
		}),
		user: r.one.user({
			from: r.roleAssignments.userId,
			to: r.user.id,
			alias: "AssignedUser",
		}),
		workspace: r.one.workspace({
			from: r.roleAssignments.workspaceId,
			to: r.workspace.id,
		}),
		team: r.one.team({
			from: r.roleAssignments.teamId,
			to: r.team.id,
		}),
		assignedBy: r.one.user({
			from: r.roleAssignments.assignedBy,
			to: r.user.id,
			alias: "AssignedBy",
		}),
	},
	entityAttributes: {
		user: r.one.user({
			from: r.entityAttributes.userId,
			to: r.user.id,
		}),
		workspace: r.one.workspace({
			from: r.entityAttributes.workspaceId,
			to: r.workspace.id,
		}),
		team: r.one.team({
			from: r.entityAttributes.teamId,
			to: r.team.id,
		}),
	},
}));
