import { rolePermissionsRouter } from "./features/permissions/router";
import { teamRouter } from "./features/teams/router";
import { workspaceRouter } from "./features/workspaces/router";

export const router = {
	role: {
		permissions: rolePermissionsRouter,
	},
	workspaceMembership: workspaceMembershipRouter,
};
