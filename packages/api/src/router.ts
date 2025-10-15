import { teamRouter } from "./features/teams/router";
import { workspaceRouter } from "./features/workspaces/router";

export const router = { workspace: workspaceRouter, team: teamRouter };
