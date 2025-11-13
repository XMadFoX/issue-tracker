import { ORPCError } from "@orpc/server";
import { createId } from "@paralleldrive/cuid2";
import { db } from "db";
import { roleDefinitions } from "db/features/abac/abac.schema";
import { user } from "db/features/auth/auth.schema";
import { team, teamMembership } from "db/features/tracker/tracker.schema";
import { and, count, desc, eq, ne } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { authedRouter } from "../../context";
import { isAllowed } from "../../lib/abac";
import { sanitizeAttributes } from "../../lib/permissions-helpers";

export const teamMembershipInsertSchema = createInsertSchema(teamMembership);

export const teamMembershipCreateSchema = teamMembershipInsertSchema.omit({
	id: true,
	invitedBy: true,
	joinedAt: true,
	lastSeenAt: true,
});

export const teamMembershipListSchema = teamMembershipInsertSchema.pick({
	teamId: true,
});

export const teamMembershipGetSchema = teamMembershipInsertSchema.pick({
	id: true,
	teamId: true,
});

export const teamMembershipUpdateSchema = teamMembershipInsertSchema
	.partial()
	.pick({
		id: true,
		teamId: true,
		roleId: true,
		status: true,
		attributes: true,
	})
	.required({ id: true, teamId: true });

export const teamMembershipDeleteSchema = teamMembershipInsertSchema.pick({
	id: true,
	teamId: true,
});

/**
 * Creates a new team membership.
 * @param input - Team membership creation input
 * @returns The created membership with joined user and role details
 */
export const create = authedRouter
	.input(teamMembershipCreateSchema)
	.handler(async ({ context, input }) => {
		const {
			teamId,
			userId,
			roleId,
			status = "active",
			attributes = {},
		} = input;
		const invitedBy = context.auth.session.userId;

		// Derive workspaceId from team
		const [teamData] = await db
			.select({ workspaceId: team.workspaceId })
			.from(team)
			.where(eq(team.id, teamId));
		if (!teamData) {
			throw new ORPCError("Team not found");
		}
		const workspaceId = teamData.workspaceId;

		// Validate user has permission
		const allowed = await isAllowed({
			userId: context.auth.session.userId,
			workspaceId,
			teamId,
			permissionKey: "team:manage_members",
		});
		if (!allowed) {
			throw new ORPCError("Unauthorized to manage team members");
		}

		// Validate user exists
		const [usr] = await db
			.select({ id: user.id })
			.from(user)
			.where(eq(user.id, userId));
		if (!usr) {
			throw new ORPCError("User not found");
		}

		// Check if already a member
		const [existingCount] = await db
			.select({ count: count() })
			.from(teamMembership)
			.where(
				and(
					eq(teamMembership.teamId, teamId),
					eq(teamMembership.userId, userId),
				),
			);
		if (Number(existingCount?.count) > 0) {
			throw new ORPCError("User is already a member of this team");
		}

		// Determine finalRoleId: use provided or fetch default 'member' role for team
		let finalRoleId = roleId;
		if (!finalRoleId) {
			const [defaultRole] = await db
				.select({ id: roleDefinitions.id })
				.from(roleDefinitions)
				.where(
					and(
						eq(roleDefinitions.workspaceId, workspaceId),
						eq(roleDefinitions.name, "member"),
						eq(roleDefinitions.teamId, teamId),
					),
				);
			if (!defaultRole) {
				throw new ORPCError(
					"No default team role available; roleId is required",
				);
			}
			finalRoleId = defaultRole.id;
		} else {
			// Validate provided role exists for team
			const [role] = await db
				.select({ id: roleDefinitions.id })
				.from(roleDefinitions)
				.where(
					and(
						eq(roleDefinitions.id, finalRoleId),
						eq(roleDefinitions.workspaceId, workspaceId),
						eq(roleDefinitions.teamId, teamId),
					),
				);
			if (!role) {
				throw new ORPCError("Invalid role for this team");
			}
		}

		// Sanitize attributes
		const sanitizedAttributes = sanitizeAttributes(attributes);

		const [created] = await db
			.insert(teamMembership)
			.values({
				id: createId(),
				teamId,
				userId,
				roleId: finalRoleId,
				status,
				invitedBy,
				joinedAt: new Date(),
				lastSeenAt: new Date(),
				attributes: sanitizedAttributes,
			})
			.returning();

		if (!created) {
			throw new ORPCError("Failed to create team membership");
		}

		// Return full membership with joins
		const [fullMembership] = await db
			.select()
			.from(teamMembership)
			.innerJoin(user, eq(teamMembership.userId, user.id))
			.innerJoin(roleDefinitions, eq(teamMembership.roleId, roleDefinitions.id))
			.innerJoin(team, eq(teamMembership.teamId, team.id))
			.where(eq(teamMembership.id, created.id));

		return fullMembership;
	});

/**
 * Lists team memberships.
 * @param input - Filter by teamId
 * @returns Array of memberships with joined user, role, and team details
 */
export const list = authedRouter
	.input(teamMembershipListSchema)
	.handler(async ({ context, input }) => {
		const { teamId } = input;

		// Derive workspaceId from team
		const [teamData] = await db
			.select({ workspaceId: team.workspaceId })
			.from(team)
			.where(eq(team.id, teamId));
		if (!teamData) {
			throw new ORPCError("Team not found");
		}
		const workspaceId = teamData.workspaceId;

		const allowed = await isAllowed({
			userId: context.auth.session.userId,
			workspaceId,
			teamId,
			permissionKey: "team:read_members",
		});
		if (!allowed) {
			throw new ORPCError("Unauthorized to read team members");
		}

		const memberships = await db
			.select()
			.from(teamMembership)
			.innerJoin(user, eq(teamMembership.userId, user.id))
			.innerJoin(roleDefinitions, eq(teamMembership.roleId, roleDefinitions.id))
			.innerJoin(team, eq(teamMembership.teamId, team.id))
			.where(eq(teamMembership.teamId, teamId))
			.orderBy(desc(teamMembership.joinedAt)); // Descending for recency

		return memberships;
	});

/**
 * Gets a specific team membership.
 * @param input - Membership id and teamId
 * @returns The membership with joined user, role, and team details
 */
export const get = authedRouter
	.input(teamMembershipGetSchema)
	.handler(async ({ context, input }) => {
		const { id, teamId } = input;

		// Derive workspaceId from team
		const [teamData] = await db
			.select({ workspaceId: team.workspaceId })
			.from(team)
			.where(eq(team.id, teamId));
		if (!teamData) {
			throw new ORPCError("Team not found");
		}
		const workspaceId = teamData.workspaceId;

		const allowed = await isAllowed({
			userId: context.auth.session.userId,
			workspaceId,
			teamId,
			permissionKey: "team:read_members",
		});
		if (!allowed) {
			throw new ORPCError("Unauthorized to read team members");
		}

		const [membership] = await db
			.select()
			.from(teamMembership)
			.innerJoin(user, eq(teamMembership.userId, user.id))
			.innerJoin(roleDefinitions, eq(teamMembership.roleId, roleDefinitions.id))
			.innerJoin(team, eq(teamMembership.teamId, team.id))
			.where(and(eq(teamMembership.id, id), eq(teamMembership.teamId, teamId)));

		if (!membership) {
			throw new ORPCError("Membership not found");
		}

		return membership;
	});

const commonErrors = { UNAUTHORIZED: {} };
const unauthorizedMessage = (action: "update" | "delete") =>
	`You don't have permission to ${action} this team membership`;

/**
 * Updates a team membership.
 * @param input - Partial updates for membership
 * @returns The updated membership with joined details
 */
const update = authedRouter
	.input(teamMembershipUpdateSchema)
	.errors(commonErrors)
	.handler(async ({ context, input, errors }) => {
		const { id, teamId, roleId, status, attributes } = input;

		// Derive workspaceId from team
		const [teamData] = await db
			.select({ workspaceId: team.workspaceId })
			.from(team)
			.where(eq(team.id, teamId));
		if (!teamData) {
			throw new ORPCError("Team not found");
		}
		const workspaceId = teamData.workspaceId;

		const allowed = await isAllowed({
			userId: context.auth.session.userId,
			workspaceId,
			teamId,
			permissionKey: "team:manage_members",
		});
		if (!allowed)
			throw errors.UNAUTHORIZED({
				message: unauthorizedMessage("update"),
			});

		// Fetch existing to validate
		const [existing] = await db
			.select({ userId: teamMembership.userId })
			.from(teamMembership)
			.where(and(eq(teamMembership.id, id), eq(teamMembership.teamId, teamId)));

		if (!existing) {
			throw new ORPCError("Membership not found");
		}

		// Prevent updating own membership to inactive
		if (
			status === "inactive" &&
			existing.userId === context.auth.session.userId
		) {
			throw new ORPCError("Cannot deactivate own membership");
		}

		// Validate new role if changing
		if (roleId) {
			const [role] = await db
				.select({ id: roleDefinitions.id })
				.from(roleDefinitions)
				.where(
					and(
						eq(roleDefinitions.id, roleId),
						eq(roleDefinitions.workspaceId, workspaceId),
						eq(roleDefinitions.teamId, teamId),
					),
				);
			if (!role) {
				throw new ORPCError("Invalid role for this team");
			}
		}

		const values = {
			...(roleId && { roleId }),
			...(status && { status }),
			...(attributes && { attributes: sanitizeAttributes(attributes) }),
			...(status === "active" && { lastSeenAt: new Date() }),
		};

		const [updated] = await db
			.update(teamMembership)
			.set(values)
			.where(and(eq(teamMembership.id, id), eq(teamMembership.teamId, teamId)))
			.returning();

		if (!updated) {
			throw new ORPCError("Failed to update team membership");
		}

		// Return full updated membership with joins
		const [fullMembership] = await db
			.select()
			.from(teamMembership)
			.innerJoin(user, eq(teamMembership.userId, user.id))
			.innerJoin(roleDefinitions, eq(teamMembership.roleId, roleDefinitions.id))
			.innerJoin(team, eq(teamMembership.teamId, team.id))
			.where(eq(teamMembership.id, id));

		return fullMembership;
	});

/**
 * Deletes a team membership.
 * @param input - Membership id and teamId
 * @returns Success confirmation
 */
const deleteMembership = authedRouter
	.input(teamMembershipDeleteSchema)
	.errors(commonErrors)
	.handler(async ({ context, input, errors }) => {
		const { id, teamId } = input;

		// Derive workspaceId from team
		const [teamData] = await db
			.select({ workspaceId: team.workspaceId })
			.from(team)
			.where(eq(team.id, teamId));
		if (!teamData) {
			throw new ORPCError("Team not found");
		}
		const workspaceId = teamData.workspaceId;

		const allowed = await isAllowed({
			userId: context.auth.session.userId,
			workspaceId,
			teamId,
			permissionKey: "team:manage_members",
		});
		if (!allowed)
			throw errors.UNAUTHORIZED({
				message: unauthorizedMessage("delete"),
			});

		// Fetch to validate and prevent self-deletion
		const [existing] = await db
			.select({
				userId: teamMembership.userId,
				roleName: roleDefinitions.name,
				status: teamMembership.status,
			})
			.from(teamMembership)
			.innerJoin(roleDefinitions, eq(teamMembership.roleId, roleDefinitions.id))
			.where(and(eq(teamMembership.id, id), eq(teamMembership.teamId, teamId)));

		if (!existing) {
			throw new ORPCError("Membership not found");
		}

		if (existing.userId === context.auth.session.userId) {
			throw new ORPCError("Cannot delete own membership");
		}

		// Prevent deleting last active lead/admin if applicable (assuming 'lead' role or similar)
		if (existing.roleName === "lead" && existing.status === "active") {
			const [leadCount] = await db
				.select({ count: count() })
				.from(teamMembership)
				.innerJoin(
					roleDefinitions,
					eq(teamMembership.roleId, roleDefinitions.id),
				)
				.where(
					and(
						eq(teamMembership.teamId, teamId),
						eq(roleDefinitions.name, "lead"),
						eq(teamMembership.status, "active"),
						ne(teamMembership.id, id),
					),
				);
			if (Number(leadCount?.count) === 0) {
				throw new ORPCError("Cannot delete the last lead of the team");
			}
		}

		await db
			.delete(teamMembership)
			.where(and(eq(teamMembership.id, id), eq(teamMembership.teamId, teamId)));

		return { success: true, message: "Team membership deleted successfully" };
	});

export const teamMembershipRouter = {
	create,
	list,
	get,
	update,
	delete: deleteMembership,
};
