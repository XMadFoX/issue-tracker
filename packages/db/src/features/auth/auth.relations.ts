import { defineRelationsPart } from "drizzle-orm";
import * as schema from "../../schema";

export const authRelations = defineRelationsPart(schema, (r) => ({
	user: {
		roleDefinitions: r.many.roleDefinitions({
			from: r.user.id,
			to: r.roleDefinitions.createdBy,
			alias: "CreatedRoles",
		}),
		assignedRoles: r.many.roleAssignments({
			from: r.user.id,
			to: r.roleAssignments.userId,
			alias: "AssignedUser",
		}),
		rolesAssignedBy: r.many.roleAssignments({
			from: r.user.id,
			to: r.roleAssignments.assignedBy,
			alias: "AssignedBy",
		}),
	},
	session: {
		user: r.one.user({
			from: r.session.userId,
			to: r.user.id,
		}),
	},
	account: {
		user: r.one.user({
			from: r.account.userId,
			to: r.user.id,
		}),
	},
}));
