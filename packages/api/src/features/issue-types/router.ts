import { createId } from "@paralleldrive/cuid2";
import { db } from "db";
import {
	issueType,
	issueTypeAllowedStatus,
	issueTypeTeamOverride,
} from "db/features/tracker/issue-types.schema";
import { issue } from "db/features/tracker/issues.schema";
import { team } from "db/features/tracker/tracker.schema";
import { and, asc, eq, inArray, isNull, or, sql } from "drizzle-orm";
import { omit } from "remeda";
import { authedRouter } from "../../context";
import { isAllowed } from "../../lib/abac";
import {
	issueTypeArchiveSchema,
	issueTypeCreateSchema,
	issueTypeHideForTeamSchema,
	issueTypeListSchema,
	issueTypeReassignAndArchiveSchema,
	issueTypeReorderSchema,
	issueTypeReplaceForTeamSchema,
	issueTypeRestoreForTeamSchema,
	issueTypeSetDefaultSchema,
	issueTypeUpdateSchema,
} from "./schema";

const commonErrors = {
	UNAUTHORIZED: {},
	NOT_FOUND: {},
	TEAM_NOT_FOUND: {},
	INVALID_SCOPE: {},
	KEY_IN_USE: {},
	KEY_CONFLICT: {},
	DEFAULT_CONFLICT: {},
	ARCHIVED_TYPE: {},
	TYPE_IN_USE: {},
	INVALID_REPLACEMENT: {},
	INVALID_OVERRIDE_SOURCE: {},
};

type ErrorFactory = Record<
	keyof typeof commonErrors,
	(input?: { message?: string }) => Error
>;

async function ensureAllowed({
	userId,
	workspaceId,
	teamId,
	permissionKey,
	errors,
}: {
	userId: string;
	workspaceId: string;
	teamId?: string | null;
	permissionKey: string;
	errors: ErrorFactory;
}) {
	const allowed = await isAllowed({
		userId,
		workspaceId,
		teamId: teamId ?? undefined,
		permissionKey,
	});
	if (!allowed) throw errors.UNAUTHORIZED();
}

async function ensureTeam(workspaceId: string, teamId: string) {
	const [row] = await db
		.select({ id: team.id })
		.from(team)
		.where(and(eq(team.id, teamId), eq(team.workspaceId, workspaceId)));
	return row ?? null;
}

async function getIssueType(workspaceId: string, id: string) {
	const [row] = await db
		.select()
		.from(issueType)
		.where(and(eq(issueType.id, id), eq(issueType.workspaceId, workspaceId)));
	return row ?? null;
}

function scopePredicate(workspaceId: string, teamId?: string | null) {
	return and(
		eq(issueType.workspaceId, workspaceId),
		teamId ? eq(issueType.teamId, teamId) : isNull(issueType.teamId),
	);
}

async function keyHasDependencies(issueTypeId: string) {
	const [issueUse] = await db
		.select({ id: issue.id })
		.from(issue)
		.where(eq(issue.issueTypeId, issueTypeId))
		.limit(1);
	const [statusUse] = await db
		.select({ id: issueTypeAllowedStatus.id })
		.from(issueTypeAllowedStatus)
		.where(eq(issueTypeAllowedStatus.issueTypeId, issueTypeId))
		.limit(1);
	const [overrideUse] = await db
		.select({ id: issueTypeTeamOverride.id })
		.from(issueTypeTeamOverride)
		.where(
			or(
				eq(issueTypeTeamOverride.sourceIssueTypeId, issueTypeId),
				eq(issueTypeTeamOverride.replacementIssueTypeId, issueTypeId),
			),
		)
		.limit(1);
	return Boolean(issueUse ?? statusUse ?? overrideUse);
}

async function hasReplacementOverrideReferences(issueTypeId: string) {
	const [overrideUse] = await db
		.select({ id: issueTypeTeamOverride.id })
		.from(issueTypeTeamOverride)
		.where(eq(issueTypeTeamOverride.replacementIssueTypeId, issueTypeId))
		.limit(1);
	return overrideUse !== undefined;
}

function isUniqueViolation(error: unknown) {
	return (
		typeof error === "object" &&
		error !== null &&
		"code" in error &&
		error.code === "23505"
	);
}

async function ensureOverrideSource(
	workspaceId: string,
	sourceIssueTypeId: string,
) {
	const source = await getIssueType(workspaceId, sourceIssueTypeId);
	return source && !source.teamId && !source.archivedAt ? source : null;
}

async function ensureReplacement({
	workspaceId,
	teamId,
	replacementIssueTypeId,
}: {
	workspaceId: string;
	teamId: string;
	replacementIssueTypeId: string;
}) {
	const replacement = await getIssueType(workspaceId, replacementIssueTypeId);
	return replacement?.teamId === teamId && !replacement.archivedAt
		? replacement
		: null;
}

export const listIssueTypes = authedRouter
	.input(issueTypeListSchema)
	.errors(commonErrors)
	.handler(async ({ context, input, errors }) => {
		await ensureAllowed({
			userId: context.auth.session.userId,
			workspaceId: input.workspaceId,
			teamId: input.teamId,
			permissionKey: "issue_type:read",
			errors,
		});

		if (input.teamId && !(await ensureTeam(input.workspaceId, input.teamId))) {
			throw errors.TEAM_NOT_FOUND();
		}

		const archivedFilter = input.includeArchived
			? undefined
			: isNull(issueType.archivedAt);

		if (!input.teamId) {
			return db
				.select()
				.from(issueType)
				.where(and(scopePredicate(input.workspaceId, null), archivedFilter))
				.orderBy(asc(issueType.orderIndex), asc(issueType.name));
		}

		const [rows, overrides] = await Promise.all([
			db
				.select()
				.from(issueType)
				.where(
					and(
						eq(issueType.workspaceId, input.workspaceId),
						or(isNull(issueType.teamId), eq(issueType.teamId, input.teamId)),
						archivedFilter,
					),
				)
				.orderBy(asc(issueType.orderIndex), asc(issueType.name)),
			db
				.select()
				.from(issueTypeTeamOverride)
				.where(
					and(
						eq(issueTypeTeamOverride.workspaceId, input.workspaceId),
						eq(issueTypeTeamOverride.teamId, input.teamId),
					),
				),
		]);

		const omittedSourceIds = new Set(
			overrides
				.filter(
					(override) => override.hiddenAt ?? override.replacementIssueTypeId,
				)
				.map((override) => override.sourceIssueTypeId),
		);

		return rows.filter(
			(row) => row.teamId === input.teamId || !omittedSourceIds.has(row.id),
		);
	});

export const createIssueType = authedRouter
	.input(issueTypeCreateSchema)
	.errors(commonErrors)
	.handler(async ({ context, input, errors }) => {
		await ensureAllowed({
			userId: context.auth.session.userId,
			workspaceId: input.workspaceId,
			teamId: input.teamId,
			permissionKey: "issue_type:create",
			errors,
		});
		if (input.teamId && !(await ensureTeam(input.workspaceId, input.teamId))) {
			throw errors.TEAM_NOT_FOUND();
		}
		try {
			const [created] = await db
				.insert(issueType)
				.values({ id: createId(), ...input, teamId: input.teamId ?? null })
				.returning();
			return created;
		} catch (error) {
			if (isUniqueViolation(error)) throw errors.KEY_CONFLICT();
			throw error;
		}
	});

export const updateIssueType = authedRouter
	.input(issueTypeUpdateSchema)
	.errors(commonErrors)
	.handler(async ({ context, input, errors }) => {
		const existing = await getIssueType(input.workspaceId, input.id);
		if (!existing) throw errors.NOT_FOUND();
		await ensureAllowed({
			userId: context.auth.session.userId,
			workspaceId: input.workspaceId,
			teamId: existing.teamId,
			permissionKey: "issue_type:update",
			errors,
		});
		if (!existing.isEditable) throw errors.TYPE_IN_USE();
		if (
			input.key &&
			input.key !== existing.key &&
			(await keyHasDependencies(existing.id))
		) {
			throw errors.KEY_IN_USE();
		}
		try {
			const values = omit(input, ["id", "workspaceId"]);
			const [updated] = await db
				.update(issueType)
				.set(values)
				.where(
					and(
						eq(issueType.id, input.id),
						eq(issueType.workspaceId, input.workspaceId),
					),
				)
				.returning();
			return updated;
		} catch (error) {
			if (isUniqueViolation(error)) throw errors.KEY_CONFLICT();
			throw error;
		}
	});

export const archiveIssueType = authedRouter
	.input(issueTypeArchiveSchema)
	.errors(commonErrors)
	.handler(async ({ context, input, errors }) => {
		const existing = await getIssueType(input.workspaceId, input.id);
		if (!existing) throw errors.NOT_FOUND();
		await ensureAllowed({
			userId: context.auth.session.userId,
			workspaceId: input.workspaceId,
			teamId: existing.teamId,
			permissionKey: "issue_type:delete",
			errors,
		});
		if (existing.isDefault) throw errors.DEFAULT_CONFLICT();
		if (await hasReplacementOverrideReferences(existing.id)) {
			throw errors.TYPE_IN_USE();
		}
		const [updated] = await db
			.update(issueType)
			.set({ archivedAt: new Date(), isDefault: false })
			.where(
				and(
					eq(issueType.id, input.id),
					eq(issueType.workspaceId, input.workspaceId),
				),
			)
			.returning();
		return updated;
	});

export const reassignAndArchiveIssueType = authedRouter
	.input(issueTypeReassignAndArchiveSchema)
	.errors(commonErrors)
	.handler(async ({ context, input, errors }) => {
		const [source, replacement] = await Promise.all([
			getIssueType(input.workspaceId, input.id),
			getIssueType(input.workspaceId, input.replacementIssueTypeId),
		]);
		if (!source) throw errors.NOT_FOUND();
		if (
			!replacement ||
			replacement.archivedAt ||
			source.id === replacement.id
		) {
			throw errors.INVALID_REPLACEMENT();
		}
		if (source.teamId && replacement.teamId !== source.teamId) {
			throw errors.INVALID_REPLACEMENT();
		}
		if (!source.teamId && replacement.teamId) {
			throw errors.INVALID_REPLACEMENT();
		}
		await ensureAllowed({
			userId: context.auth.session.userId,
			workspaceId: input.workspaceId,
			teamId: source.teamId,
			permissionKey: "issue_type:delete",
			errors,
		});
		await ensureAllowed({
			userId: context.auth.session.userId,
			workspaceId: input.workspaceId,
			teamId: source.teamId,
			permissionKey: "issue:update",
			errors,
		});
		if (source.isDefault) throw errors.DEFAULT_CONFLICT();
		if (await hasReplacementOverrideReferences(source.id)) {
			throw errors.TYPE_IN_USE();
		}
		await db.transaction(async (tx) => {
			await tx
				.update(issue)
				.set({ issueTypeId: replacement.id })
				.where(
					and(
						eq(issue.workspaceId, input.workspaceId),
						eq(issue.issueTypeId, source.id),
					),
				);
			await tx
				.update(issueType)
				.set({ archivedAt: new Date(), isDefault: false })
				.where(eq(issueType.id, source.id));
		});
		return { success: true };
	});

export const reorderIssueTypes = authedRouter
	.input(issueTypeReorderSchema)
	.errors(commonErrors)
	.handler(async ({ context, input, errors }) => {
		await ensureAllowed({
			userId: context.auth.session.userId,
			workspaceId: input.workspaceId,
			teamId: input.teamId,
			permissionKey: "issue_type:reorder",
			errors,
		});
		if (input.teamId && !(await ensureTeam(input.workspaceId, input.teamId))) {
			throw errors.TEAM_NOT_FOUND();
		}
		const existing = await db
			.select({ id: issueType.id })
			.from(issueType)
			.where(
				and(
					scopePredicate(input.workspaceId, input.teamId),
					inArray(issueType.id, input.orderedIds),
				),
			);
		if (existing.length !== input.orderedIds.length)
			throw errors.INVALID_SCOPE();
		const tempOffset = 1_000_000;
		await db.transaction(async (tx) => {
			await tx
				.update(issueType)
				.set({ orderIndex: sql`${issueType.orderIndex} + ${tempOffset}` })
				.where(
					and(
						scopePredicate(input.workspaceId, input.teamId),
						inArray(issueType.id, input.orderedIds),
					),
				);
			for (const [orderIndex, id] of input.orderedIds.entries()) {
				await tx
					.update(issueType)
					.set({ orderIndex })
					.where(eq(issueType.id, id));
			}
		});
		return { success: true };
	});

export const setDefaultIssueType = authedRouter
	.input(issueTypeSetDefaultSchema)
	.errors(commonErrors)
	.handler(async ({ context, input, errors }) => {
		const existing = await getIssueType(input.workspaceId, input.id);
		if (!existing) throw errors.NOT_FOUND();
		if (existing.archivedAt) throw errors.ARCHIVED_TYPE();
		await ensureAllowed({
			userId: context.auth.session.userId,
			workspaceId: input.workspaceId,
			teamId: existing.teamId,
			permissionKey: "issue_type:update",
			errors,
		});
		await db.transaction(async (tx) => {
			await tx
				.update(issueType)
				.set({ isDefault: false })
				.where(scopePredicate(input.workspaceId, existing.teamId));
			await tx
				.update(issueType)
				.set({ isDefault: true })
				.where(eq(issueType.id, existing.id));
		});
		return { success: true };
	});

export const hideIssueTypeForTeam = authedRouter
	.input(issueTypeHideForTeamSchema)
	.errors(commonErrors)
	.handler(async ({ context, input, errors }) => {
		await ensureAllowed({
			userId: context.auth.session.userId,
			workspaceId: input.workspaceId,
			teamId: input.teamId,
			permissionKey: "issue_type_override:manage",
			errors,
		});
		if (!(await ensureTeam(input.workspaceId, input.teamId)))
			throw errors.TEAM_NOT_FOUND();
		if (
			!(await ensureOverrideSource(input.workspaceId, input.sourceIssueTypeId))
		) {
			throw errors.INVALID_OVERRIDE_SOURCE();
		}
		const [row] = await db
			.insert(issueTypeTeamOverride)
			.values({
				id: createId(),
				workspaceId: input.workspaceId,
				teamId: input.teamId,
				sourceIssueTypeId: input.sourceIssueTypeId,
				replacementIssueTypeId: null,
				hiddenAt: new Date(),
			})
			.onConflictDoUpdate({
				target: [
					issueTypeTeamOverride.teamId,
					issueTypeTeamOverride.sourceIssueTypeId,
				],
				set: { replacementIssueTypeId: null, hiddenAt: new Date() },
			})
			.returning();
		return row;
	});

export const replaceIssueTypeForTeam = authedRouter
	.input(issueTypeReplaceForTeamSchema)
	.errors(commonErrors)
	.handler(async ({ context, input, errors }) => {
		await ensureAllowed({
			userId: context.auth.session.userId,
			workspaceId: input.workspaceId,
			teamId: input.teamId,
			permissionKey: "issue_type_override:manage",
			errors,
		});
		if (!(await ensureTeam(input.workspaceId, input.teamId)))
			throw errors.TEAM_NOT_FOUND();
		if (
			!(await ensureOverrideSource(input.workspaceId, input.sourceIssueTypeId))
		) {
			throw errors.INVALID_OVERRIDE_SOURCE();
		}
		if (
			!(await ensureReplacement({
				workspaceId: input.workspaceId,
				teamId: input.teamId,
				replacementIssueTypeId: input.replacementIssueTypeId,
			}))
		) {
			throw errors.INVALID_REPLACEMENT();
		}
		const [row] = await db
			.insert(issueTypeTeamOverride)
			.values({
				id: createId(),
				workspaceId: input.workspaceId,
				teamId: input.teamId,
				sourceIssueTypeId: input.sourceIssueTypeId,
				replacementIssueTypeId: input.replacementIssueTypeId,
				hiddenAt: new Date(),
			})
			.onConflictDoUpdate({
				target: [
					issueTypeTeamOverride.teamId,
					issueTypeTeamOverride.sourceIssueTypeId,
				],
				set: {
					replacementIssueTypeId: input.replacementIssueTypeId,
					hiddenAt: new Date(),
				},
			})
			.returning();
		return row;
	});

export const restoreIssueTypeForTeam = authedRouter
	.input(issueTypeRestoreForTeamSchema)
	.errors(commonErrors)
	.handler(async ({ context, input, errors }) => {
		await ensureAllowed({
			userId: context.auth.session.userId,
			workspaceId: input.workspaceId,
			teamId: input.teamId,
			permissionKey: "issue_type_override:manage",
			errors,
		});
		if (!(await ensureTeam(input.workspaceId, input.teamId)))
			throw errors.TEAM_NOT_FOUND();
		const [deleted] = await db
			.delete(issueTypeTeamOverride)
			.where(
				and(
					eq(issueTypeTeamOverride.workspaceId, input.workspaceId),
					eq(issueTypeTeamOverride.teamId, input.teamId),
					eq(issueTypeTeamOverride.sourceIssueTypeId, input.sourceIssueTypeId),
				),
			)
			.returning();
		return deleted ?? { success: true };
	});

export const issueTypeRouter = {
	list: listIssueTypes,
	create: createIssueType,
	update: updateIssueType,
	archive: archiveIssueType,
	reassignAndArchive: reassignAndArchiveIssueType,
	reorder: reorderIssueTypes,
	setDefault: setDefaultIssueType,
	hideForTeam: hideIssueTypeForTeam,
	replaceForTeam: replaceIssueTypeForTeam,
	restoreForTeam: restoreIssueTypeForTeam,
};
