import { ORPCError } from "@orpc/server";
import { createId } from "@paralleldrive/cuid2";
import { db } from "db";
import {
	issueStatus,
	issueStatusGroup,
} from "db/features/tracker/issue-statuses.schema";
import { and, eq } from "drizzle-orm";
import { omit } from "remeda";
import { authedRouter } from "../../../context";
import { isAllowed } from "../../../lib/abac";
import { workspaceInsertSchema } from "../../workspaces/schema";
import { reorderStatusGroupsSchema } from "../reorder.schema";
import {
	issueStatusGroupCreateSchema,
	issueStatusGroupDeleteSchema,
	issueStatusGroupUpdateSchema,
} from "./schema";

export const listStatusGroups = authedRouter
	.input(workspaceInsertSchema.pick({ id: true }))
	.errors({
		UNAUTHORIZED: {},
	})
	.handler(async ({ context, input, errors }) => {
		const allowed = await isAllowed({
			userId: context.auth.session.userId,
			workspaceId: input.id,
			permissionKey: "issue_status_group:read",
		});
		if (!allowed)
			throw errors.UNAUTHORIZED({
				message: "Unauthorized to read status groups",
			});

		const groups = await db
			.select()
			.from(issueStatusGroup)
			.where(eq(issueStatusGroup.workspaceId, input.id))
			.orderBy(issueStatusGroup.orderIndex);
		return groups;
	});

export const reorderStatusGroups = authedRouter
	.input(reorderStatusGroupsSchema)
	.handler(async ({ context, input }) => {
		const allowed = await isAllowed({
			userId: context.auth.session.userId,
			workspaceId: input.workspaceId,
			permissionKey: "issue_status_group:reorder",
		});
		if (!allowed) throw new ORPCError("Unauthorized to reorder status groups");

		await db.transaction(async (tx) => {
			for (const [i, id] of input.orderedIds.entries()) {
				// id is guaranteed to be a string by the schema; still validate emptiness
				if (id.trim() === "") {
					throw new ORPCError(`Invalid status group ID at index ${i}`);
				}
				const [updated] = await tx
					.update(issueStatusGroup)
					.set({ orderIndex: i })
					.where(
						and(
							eq(issueStatusGroup.id, id),
							eq(issueStatusGroup.workspaceId, input.workspaceId),
						),
					)
					.returning();
				if (!updated) {
					throw new ORPCError(`Status group ID ${id} not found`);
				}
			}
		});

		return { success: true };
	});

export const createStatusGroup = authedRouter
	.input(issueStatusGroupCreateSchema)
	.handler(async ({ context, input }) => {
		const allowed = await isAllowed({
			userId: context.auth.session.userId,
			workspaceId: input.workspaceId,
			permissionKey: "issue_status_group:create",
		});
		if (!allowed) throw new ORPCError("Unauthorized to create status group");

		const [created] = await db
			.insert(issueStatusGroup)
			.values({
				id: createId(),
				...input,
			})
			.returning();
		return created;
	});

export const updateStatusGroup = authedRouter
	.input(issueStatusGroupUpdateSchema)
	.handler(async ({ context, input }) => {
		const allowed = await isAllowed({
			userId: context.auth.session.userId,
			workspaceId: input.workspaceId,
			permissionKey: "issue_status_group:update",
		});
		if (!allowed) throw new ORPCError("Unauthorized to update status group");

		const values = omit(input, ["id", "workspaceId"]);
		const [updated] = await db
			.update(issueStatusGroup)
			.set(values)
			.where(
				and(
					eq(issueStatusGroup.id, input.id),
					eq(issueStatusGroup.workspaceId, input.workspaceId),
					eq(issueStatusGroup.isEditable, true),
				),
			)
			.returning();
		if (!updated) throw new ORPCError("Status group not found");
		return updated;
	});

export const deleteStatusGroup = authedRouter
	.input(issueStatusGroupDeleteSchema)
	.errors({
		CONFLICT: {},
	})
	.handler(async ({ context, input, errors }) => {
		const allowed = await isAllowed({
			userId: context.auth.session.userId,
			workspaceId: input.workspaceId,
			permissionKey: "issue_status_group:delete",
		});
		if (!allowed) throw new ORPCError("Unauthorized to delete status group");

		return await db.transaction(async (tx) => {
			const [group] = await tx
				.select({ id: issueStatusGroup.id })
				.from(issueStatusGroup)
				.where(
					and(
						eq(issueStatusGroup.id, input.id),
						eq(issueStatusGroup.workspaceId, input.workspaceId),
						eq(issueStatusGroup.isEditable, true),
					),
				)
				.limit(1)
				.for("update");
			if (!group) throw new ORPCError("Status group not found");

			const [existingStatus] = await tx
				.select({ id: issueStatus.id })
				.from(issueStatus)
				.where(eq(issueStatus.statusGroupId, input.id))
				.limit(1);
			if (existingStatus) {
				throw errors.CONFLICT({
					message: "Cannot delete a status group that contains statuses",
				});
			}

			const [deleted] = await tx
				.delete(issueStatusGroup)
				.where(
					and(
						eq(issueStatusGroup.id, input.id),
						eq(issueStatusGroup.workspaceId, input.workspaceId),
						eq(issueStatusGroup.isEditable, true),
					),
				)
				.returning();
			if (!deleted) throw new ORPCError("Status group not found");
			return deleted;
		});
	});

export const issueStatusGroupRouter = {
	create: createStatusGroup,
	list: listStatusGroups,
	update: updateStatusGroup,
	reorder: reorderStatusGroups,
	delete: deleteStatusGroup,
};
