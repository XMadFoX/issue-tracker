import { ORPCError } from "@orpc/server";
import { createId } from "@paralleldrive/cuid2";
import { db } from "db";
import { roleDefinitions } from "db/features/abac/abac.schema";
import { user } from "db/features/auth/auth.schema";
import {
	workspace,
	workspaceMembership,
} from "db/features/tracker/tracker.schema";
import { and, asc, count, eq, isNull, ne } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { authedRouter } from "../../context";
import { isAllowed } from "../../lib/abac";
import { roleInsertSchema } from "../roles/router";

export const workspaceMembershipInsertSchema =
	createInsertSchema(workspaceMembership);

export const create = authedRouter
	.input(
		workspaceMembershipInsertSchema
			.omit({ id: true, joinedAt: true, lastSeenAt: true })
			.extend({
				roleId: roleInsertSchema.shape.id.optional(), // Optional, can be auto-assigned
			}),
	)
	.handler(async ({ context, input }) => {
		const {
			workspaceId,
			userId,
			roleId,
			status = "active",
			invitedBy = context.auth.session.userId, // Default to current user if inviting
			attributes = {},
		} = input;

		// Validate workspace exists and user has permission
		const allowed = await isAllowed({
			userId: context.auth.session.userId,
			workspaceId,
			permissionKey: "workspace:manage_members",
		});
		if (!allowed) {
			throw new ORPCError("Unauthorized to manage workspace members");
		}

		// Validate workspace exists
		const [ws] = await db
			.select({ id: workspace.id })
			.from(workspace)
			.where(eq(workspace.id, workspaceId));
		if (!ws) {
			throw new ORPCError("Workspace not found");
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
			.from(workspaceMembership)
			.where(
				and(
					eq(workspaceMembership.workspaceId, workspaceId),
					eq(workspaceMembership.userId, userId),
				),
			);
		if (Number(existingCount?.count) > 0) {
			throw new ORPCError("User is already a member of this workspace");
		}

		// Determine roleId: use provided or fetch default 'member' role
		let finalRoleId = roleId;
		if (!finalRoleId) {
			const [defaultRole] = await db
				.select({ id: roleDefinitions.id })
				.from(roleDefinitions)
				.where(
					and(
						eq(roleDefinitions.workspaceId, workspaceId),
						eq(roleDefinitions.name, "member"),
						isNull(roleDefinitions.teamId),
					),
				);
			if (!defaultRole) {
				throw new ORPCError("No default role available; roleId is required");
			}
			finalRoleId = defaultRole.id;
		} else {
			// Validate provided role exists in workspace
			const [role] = await db
				.select({ id: roleDefinitions.id })
				.from(roleDefinitions)
				.where(
					and(
						eq(roleDefinitions.id, finalRoleId),
						eq(roleDefinitions.workspaceId, workspaceId),
						isNull(roleDefinitions.teamId),
					),
				);
			if (!role) {
				throw new ORPCError("Invalid role for this workspace");
			}
		}

		const [created] = await db
			.insert(workspaceMembership)
			.values({
				id: createId(),
				workspaceId,
				userId,
				roleId: finalRoleId,
				status,
				invitedBy,
				joinedAt: new Date(),
				lastSeenAt: new Date(),
				attributes,
			})
			.returning();

		if (!created) {
			throw new ORPCError("Failed to create workspace membership");
		}

		// Return full membership with joins for consistency
		const [fullMembership] = await db
			.select()
			.from(workspaceMembership)
			.innerJoin(user, eq(workspaceMembership.userId, user.id))
			.innerJoin(
				roleDefinitions,
				eq(workspaceMembership.roleId, roleDefinitions.id),
			)
			.where(eq(workspaceMembership.id, created.id));

		return fullMembership;
	});

export const list = authedRouter
	.input(z.object({ workspaceId: z.string() }))
	.handler(async ({ context, input }) => {
		const { workspaceId } = input;

		const allowed = await isAllowed({
			userId: context.auth.session.userId,
			workspaceId,
			permissionKey: "workspace:read_members",
		});
		if (!allowed) {
			throw new ORPCError("Unauthorized to read workspace members");
		}

		const memberships = await db
			.select()
			.from(workspaceMembership)
			.innerJoin(user, eq(workspaceMembership.userId, user.id))
			.innerJoin(
				roleDefinitions,
				eq(workspaceMembership.roleId, roleDefinitions.id),
			)
			.where(eq(workspaceMembership.workspaceId, workspaceId))
			.orderBy(asc(workspaceMembership.joinedAt)); // Ascending for chronological order

		return memberships;
	});

export const get = authedRouter
	.input(z.object({ id: z.string(), workspaceId: z.string() }))
	.handler(async ({ context, input }) => {
		const { id, workspaceId } = input;

		const allowed = await isAllowed({
			userId: context.auth.session.userId,
			workspaceId,
			permissionKey: "workspace:read_members",
		});
		if (!allowed) {
			throw new ORPCError("Unauthorized to read workspace members");
		}

		const [membership] = await db
			.select()
			.from(workspaceMembership)
			.innerJoin(user, eq(workspaceMembership.userId, user.id))
			.innerJoin(
				roleDefinitions,
				eq(workspaceMembership.roleId, roleDefinitions.id),
			)
			.where(
				and(
					eq(workspaceMembership.id, id),
					eq(workspaceMembership.workspaceId, workspaceId),
				),
			);

		if (!membership) {
			throw new ORPCError("Membership not found");
		}

		return membership;
	});

const update = authedRouter
	.input(
		workspaceMembershipInsertSchema
			.partial()
			.required({ id: true, workspaceId: true }),
	)
	.handler(async ({ context, input }) => {
		const { id, workspaceId, roleId, status, attributes } = input;

		const allowed = await isAllowed({
			userId: context.auth.session.userId,
			workspaceId,
			permissionKey: "workspace:manage_members",
		});
		if (!allowed) {
			throw new ORPCError("Unauthorized to update workspace membership");
		}

		// Fetch existing to validate
		const [existing] = await db
			.select({ userId: workspaceMembership.userId })
			.from(workspaceMembership)
			.where(
				and(
					eq(workspaceMembership.id, id),
					eq(workspaceMembership.workspaceId, workspaceId),
				),
			);

		if (!existing) {
			throw new ORPCError("Membership not found");
		}

		// Prevent updating own membership to inactive status
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
						isNull(roleDefinitions.teamId),
					),
				);
			if (!role) {
				throw new ORPCError("Invalid role for this workspace");
			}
		}

		const values = {
			...(roleId && { roleId }),
			...(status && { status }),
			...(Object.keys(attributes || {}).length > 0 && { attributes }),
			...(status === "active" && { lastSeenAt: new Date() }), // Update lastSeen only if active
		};

		const [updated] = await db
			.update(workspaceMembership)
			.set(values)
			.where(
				and(
					eq(workspaceMembership.id, id),
					eq(workspaceMembership.workspaceId, workspaceId),
				),
			)
			.returning();

		if (!updated) {
			throw new ORPCError("Failed to update workspace membership");
		}

		// Return full updated membership with joins for consistency
		const [fullMembership] = await db
			.select()
			.from(workspaceMembership)
			.innerJoin(user, eq(workspaceMembership.userId, user.id))
			.innerJoin(
				roleDefinitions,
				eq(workspaceMembership.roleId, roleDefinitions.id),
			)
			.where(eq(workspaceMembership.id, id));

		return fullMembership;
	});

const deleteMembership = authedRouter
	.input(z.object({ id: z.string(), workspaceId: z.string() }))
	.handler(async ({ context, input }) => {
		const { id, workspaceId } = input;

		const allowed = await isAllowed({
			userId: context.auth.session.userId,
			workspaceId,
			permissionKey: "workspace:manage_members",
		});
		if (!allowed) {
			throw new ORPCError("Unauthorized to delete workspace membership");
		}

		// Fetch to validate and prevent self-deletion
		const [existing] = await db
			.select({
				userId: workspaceMembership.userId,
				roleName: roleDefinitions.name,
				status: workspaceMembership.status,
			})
			.from(workspaceMembership)
			.innerJoin(
				roleDefinitions,
				eq(workspaceMembership.roleId, roleDefinitions.id),
			)
			.where(
				and(
					eq(workspaceMembership.id, id),
					eq(workspaceMembership.workspaceId, workspaceId),
				),
			);

		if (!existing) {
			throw new ORPCError("Membership not found");
		}

		if (existing.userId === context.auth.session.userId) {
			throw new ORPCError("Cannot delete own membership");
		}

		// Prevent deleting the last active admin to avoid locking out the workspace
		// role name is not really reliable tho
		if (existing.roleName === "admin" && existing.status === "active") {
			const result = await db
				.select({ count: count() })
				.from(workspaceMembership)
				.innerJoin(
					roleDefinitions,
					eq(workspaceMembership.roleId, roleDefinitions.id),
				)
				.where(
					and(
						eq(workspaceMembership.workspaceId, workspaceId),
						eq(roleDefinitions.name, "admin"),
						eq(workspaceMembership.status, "active"),
						ne(workspaceMembership.id, id),
					),
				);

			const remainingAdmins = result[0]?.count ?? 0;

			if (remainingAdmins === 0) {
				throw new ORPCError("Cannot delete the last admin of the workspace");
			}
		}

		await db
			.delete(workspaceMembership)
			.where(
				and(
					eq(workspaceMembership.id, id),
					eq(workspaceMembership.workspaceId, workspaceId),
				),
			);

		return { success: true };
	});
export const workspaceMembershipRouter = {
	create,
	list,
	get,
	update,
	delete: deleteMembership,
};
