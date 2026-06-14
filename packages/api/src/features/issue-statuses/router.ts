import { ORPCError } from "@orpc/server";
import { createId } from "@paralleldrive/cuid2";
import { db } from "db";
import { issueStatus } from "db/features/tracker/issue-statuses.schema";
import { and, eq } from "drizzle-orm";
import { omit } from "remeda";
import { authedRouter } from "../../context";
import { isAllowed } from "../../lib/abac";
import { workspaceInsertSchema } from "../workspaces/schema";
import { issueStatusGroupRouter } from "./group/router";
import {
	issueStatusCreateSchema,
	issueStatusDeleteSchema,
	issueStatusUpdateSchema,
} from "./issue-status.schema";
import { reorderStatusesSchema } from "./reorder.schema";

export const listStatuses = authedRouter
	.input(workspaceInsertSchema.pick({ id: true }))
	.handler(async ({ context, input }) => {
		const allowed = await isAllowed({
			userId: context.auth.session.userId,
			workspaceId: input.id,
			permissionKey: "issue_status:read",
		});
		if (!allowed) throw new ORPCError("Unauthorized to read statuses");

		const statuses = await db.query.issueStatus.findMany({
			where: {
				workspaceId: input.id,
			},
			with: {
				statusGroup: true,
			},
		});

		return statuses.sort((a, b) => {
			const aGroupOrderIndex = a.statusGroup?.orderIndex ?? 0;
			const bGroupOrderIndex = b.statusGroup?.orderIndex ?? 0;

			if (aGroupOrderIndex !== bGroupOrderIndex) {
				return aGroupOrderIndex - bGroupOrderIndex;
			}
			return a.orderIndex - b.orderIndex;
		});
	});

export const reorderStatuses = authedRouter
	.input(reorderStatusesSchema)
	.handler(async ({ context, input }) => {
		const allowed = await isAllowed({
			userId: context.auth.session.userId,
			workspaceId: input.workspaceId,
			permissionKey: "issue_status:reorder",
		});
		if (!allowed) throw new ORPCError("Unauthorized to reorder statuses");

		await db.transaction(async (tx) => {
			for (const [i, id] of input.orderedIds.entries()) {
				const [updated] = await tx
					.update(issueStatus)
					.set({ orderIndex: i })
					.where(
						and(
							eq(issueStatus.id, id),
							eq(issueStatus.workspaceId, input.workspaceId),
						),
					)
					.returning();
				if (!updated) {
					throw new ORPCError(`Status ID ${id} not found`);
				}
			}
		});

		return { success: true };
	});

export const createStatus = authedRouter
	.input(issueStatusCreateSchema)
	.handler(async ({ context, input }) => {
		const allowed = await isAllowed({
			userId: context.auth.session.userId,
			workspaceId: input.workspaceId,
			permissionKey: "issue_status:create",
		});
		if (!allowed) throw new ORPCError("Unauthorized to create status");

		const statusGroup = await db.query.issueStatusGroup.findFirst({
			where: {
				id: input.statusGroupId,
				workspaceId: input.workspaceId,
			},
		});
		if (!statusGroup) throw new ORPCError("Status group not found");

		const [created] = await db
			.insert(issueStatus)
			.values({
				id: createId(),
				...input,
			})
			.returning();
		return created;
	});

export const updateStatus = authedRouter
	.input(issueStatusUpdateSchema)
	.handler(async ({ context, input }) => {
		const allowed = await isAllowed({
			userId: context.auth.session.userId,
			workspaceId: input.workspaceId,
			permissionKey: "issue_status:update",
		});
		if (!allowed) throw new ORPCError("Unauthorized to update status");

		if (input.statusGroupId !== undefined) {
			const statusGroup = await db.query.issueStatusGroup.findFirst({
				where: {
					id: input.statusGroupId,
					workspaceId: input.workspaceId,
				},
			});
			if (!statusGroup) throw new ORPCError("Status group not found");
		}

		const values = omit(input, ["id", "workspaceId"]);
		const [updated] = await db
			.update(issueStatus)
			.set(values)
			.where(
				and(
					eq(issueStatus.id, input.id),
					eq(issueStatus.workspaceId, input.workspaceId),
				),
			)
			.returning();
		if (!updated) throw new ORPCError("Status not found");
		return updated;
	});

export const deleteStatus = authedRouter
	.input(issueStatusDeleteSchema)
	.handler(async ({ context, input }) => {
		const allowed = await isAllowed({
			userId: context.auth.session.userId,
			workspaceId: input.workspaceId,
			permissionKey: "issue_status:delete",
		});
		if (!allowed) throw new ORPCError("Unauthorized to delete status");

		const [deleted] = await db
			.delete(issueStatus)
			.where(
				and(
					eq(issueStatus.id, input.id),
					eq(issueStatus.workspaceId, input.workspaceId),
				),
			)
			.returning();
		if (!deleted) throw new ORPCError("Status not found");
		return deleted;
	});

export const issueStatusRouter = {
	create: createStatus,
	list: listStatuses,
	update: updateStatus,
	reorder: reorderStatuses,
	delete: deleteStatus,
	group: issueStatusGroupRouter,
};
