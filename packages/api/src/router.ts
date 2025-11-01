import { rolePermissionsRouter } from "./features/permissions/router";
import { teamRouter } from "./features/teams/router";
import { workspaceRouter } from "./features/workspaces/router";

export const router = {
	role: {
		...roleRouter,
		permissions: rolePermissionsRouter,
	},
	workspaceMembership: workspaceMembershipRouter,
};
