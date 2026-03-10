import {
	workspaceInvitation,
	workspaceInvitationTeam,
} from "db/features/tracker/tracker.schema";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { roleInsertSchema } from "../roles/schema";
import { teamInsertSchema } from "../teams/schema";
import { workspaceInsertSchema } from "../workspaces/schema";

export const workspaceInvitationInsertSchema =
	createInsertSchema(workspaceInvitation);
export const workspaceInvitationTeamInsertSchema = createInsertSchema(
	workspaceInvitationTeam,
);

export const workspaceInvitationStatusSchema = z.enum([
	"pending",
	"accepted",
	"revoked",
	"expired",
]);

export const workspaceInvitationCreateSchema = z.object({
	workspaceId: workspaceInsertSchema.shape.id,
	email: z.email(),
	roleId: roleInsertSchema.shape.id,
	teamIds: z.array(teamInsertSchema.shape.id).min(1),
});

export const workspaceInvitationListSchema = z.object({
	workspaceId: workspaceInsertSchema.shape.id,
});

export const workspaceInvitationGetByTokenSchema = z.object({
	token: z.string().min(1),
});

export const workspaceInvitationAcceptSchema =
	workspaceInvitationGetByTokenSchema;

export const workspaceInvitationRevokeSchema = z.object({
	id: workspaceInvitationInsertSchema.shape.id,
	workspaceId: workspaceInsertSchema.shape.id,
});
