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

export const create = authedRouter
	.input(workspaceInvitationCreateSchema)
	.handler(async ({ context, input }) => {
		const normalizedEmail = normalizeEmail(input.email);

		const allowed = await isAllowed({
			userId: context.auth.session.userId,
			workspaceId: input.workspaceId,
			permissionKey: "workspace:manage_members",
		});
		if (!allowed) {
			throw new ORPCError("Unauthorized to manage workspace invitations");
		}

		const [selectedWorkspace] = await db
			.select({ id: workspace.id })
			.from(workspace)
			.where(eq(workspace.id, input.workspaceId));
		if (!selectedWorkspace) {
			throw new ORPCError("Workspace not found");
		}

		const [role] = await db
			.select({
				id: roleDefinitions.id,
			})
			.from(roleDefinitions)
			.where(
				and(
					eq(roleDefinitions.id, input.roleId),
					eq(roleDefinitions.workspaceId, input.workspaceId),
					isNull(roleDefinitions.teamId),
				),
			);
		if (!role) {
			throw new ORPCError("Invalid workspace role");
		}

		const uniqueTeamIds = [...new Set(input.teamIds)];
		const selectedTeams = await db
			.select({
				id: team.id,
			})
			.from(team)
			.where(
				and(
					eq(team.workspaceId, input.workspaceId),
					inArray(team.id, uniqueTeamIds),
				),
			);

		if (selectedTeams.length !== uniqueTeamIds.length) {
			throw new ORPCError("One or more selected teams are invalid");
		}

		const [existingUser] = await db
			.select({
				id: user.id,
			})
			.from(user)
			.where(eq(sql<string>`lower(${user.email})`, normalizedEmail));

		if (existingUser) {
			const [existingMembership] = await db
				.select({
					id: workspaceMembership.id,
					status: workspaceMembership.status,
				})
				.from(workspaceMembership)
				.where(
					and(
						eq(workspaceMembership.workspaceId, input.workspaceId),
						eq(workspaceMembership.userId, existingUser.id),
					),
				);

			if (existingMembership?.status === "active") {
				throw new ORPCError("User is already an active workspace member");
			}
		}

		const token = createInvitationToken();
		const tokenHash = hashInvitationToken(token);
		const expiresAt = new Date(Date.now() + INVITATION_TTL_MS);

		const createdInvitation = await db.transaction(async (tx) => {
			await tx
				.update(workspaceInvitation)
				.set({
					status: "revoked",
					updatedAt: new Date(),
				})
				.where(
					and(
						eq(workspaceInvitation.workspaceId, input.workspaceId),
						eq(workspaceInvitation.normalizedEmail, normalizedEmail),
						eq(workspaceInvitation.status, "pending"),
					),
				);

			const [newInvitation] = await tx
				.insert(workspaceInvitation)
				.values({
					id: createId(),
					workspaceId: input.workspaceId,
					email: input.email.trim(),
					normalizedEmail,
					roleId: input.roleId,
					invitedBy: context.auth.session.userId,
					tokenHash,
					status: "pending",
					expiresAt,
				})
				.returning({
					id: workspaceInvitation.id,
				});

			if (!newInvitation) {
				throw new ORPCError("Failed to create workspace invitation");
			}

			await tx.insert(workspaceInvitationTeam).values(
				uniqueTeamIds.map((teamId) => ({
					invitationId: newInvitation.id,
					teamId,
				})),
			);

			return newInvitation;
		});

		return {
			id: createdInvitation.id,
			inviteUrl: buildInvitationUrl(token),
			expiresAt,
		};
	});

export const list = authedRouter
	.input(workspaceInvitationListSchema)
	.handler(async ({ context, input }) => {
		const allowed = await isAllowed({
			userId: context.auth.session.userId,
			workspaceId: input.workspaceId,
			permissionKey: "workspace:read_members",
		});
		if (!allowed) {
			throw new ORPCError("Unauthorized to read workspace invitations");
		}

		const invitations = await db
			.select({
				id: workspaceInvitation.id,
				email: workspaceInvitation.email,
				roleId: workspaceInvitation.roleId,
				roleName: roleDefinitions.name,
				status: workspaceInvitation.status,
				expiresAt: workspaceInvitation.expiresAt,
				createdAt: workspaceInvitation.createdAt,
			})
			.from(workspaceInvitation)
			.innerJoin(
				roleDefinitions,
				eq(workspaceInvitation.roleId, roleDefinitions.id),
			)
			.where(
				and(
					eq(workspaceInvitation.workspaceId, input.workspaceId),
					eq(workspaceInvitation.status, "pending"),
				),
			)
			.orderBy(desc(workspaceInvitation.createdAt));

		const teamsByInvitationId = await getInvitationTeams(
			invitations.map((invitation) => invitation.id),
		);
		const now = new Date();

		return invitations.map((invitation) => ({
			...invitation,
			status: getEffectiveInvitationStatus(
				invitation.status,
				invitation.expiresAt,
				now,
			),
			teams: teamsByInvitationId.get(invitation.id) ?? [],
		}));
	});

export const getByToken = base
	.input(workspaceInvitationGetByTokenSchema)
	.handler(async ({ input }) => {
		const invitation = await getInvitationDetailsByTokenHash(
			hashInvitationToken(input.token),
		);
		if (!invitation) {
			throw new ORPCError("Invitation not found");
		}

		return {
			id: invitation.id,
			email: invitation.email,
			status: getEffectiveInvitationStatus(
				invitation.status,
				invitation.expiresAt,
				new Date(),
			),
			expiresAt: invitation.expiresAt,
			acceptedAt: invitation.acceptedAt,
			workspace: {
				id: invitation.workspaceId,
				name: invitation.workspaceName,
				slug: invitation.workspaceSlug,
			},
			role: {
				id: invitation.roleId,
				name: invitation.roleName,
			},
			teams: invitation.teams,
		};
	});

export const accept = authedRouter
	.input(workspaceInvitationAcceptSchema)
	.handler(async ({ context, input }) => {
		const invitation = await getInvitationDetailsByTokenHash(
			hashInvitationToken(input.token),
		);
		if (!invitation) {
			throw new ORPCError("Invitation not found");
		}

		const currentStatus = getEffectiveInvitationStatus(
			invitation.status,
			invitation.expiresAt,
			new Date(),
		);
		if (currentStatus !== "pending") {
			throw new ORPCError("Invitation is no longer active");
		}

		const sessionEmail = normalizeEmail(context.auth.user.email);
		if (sessionEmail !== invitation.normalizedEmail) {
			throw new ORPCError("Signed-in email does not match this invitation");
		}

		const result = await db.transaction(async (tx) => {
			const membershipRoleId = invitation.roleId;

			const [existingMembership] = await tx
				.select({
					id: workspaceMembership.id,
					status: workspaceMembership.status,
				})
				.from(workspaceMembership)
				.where(
					and(
						eq(workspaceMembership.workspaceId, invitation.workspaceId),
						eq(workspaceMembership.userId, context.auth.session.userId),
					),
				);

			if (!existingMembership) {
				await tx.insert(workspaceMembership).values({
					id: createId(),
					workspaceId: invitation.workspaceId,
					userId: context.auth.session.userId,
					roleId: membershipRoleId,
					status: "active",
					invitedBy: invitation.invitedBy,
					joinedAt: new Date(),
					lastSeenAt: new Date(),
					attributes: {},
				});
			} else if (existingMembership.status !== "active") {
				await tx
					.update(workspaceMembership)
					.set({
						roleId: membershipRoleId,
						status: "active",
						lastSeenAt: new Date(),
						updatedAt: new Date(),
					})
					.where(eq(workspaceMembership.id, existingMembership.id));
			}

			for (const selectedTeam of invitation.teams) {
				const teamRoles = await ensureTeamBuiltInRoles({
					executor: tx,
					workspaceId: invitation.workspaceId,
					teamId: selectedTeam.id,
					createdBy: invitation.invitedBy,
				});

				const [existingTeamMembership] = await tx
					.select({
						id: teamMembership.id,
					})
					.from(teamMembership)
					.where(
						and(
							eq(teamMembership.teamId, selectedTeam.id),
							eq(teamMembership.userId, context.auth.session.userId),
						),
					);

				if (existingTeamMembership) {
					continue;
				}

				await tx.insert(teamMembership).values({
					id: createId(),
					teamId: selectedTeam.id,
					userId: context.auth.session.userId,
					roleId: teamRoles.memberRoleId,
					status: "active",
					invitedBy: invitation.invitedBy,
					joinedAt: new Date(),
					lastSeenAt: new Date(),
					attributes: {},
				});
			}

			await tx
				.update(workspaceInvitation)
				.set({
					status: "accepted",
					acceptedAt: new Date(),
					acceptedByUserId: context.auth.session.userId,
					updatedAt: new Date(),
				})
				.where(eq(workspaceInvitation.id, invitation.id));

			return {
				workspaceSlug: invitation.workspaceSlug,
			};
		});

		return result;
	});
export const workspaceInvitationRouter = {
	create,
	list,
	getByToken,
	accept,
};
