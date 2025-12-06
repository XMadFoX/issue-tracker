import { ORPCError } from "@orpc/server";
import { createId } from "@paralleldrive/cuid2";
import { db } from "db";
import { label } from "db/features/tracker/labels.schema";
import { and, eq, isNull, or } from "drizzle-orm";
import { omit } from "remeda";
import { authedRouter } from "../../context";
import { isAllowed } from "../../lib/abac";
import {
	labelCreateSchema,
	labelDeleteSchema,
	labelListSchema,
	labelUpdateSchema,
} from "./schema";

export const listLabels = authedRouter
	.input(labelListSchema)
	.handler(async ({ context, input }) => {
		const allowed = await isAllowed({
			userId: context.auth.session.userId,
			workspaceId: input.workspaceId,
			teamId: input.scope === "team" ? (input.teamId ?? undefined) : undefined,
			permissionKey: "label:read",
		});
		if (!allowed) throw new ORPCError("Unauthorized to read labels");

		const where = (() => {
			if (input.scope === "workspace") {
				return and(
					eq(label.workspaceId, input.workspaceId),
					isNull(label.teamId),
				);
			}
			if (input.scope === "team") {
				if (!input.teamId)
					throw new ORPCError("teamId required for team scope");
				return and(
					eq(label.workspaceId, input.workspaceId),
					eq(label.teamId, input.teamId),
				);
			}
			// all
			if (input.teamId) {
				return and(
					eq(label.workspaceId, input.workspaceId),
					or(isNull(label.teamId), eq(label.teamId, input.teamId)),
				);
			}
			return and(
				eq(label.workspaceId, input.workspaceId),
				isNull(label.teamId),
			);
		})();

		const rows = await db
			.select()
			.from(label)
			.where(where)
			.limit(input.limit)
			.offset(input.offset);
		return rows;
	});

export const createLabel = authedRouter
	.input(labelCreateSchema)
	.handler(async ({ context, input }) => {
		const allowed = await isAllowed({
			userId: context.auth.session.userId,
			workspaceId: input.workspaceId,
			teamId: input.teamId ?? undefined,
			permissionKey: "label:create",
		});
		if (!allowed) throw new ORPCError("Unauthorized to create label");

		const [created] = await db
			.insert(label)
			.values({ id: createId(), ...input })
			.returning();
		return created;
	});

export const labelRouter = {
	list: listLabels,
	create: createLabel,
};
