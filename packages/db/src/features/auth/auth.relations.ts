import { defineRelationsPart } from "drizzle-orm";
import * as schema from "../../schema";

export const authRelations = defineRelationsPart(schema, (r) => ({
	user: {
		roleDefinitions: r.many.roleDefinitions({
			alias: "CreatedRoles",
		}),
		assignedRoles: r.many.roleAssignments({
			alias: "AssignedUser",
		}),
		rolesAssignedBy: r.many.roleAssignments({
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
