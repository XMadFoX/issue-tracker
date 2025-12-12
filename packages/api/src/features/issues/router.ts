import { createId } from "@paralleldrive/cuid2";
import { db } from "db";
import { issue } from "db/features/tracker/issues.schema";
import { and, desc, eq, sql } from "drizzle-orm";
import { omit } from "remeda";
import { authedRouter } from "../../context";
import { isAllowed } from "../../lib/abac";
import {
	issueCreateSchema,
	issueDeleteSchema,
	issueListSchema,
	issueUpdateSchema,
} from "./schema";

const commonErrors = {
	UNAUTHORIZED: {},
};

const updateDeleteErrors = {
	...commonErrors,
	NOT_FOUND: {},
};

const listIssues = authedRouter
	.input(issueListSchema)
	.errors(commonErrors)
	.handler(async ({ context, input, errors }) => {
		const allowed = await isAllowed({
			userId: context.auth.session.userId,
			workspaceId: input.workspaceId,
			permissionKey: "issue:read",
		});
		if (!allowed) throw errors.UNAUTHORIZED;

		const rows = await db
			.select()
			.from(issue)
			.where(eq(issue.workspaceId, input.workspaceId))
			.orderBy(issue.sortOrder, desc(issue.createdAt))
			.limit(input.limit)
			.offset(input.offset);

		return rows;
	});

const createIssue = authedRouter
	.input(issueCreateSchema)
	.errors(commonErrors)
	.handler(async ({ context, input, errors }) => {
		const { workspaceId, teamId } = input;
		const allowed = await isAllowed({
			userId: context.auth.session.userId,
			workspaceId,
			permissionKey: "issue:create",
		});
		if (!allowed) throw errors.UNAUTHORIZED;

		const [maxRow] = await db
			.select({ maxNumber: sql<number>`max(${issue.number})` })
			.from(issue)
			.where(and(eq(issue.teamId, teamId), eq(issue.workspaceId, workspaceId)))
			.limit(1);

		const nextNumber = (maxRow?.maxNumber ?? 0) + 1;

		const [created] = await db
			.insert(issue)
			.values({
				id: createId(),
				number: nextNumber,
				creatorId: context.auth.session.userId,
				...input,
			})
			.returning();

		return created;
	});

const updateIssue = authedRouter
	.input(issueUpdateSchema)
	.errors(updateDeleteErrors)
	.handler(async ({ context, input, errors }) => {
		const allowed = await isAllowed({
			userId: context.auth.session.userId,
			workspaceId: input.workspaceId,
			permissionKey: "issue:update",
		});
		if (!allowed) throw errors.UNAUTHORIZED;

		const values = omit(input, ["id", "workspaceId"]);
		const [updated] = await db
			.update(issue)
			.set(values)
			.where(
				and(eq(issue.id, input.id), eq(issue.workspaceId, input.workspaceId)),
			)
			.returning();
		if (!updated) throw errors.NOT_FOUND;
		return updated;
	});

const deleteIssue = authedRouter
	.input(issueDeleteSchema)
	.errors(updateDeleteErrors)
	.handler(async ({ context, input, errors }) => {
		const allowed = await isAllowed({
			userId: context.auth.session.userId,
			workspaceId: input.workspaceId,
			permissionKey: "issue:delete",
		});
		if (!allowed) throw errors.UNAUTHORIZED;

		const [deleted] = await db
			.delete(issue)
			.where(
				and(eq(issue.id, input.id), eq(issue.workspaceId, input.workspaceId)),
			)
			.returning();
		if (!deleted) throw errors.NOT_FOUND;
		return deleted;
	});

export const issueRouter = {
	list: listIssues,
	create: createIssue,
	update: updateIssue,
	delete: deleteIssue,
};
