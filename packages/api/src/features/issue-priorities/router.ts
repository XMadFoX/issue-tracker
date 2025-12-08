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

export const issuePriorityRouter = {
	list: listPriorities,
};
