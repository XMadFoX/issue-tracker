import { rolePermissionsRouter } from "./features/permissions/router";
import { teamMembershipRouter } from "./features/team-memberships/router";
import { teamRouter } from "./features/teams/router";
import { workspaceMembershipRouter } from "./features/workspace-memberships/router";
import { workspaceRouter } from "./features/workspaces/router";

export const router = {
	role: {
		...roleRouter,
		permissions: rolePermissionsRouter,
	},
	workspaceMembership: workspaceMembershipRouter,
	teamMembership: teamMembershipRouter,
};
