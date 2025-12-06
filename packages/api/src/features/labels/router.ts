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

const commonErrors = {
	UNAUTHORIZED: {},
};

export const listLabels = authedRouter
	.input(labelListSchema)
	.errors(commonErrors)
	.handler(async ({ context, input, errors }) => {
		const allowed = await isAllowed({
			userId: context.auth.session.userId,
			workspaceId: input.workspaceId,
			teamId: input.scope === "team" ? (input.teamId ?? undefined) : undefined,
			permissionKey: "label:read",
		});
		if (!allowed) throw errors.UNAUTHORIZED;

		const where = (() => {
			if (input.scope === "workspace") {
				return and(
					eq(label.workspaceId, input.workspaceId),
					isNull(label.teamId),
				);
			}
			if (input.scope === "team") {
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
	.errors(commonErrors)
	.handler(async ({ context, input, errors }) => {
		const allowed = await isAllowed({
			userId: context.auth.session.userId,
			workspaceId: input.workspaceId,
			teamId: input.teamId ?? undefined,
			permissionKey: "label:create",
		});
		if (!allowed) throw errors.UNAUTHORIZED;

		const [created] = await db
			.insert(label)
			.values({ id: createId(), ...input })
			.returning();
		return created;
	});

export const updateLabel = authedRouter
	.input(labelUpdateSchema)
	.errors({ ...commonErrors, NOT_FOUND: {} })
	.handler(async ({ context, input, errors }) => {
		const allowed = await isAllowed({
			userId: context.auth.session.userId,
			workspaceId: input.workspaceId,
			teamId: input.teamId ?? undefined,
			permissionKey: "label:update",
		});
		if (!allowed) throw errors.UNAUTHORIZED;

		const values = omit(input, ["id", "workspaceId"]);
		const [updated] = await db
			.update(label)
			.set(values)
			.where(eq(label.id, input.id))
			.returning();
		if (!updated) throw errors.NOT_FOUND;
		return updated;
	});

export const deleteLabel = authedRouter
	.input(labelDeleteSchema)
	.errors(commonErrors)
	.handler(async ({ context, input, errors }) => {
		const allowed = await isAllowed({
			userId: context.auth.session.userId,
			workspaceId: input.workspaceId,
			permissionKey: "label:delete",
		});
		if (!allowed) throw errors.UNAUTHORIZED;

		const [deleted] = await db
			.delete(label)
			.where(eq(label.id, input.id))
			.returning();
		return deleted;
	});

export const labelRouter = {
	list: listLabels,
	create: createLabel,
	update: updateLabel,
	delete: deleteLabel,
};
