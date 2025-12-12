import type {
	InferRouterCurrentContexts,
	InferRouterInitialContexts,
	InferRouterInputs,
	InferRouterOutputs,
} from "@orpc/server";
import { issuePriorityRouter } from "./features/issue-priorities/router";
import { issueStatusRouter } from "./features/issue-statuses/router";
import { issueRouter } from "./features/issues/router";
import { labelRouter } from "./features/labels/router";
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
		...issueRouter,
	},
	priority: issuePriorityRouter,
	label: labelRouter,
	role: {
		...roleRouter,
		permissions: rolePermissionsRouter,
	},
	workspaceMembership: workspaceMembershipRouter,
	teamMembership: teamMembershipRouter,
};

export type Inputs = InferRouterInputs<typeof router>;
export type Outputs = InferRouterOutputs<typeof router>;
export type InitialContexts = InferRouterInitialContexts<typeof router>;
export type CurrentContexts = InferRouterCurrentContexts<typeof router>;
