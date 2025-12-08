import { createId } from "@paralleldrive/cuid2";
import { db } from "db";
import { issuePriority } from "db/features/tracker/issue-priorities.schema";
import { eq, inArray, sql } from "drizzle-orm";
import { omit } from "remeda";
import { authedRouter } from "../../context";
import { isAllowed } from "../../lib/abac";
import {
	issuePriorityCreateSchema,
	issuePriorityDeleteSchema,
	issuePriorityListSchema,
	issuePriorityUpdateSchema,
} from "./issue-priority.schema";
import { reorderPrioritiesSchema } from "./reorder.schema";

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

export const issuePriorityRouter = {
	list: listPriorities,
	create: createPriority,
	update: updatePriority,
	delete: deletePriority,
};
