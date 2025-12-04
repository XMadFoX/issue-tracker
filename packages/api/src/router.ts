import { issueStatusRouter } from "./features/issue-statuses/router";
import { rolePermissionsRouter } from "./features/permissions/router";
import { roleRouter } from "./features/roles/router";
import { teamMembershipRouter } from "./features/team-memberships/router";
import { teamRouter } from "./features/teams/router";
import { workspaceMembershipRouter } from "./features/workspace-memberships/router";
import { workspaceRouter } from "./features/workspaces/router";

export const router = {
	workspace: workspaceRouter,
	team: teamRouter,
	issue: {
		status: issueStatusRouter,
	},
	role: {
		...roleRouter,
		permissions: rolePermissionsRouter,
	},
	workspaceMembership: workspaceMembershipRouter,
	teamMembership: teamMembershipRouter,
};
