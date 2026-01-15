import { ORPCError } from "@orpc/server";
import { createId } from "@paralleldrive/cuid2";
import { db } from "db";
import {
	permissionsCatalog,
	roleDefinitions,
	rolePermissions,
} from "db/features/abac/abac.schema";
import { issuePriority } from "db/features/tracker/issue-priorities.schema";
import {
	issueStatus,
	issueStatusGroup,
} from "db/features/tracker/issue-statuses.schema";
import {
	team,
	workspace,
	workspaceMembership,
} from "db/features/tracker/tracker.schema";
import { eq } from "drizzle-orm";
import { authedRouter } from "../../context";
import { isAllowed } from "../../lib/abac";
import { buildDefaultIssuePrioritySeed } from "../issue-priorities/defaults";
import { buildDefaultIssueStatusSeed } from "../issue-statuses/defaults";
import {
	workspaceCreateSchema,
	workspaceDeleteSchema,
	workspaceGetBySlugSchema,
	workspaceUpdateSchema,
} from "./schema";

export const list = authedRouter.handler(async ({ context }) => {
	const userWorkspaces = await db
		.select({
			workspace,
			roleName: roleDefinitions.name,
			joinedAt: workspaceMembership.joinedAt,
		})
		.from(workspaceMembership)
		.innerJoin(workspace, eq(workspaceMembership.workspaceId, workspace.id))
		.innerJoin(
			roleDefinitions,
			eq(workspaceMembership.roleId, roleDefinitions.id),
		)
		.where(eq(workspaceMembership.userId, context.auth.session.userId));

	return userWorkspaces.map(({ workspace, roleName, joinedAt }) => ({
		...workspace,
		roleName,
		joinedAt,
	}));
});

export const getBySlug = authedRouter
	.input(workspaceGetBySlugSchema)
	.errors({
		NOT_FOUND: {
			message:
				"Workspace not found or you are not authorized to view this workspace.",
		},
	})
	.handler(async ({ context, errors, input }) => {
		const [res] = await db
			.select()
			.from(workspace)
			.where(eq(workspace.slug, input.slug));

		if (!res) throw errors.NOT_FOUND;
		const allowed = await isAllowed({
			userId: context.auth.session.userId,
			workspaceId: res.id,
			permissionKey: "workspace:read",
		});
		if (!allowed) {
			throw errors.NOT_FOUND;
		}

		return res;
	});

export const create = authedRouter
	.input(workspaceCreateSchema)
	.handler(async ({ context, input }) => {
		return await db.transaction(async (tx) => {
			const [createdWorkspace] = await tx
				.insert(workspace)
				.values({ id: createId(), ...input })
				.returning({ id: workspace.id, slug: workspace.slug });

			if (!createdWorkspace) {
				throw new ORPCError("Failed to create workspace");
			}

			// seed issue statuses & status groups
			const { groups, statuses } = buildDefaultIssueStatusSeed(
				createdWorkspace.id,
			);

			await tx.insert(issueStatusGroup).values(groups);
			if (statuses.length > 0) {
				await tx.insert(issueStatus).values(statuses);
			}

			// seed issue priorities
			const { priorities } = buildDefaultIssuePrioritySeed(createdWorkspace.id);
			await tx.insert(issuePriority).values(priorities);

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

			// Create a default team
			const [defaultTeam] = await tx
				.insert(team)
				.values({
					id: createId(),
					workspaceId: createdWorkspace.id,
					name: "Default Team",
					key: "default",
					privacy: "private",
				})
				.returning({ id: team.id });
			if (!defaultTeam) {
				throw new ORPCError(
					"Failed to create default team for the new workspace",
				);
			}

			return createdWorkspace;
		});
	});

const commonErrors = { UNAUTHORIZED: {} };
const unauthorizedMessage = (action: "update" | "delete") =>
	`You don't have permission to ${action} this workspace or the workspace doesn't exist`;

const update = authedRouter
	.input(workspaceUpdateSchema)
	.errors(commonErrors)
	.handler(async ({ context, input, errors }) => {
		const allowed = await isAllowed({
			userId: context.auth.session.userId,
			workspaceId: input.id,
			permissionKey: "workspace:update",
		});
		if (!allowed)
			throw errors.UNAUTHORIZED({
				message: unauthorizedMessage("update"),
			});

		return await db
			.update(workspace)
			.set(input)
			.where(eq(workspace.id, input.id));
	});

const deleteWorkspace = authedRouter
	.input(workspaceDeleteSchema)
	.errors(commonErrors)
	.handler(async ({ context, input, errors }) => {
		const allowed = await isAllowed({
			userId: context.auth.session.userId,
			workspaceId: input.id,
			permissionKey: "workspace:delete",
		});
		if (!allowed)
			throw errors.UNAUTHORIZED({
				message: unauthorizedMessage("delete"),
			});

		return await db.delete(workspace).where(eq(workspace.id, input.id));
	});

export const workspaceRouter = {
	list,
	getBySlug,
	create,
	update,
	delete: deleteWorkspace,
};
