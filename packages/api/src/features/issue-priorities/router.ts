import { createId } from "@paralleldrive/cuid2";
import { db } from "db";
import { issuePriority } from "db/features/tracker/issue-priorities.schema";
import { and, eq, inArray, sql } from "drizzle-orm";
import { omit } from "remeda";
import { authedRouter } from "../../context";
import { isAllowed } from "../../lib/abac";
import {
	issuePriorityCreateSchema,
	issuePriorityDeleteSchema,
	issuePriorityListSchema,
	issuePriorityUpdateSchema,
	reorderPrioritiesSchema,
} from "./issue-priority.schema";

const commonErrors = {
	UNAUTHORIZED: {},
};

export const listPriorities = authedRouter
	.input(issuePriorityListSchema)
	.errors(commonErrors)
	.handler(async ({ context, input, errors }) => {
		const allowed = await isAllowed({
			userId: context.auth.session.userId,
			workspaceId: input.workspaceId,
			permissionKey: "issue_priority:read",
		});
		if (!allowed) throw errors.UNAUTHORIZED;

		const rows = await db
			.select()
			.from(issuePriority)
			.where(eq(issuePriority.workspaceId, input.workspaceId))
			.orderBy(issuePriority.rank)
			.limit(input.limit)
			.offset(input.offset);

		return rows;
	});

export const createPriority = authedRouter
	.input(issuePriorityCreateSchema)
	.errors(commonErrors)
	.handler(async ({ context, input, errors }) => {
		const allowed = await isAllowed({
			userId: context.auth.session.userId,
			workspaceId: input.workspaceId,
			permissionKey: "issue_priority:create",
		});
		if (!allowed) throw errors.UNAUTHORIZED;

		const [created] = await db
			.insert(issuePriority)
			.values({ id: createId(), ...input })
			.returning();
		return created;
	});

export const updatePriority = authedRouter
	.input(issuePriorityUpdateSchema)
	.errors({ ...commonErrors, NOT_FOUND: {} })
	.handler(async ({ context, input, errors }) => {
		const allowed = await isAllowed({
			userId: context.auth.session.userId,
			workspaceId: input.workspaceId,
			permissionKey: "issue_priority:update",
		});
		if (!allowed) throw errors.UNAUTHORIZED;

		const values = omit(input, ["id", "workspaceId"]);
		const [updated] = await db
			.update(issuePriority)
			.set(values)
			.where(eq(issuePriority.id, input.id))
			.returning();
		if (!updated) throw errors.NOT_FOUND;
		return updated;
	});

export const deletePriority = authedRouter
	.input(issuePriorityDeleteSchema)
	.errors(commonErrors)
	.handler(async ({ context, input, errors }) => {
		const allowed = await isAllowed({
			userId: context.auth.session.userId,
			workspaceId: input.workspaceId,
			permissionKey: "issue_priority:delete",
		});
		if (!allowed) throw errors.UNAUTHORIZED;

		const [deleted] = await db
			.delete(issuePriority)
			.where(eq(issuePriority.id, input.id))
			.returning();
		return deleted;
	});

export const reorderPriorities = authedRouter
	.input(reorderPrioritiesSchema)
	.errors({ ...commonErrors, NOT_FOUND: {} })
	.handler(async ({ context, input, errors }) => {
		const allowed = await isAllowed({
			userId: context.auth.session.userId,
			workspaceId: input.workspaceId,
			permissionKey: "issue_priority:reorder",
		});
		if (!allowed) throw errors.UNAUTHORIZED;

		// verify all ordered IDs exist in the workspace
		const existingPriorities = await db
			.select({ id: issuePriority.id })
			.from(issuePriority)
			.where(
				and(
					eq(issuePriority.workspaceId, input.workspaceId),
					inArray(issuePriority.id, input.orderedIds),
				),
			);

		if (existingPriorities.length !== input.orderedIds.length) {
			throw errors.NOT_FOUND;
		}

		const TEMP_RANK_OFFSET = 1000000;

		await db.transaction(async (tx) => {
			// temporarily bump ranks to avoid unique constraint violations during reassignment
			await tx
				.update(issuePriority)
				.set({ rank: sql`${issuePriority.rank} + ${TEMP_RANK_OFFSET}` })
				.where(
					and(
						eq(issuePriority.workspaceId, input.workspaceId),
						inArray(issuePriority.id, input.orderedIds),
					),
				);

			// Phase 2: Assign new sequential ranks using type-safe updates
			for (const [i, id] of input.orderedIds.entries()) {
				await tx
					.update(issuePriority)
					.set({ rank: i })
					.where(
						and(
							eq(issuePriority.id, id),
							eq(issuePriority.workspaceId, input.workspaceId),
						),
					);
			}
		});

		return { success: true };
	});

export const issuePriorityRouter = {
	list: listPriorities,
	create: createPriority,
	update: updatePriority,
	delete: deletePriority,
	reorder: reorderPriorities,
};
