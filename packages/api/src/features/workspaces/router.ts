import { getLogger } from "@logtape/logtape";
import { ORPCError } from "@orpc/server";
import { createId } from "@paralleldrive/cuid2";
import { db } from "db";
import { roleDefinitions } from "db/features/abac/abac.schema";
import { issuePriority } from "db/features/tracker/issue-priorities.schema";
import {
	issueStatus,
	issueStatusGroup,
} from "db/features/tracker/issue-statuses.schema";
import {
	team,
	teamMembership,
	workspace,
	workspaceMembership,
} from "db/features/tracker/tracker.schema";
import { eq } from "drizzle-orm";
import { authedRouter } from "../../context";
import { isAllowed } from "../../lib/abac";
import { buildDefaultIssuePrioritySeed } from "../issue-priorities/defaults";
import { buildDefaultIssueStatusSeed } from "../issue-statuses/defaults";
import { ensureDefaultIssueTypes } from "../issue-types/defaults";
import {
	ensureTeamBuiltInRoles,
	ensureWorkspaceBuiltInRoles,
} from "./defaults";
import {
	workspaceCreateSchema,
	workspaceDeleteSchema,
	workspaceGetBySlugSchema,
	workspaceUpdateSchema,
} from "./schema";

const logger = getLogger(["prism-tracker", "api", "workspace"]);

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

		if (!res) throw errors.NOT_FOUND();
		const allowed = await isAllowed({
			userId: context.auth.session.userId,
			workspaceId: res.id,
			permissionKey: "workspace:read",
		});
		if (!allowed) {
			throw errors.NOT_FOUND();
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

			// seed issue types
			await ensureDefaultIssueTypes({
				executor: tx,
				workspaceId: createdWorkspace.id,
			});

			const roles = await ensureWorkspaceBuiltInRoles({
				executor: tx,
				workspaceId: createdWorkspace.id,
				createdBy: context.auth.session.userId,
			});

			// Finally add the user to the workspace members
			try {
				await tx.insert(workspaceMembership).values({
					id: createId(),
					workspaceId: createdWorkspace.id,
					userId: context.auth.session.userId,
					roleId: roles.adminRoleId,
					status: "active",
					invitedBy: null,
					joinedAt: new Date(),
					lastSeenAt: new Date(),
				});
			} catch (e) {
				logger.error("Failed to create workspace membership: {error}", {
					error: e,
				});
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

			const teamRoles = await ensureTeamBuiltInRoles({
				executor: tx,
				workspaceId: createdWorkspace.id,
				teamId: defaultTeam.id,
				createdBy: context.auth.session.userId,
			});

			// Add the creator as a member (lead) of the default team so they are
			// available for issue assignment.
			try {
				await tx.insert(teamMembership).values({
					id: createId(),
					teamId: defaultTeam.id,
					userId: context.auth.session.userId,
					roleId: teamRoles.leadRoleId,
					status: "active",
					invitedBy: null,
					joinedAt: new Date(),
				});
			} catch (e) {
				logger.error("Failed to create default team membership: {error}", {
					error: e,
				});
				throw new ORPCError("Failed to create default team membership");
			}

			return createdWorkspace;
		});
	});

const commonErrors = { INVALID_CONFIRMATION: {}, UNAUTHORIZED: {} };
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

		// Require a server-verified typed confirmation so authorized callers cannot
		// delete a workspace by accidentally sending only a stale or wrong id.
		const [workspaceToDelete] = await db
			.select({ slug: workspace.slug })
			.from(workspace)
			.where(eq(workspace.id, input.id));

		if (workspaceToDelete?.slug !== input.confirmationSlug) {
			throw errors.INVALID_CONFIRMATION({
				message: "Workspace confirmation slug does not match",
			});
		}

		return await db.delete(workspace).where(eq(workspace.id, input.id));
	});

export const workspaceRouter = {
	list,
	getBySlug,
	create,
	update,
	delete: deleteWorkspace,
};
