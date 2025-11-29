import { ORPCError } from "@orpc/server";
import { createId } from "@paralleldrive/cuid2";
import { db } from "db";
import { issueStatusGroup } from "db/features/tracker/issue-statuses.schema";
import { eq } from "drizzle-orm";
import { omit } from "remeda";
import { authedRouter } from "../../../context";
import { isAllowed } from "../../../lib/abac";
import { workspaceInsertSchema } from "../../workspaces/schema";
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

export const issueStatusGroupRouter = {
	listStatusGroups,
};
