import { createHash, randomBytes } from "node:crypto";
import { ORPCError } from "@orpc/server";
import { createId } from "@paralleldrive/cuid2";
import { db } from "db";
import { roleDefinitions } from "db/features/abac/abac.schema";
import { user } from "db/features/auth/auth.schema";
import {
	team,
	teamMembership,
	workspace,
	workspaceInvitation,
	workspaceInvitationTeam,
	workspaceMembership,
} from "db/features/tracker/tracker.schema";
import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { authedRouter, base } from "../../context";
import { env } from "../../env";
import { isAllowed } from "../../lib/abac";
import { ensureTeamBuiltInRoles } from "../workspaces/defaults";
import {
	workspaceInvitationAcceptSchema,
	workspaceInvitationCreateSchema,
	workspaceInvitationGetByTokenSchema,
	workspaceInvitationListSchema,
	workspaceInvitationRevokeSchema,
} from "./schema";

const INVITATION_TTL_MS = 1000 * 60 * 60 * 24 * 7;

function normalizeEmail(email: string) {
	return email.trim().toLowerCase();
}

function hashInvitationToken(token: string) {
	return createHash("sha256").update(token).digest("hex");
}

function createInvitationToken() {
	return randomBytes(24).toString("hex");
}

function buildInvitationUrl(token: string) {
	return new URL(`/invite/${token}`, env.APP_URL).toString();
}

function getEffectiveInvitationStatus(
	status: string,
	expiresAt: Date,
	now: Date,
) {
	if (status === "pending" && expiresAt <= now) {
		return "expired";
	}

	return status;
}

async function getInvitationTeams(invitationIds: string[]) {
	if (invitationIds.length === 0) {
		return new Map<string, { id: string; name: string; key: string }[]>();
	}

	const teamRows = await db
		.select({
			invitationId: workspaceInvitationTeam.invitationId,
			teamId: team.id,
			teamName: team.name,
			teamKey: team.key,
		})
		.from(workspaceInvitationTeam)
		.innerJoin(team, eq(workspaceInvitationTeam.teamId, team.id))
		.where(inArray(workspaceInvitationTeam.invitationId, invitationIds));

	const teamsByInvitationId = new Map<
		string,
		{ id: string; name: string; key: string }[]
	>();

	for (const row of teamRows) {
		const currentTeams = teamsByInvitationId.get(row.invitationId) ?? [];
		currentTeams.push({
			id: row.teamId,
			name: row.teamName,
			key: row.teamKey,
		});
		teamsByInvitationId.set(row.invitationId, currentTeams);
	}

	return teamsByInvitationId;
}

async function getInvitationDetailsByTokenHash(tokenHash: string) {
	const [invitation] = await db
		.select({
			id: workspaceInvitation.id,
			workspaceId: workspaceInvitation.workspaceId,
			email: workspaceInvitation.email,
			normalizedEmail: workspaceInvitation.normalizedEmail,
			roleId: workspaceInvitation.roleId,
			invitedBy: workspaceInvitation.invitedBy,
			status: workspaceInvitation.status,
			expiresAt: workspaceInvitation.expiresAt,
			acceptedAt: workspaceInvitation.acceptedAt,
			acceptedByUserId: workspaceInvitation.acceptedByUserId,
			workspaceName: workspace.name,
			workspaceSlug: workspace.slug,
			roleName: roleDefinitions.name,
		})
		.from(workspaceInvitation)
		.innerJoin(workspace, eq(workspaceInvitation.workspaceId, workspace.id))
		.innerJoin(
			roleDefinitions,
			eq(workspaceInvitation.roleId, roleDefinitions.id),
		)
		.where(eq(workspaceInvitation.tokenHash, tokenHash));

	if (!invitation) {
		return null;
	}

	const teamsByInvitationId = await getInvitationTeams([invitation.id]);

	return {
		...invitation,
		teams: teamsByInvitationId.get(invitation.id) ?? [],
	};
}

export const create = authedRouter;
