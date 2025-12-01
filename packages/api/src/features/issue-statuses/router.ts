import { ORPCError } from "@orpc/server";
import { createId } from "@paralleldrive/cuid2";
import { db } from "db";
import { issueStatus } from "db/features/tracker/issue-statuses.schema";
import { eq } from "drizzle-orm";
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

export const listStatuses = authedRouter
	.input(workspaceInsertSchema.pick({ id: true }))
	.handler(async ({ context, input }) => {
		const allowed = await isAllowed({
			userId: context.auth.session.userId,
			workspaceId: input.id,
			permissionKey: "issue_status:read",
		});
		if (!allowed) throw new ORPCError("Unauthorized to read statuses");

		const statuses = await db
			.select()
			.from(issueStatus)
			.where(eq(issueStatus.workspaceId, input.id))
			.orderBy(issueStatus.orderIndex);
		return statuses;
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

		const values = omit(input, ["id", "workspaceId"]);
		const [updated] = await db
			.update(issueStatus)
			.set(values)
			.where(eq(issueStatus.id, input.id))
			.returning();
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
			.where(eq(issueStatus.id, input.id))
			.returning();
		return deleted;
	});

export const issueStatusRouter = {
	listStatuses,
	createStatus,
	updateStatus,
	deleteStatus,
};
