import { ORPCError } from "@orpc/server";
import { createId } from "@paralleldrive/cuid2";
import { db } from "db";
import {
	permissionsCatalog,
	roleDefinitions,
	rolePermissions,
} from "db/features/abac/abac.schema";
import {
	workspace,
	workspaceMembership,
} from "db/features/tracker/tracker.schema";
import { eq } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { authedRouter } from "../../context";
import { isAllowed } from "../../lib/abac";

export const list = authedRouter.handler(async ({ context }) => {
	const userWorkspaces = await db
		.select({ workspace })
		.from(workspaceMembership)
		.leftJoin(workspace, eq(workspaceMembership.workspaceId, workspace.id))
		.where(eq(workspaceMembership.userId, context.auth.session.userId));

	return userWorkspaces.map((item) => item);
});

export const create = authedRouter
	.input(createInsertSchema(workspace).omit({ id: true }))
	.handler(async ({ context, input }) => {
		return await db.transaction(async (tx) => {
			const [createdWorkspace] = await tx
				.insert(workspace)
				.values({ id: createId(), ...input })
				.returning({ id: workspace.id });

			if (!createdWorkspace) {
				throw new ORPCError("Failed to create workspace");
			}

			// Create a default 'Admin' role for the new workspace
			const [defaultAdminRole] = await tx
				.insert(roleDefinitions)
				.values({
					id: createId(),
					workspaceId: createdWorkspace.id,
					scopeLevel: "workspace",
					name: "Admin",
					createdBy: context.auth.session.userId,
					attributes: {},
				})
				.returning({ id: roleDefinitions.id });
			if (!defaultAdminRole) {
				throw new ORPCError(
					"Failed to create default admin role for the new workspace",
				);
			}

			// Get wildcard permission
			const [wildcardPermission] = await tx
				.select()
				.from(permissionsCatalog)
				.where(eq(permissionsCatalog.key, "*"));
			if (!wildcardPermission)
				throw new ORPCError(
					"Failed to get wildcard permission, database wasn't seeded properly",
				);

			// Attach wildcard permission to the admin role (allow, no constraint)
			await tx.insert(rolePermissions).values({
				roleId: defaultAdminRole.id,
				permissionId: wildcardPermission.id,
				effect: "allow",
				constraintId: null,
				attributes: {},
			});

			// Finally add the user to the workspace members
			try {
				await tx.insert(workspaceMembership).values({
					id: createId(),
					workspaceId: createdWorkspace.id,
					userId: context.auth.session.userId,
					roleId: defaultAdminRole.id,
					status: "active",
					invitedBy: null,
					joinedAt: new Date(),
					lastSeenAt: new Date(),
				});
			} catch (e) {
				console.error(e);
				throw new ORPCError("Failed to create workspace membership");
			}

			return createdWorkspace;
		});
	});

const update = authedRouter
	.input(createInsertSchema(workspace).partial().required({ id: true }))
	.errors({
		UNAUTHORIZED: {},
	})
	.handler(async ({ context, input, errors }) => {
		const allowed = await isAllowed({
			userId: context.auth.session.userId,
			workspaceId: input.id,
			permissionKey: "workspace:update",
		});
		if (!allowed)
			throw errors.UNAUTHORIZED({
				message:
					"You don't have permission to update this workspace or the workspace doesn't exist",
			});

		return await db
			.update(workspace)
			.set(input)
			.where(eq(workspace.id, input.id));
	});

export const workspaceRouter = {
	list,
	create,
	update,
};
