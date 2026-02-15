import { createId } from "@paralleldrive/cuid2";
import { db } from "db";
import { issue, issueLabel } from "db/features/tracker/issues.schema";
import { and, eq, inArray, sql } from "drizzle-orm";
import { omit } from "remeda";
import { z } from "zod";
import { authedRouter } from "../../context";
import { isAllowed } from "../../lib/abac";
import {
	calculateAfterRank,
	calculateBeforeRank,
	calculateMiddleRank,
} from "../../utils/lexorank";
import { rebalanceStatusIssues } from "../../utils/rebalancing";
import { issuePublisher } from "./publisher";
import { getIssueWithRelations, searchIssues } from "./queries";
import {
	issueCreateSchema,
	issueDeleteSchema,
	issueGetSchema,
	issueLabelsSchema,
	issueListSchema,
	issueMoveSchema,
	issuePriorityUpdateSchema,
	issueSearchSchema,
	issueUpdateAssigneeSchema,
	issueUpdateSchema,
} from "./schema";
import { buildIssueSearchFields } from "./search-fields";

const commonErrors = {
	UNAUTHORIZED: {},
};

const updateDeleteErrors = {
	...commonErrors,
	NOT_FOUND: {},
	INVALID_MOVE: {},
	RANK_EXHAUSTED: {},
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

		const workspaceCond = eq(issue.workspaceId, input.workspaceId);
		const rows = await db.query.issue.findMany({
			where: (issue, { eq, and }) =>
				input.teamId
					? and(workspaceCond, eq(issue.teamId, input.teamId))
					: workspaceCond,
			with: {
				status: {
					with: {
						statusGroup: true,
					},
				},
				priority: true,
				assignee: true,
				team: true,
				labelLinks: {
					with: {
						label: true,
					},
				},
			},
			orderBy: (issue, { asc, desc }) => [
				asc(
					sql`(select order_index from issue_status_group where id = (select status_group_id from issue_status where id = ${issue.statusId}))`,
				),
				asc(
					sql`(select order_index from issue_status where id = ${issue.statusId})`,
				),
				asc(issue.sortOrder),
				desc(issue.createdAt),
			],
			limit: input.limit,
			offset: input.offset,
		});

		return rows;
	});

const getIssue = authedRouter
	.input(issueGetSchema)
	.errors(updateDeleteErrors)
	.handler(async ({ context, input, errors }) => {
		const allowed = await isAllowed({
			userId: context.auth.session.userId,
			workspaceId: input.workspaceId,
			permissionKey: "issue:read",
		});
		if (!allowed) throw errors.UNAUTHORIZED;

		const row = await getIssueWithRelations(input.id, input.workspaceId);

		if (!row) throw errors.NOT_FOUND;
		return row;
	});

const createIssue = authedRouter
	.input(issueCreateSchema)
	.errors(commonErrors)
	.handler(async ({ context, input, errors }) => {
		const { workspaceId, teamId, labelIds } = input;
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
		const searchFields = await buildIssueSearchFields({
			title: input.title,
			description: input.description,
		});

		for (let attempt = 0; attempt <= 1; attempt++) {
			try {
				const [maxSortRow] = await db
					.select({ maxSort: sql<string>`max(${issue.sortOrder})` })
					.from(issue)
					.where(eq(issue.statusId, input.statusId))
					.limit(1);

				const sortOrder = calculateAfterRank(maxSortRow?.maxSort || "a00");

				const created = await db.transaction(async (tx) => {
					const [newIssue] = await tx
						.insert(issue)
						.values({
							id: createId(),
							number: nextNumber,
							creatorId: context.auth.session.userId,
							sortOrder,
							...omit(input, ["labelIds"]),
							...searchFields,
						})
						.returning();

					if (!newIssue) {
						throw new Error("Failed to create issue");
					}

					if (labelIds.length > 0) {
						await tx.insert(issueLabel).values(
							labelIds.map((labelId) => ({
								issueId: newIssue.id,
								labelId,
							})),
						);
					}

					return newIssue;
				});

				const freshIssue = await getIssueWithRelations(created.id, workspaceId);
				if (freshIssue) {
					await issuePublisher.publish("issue:changed", {
						type: "create",
						workspaceId,
						teamId: freshIssue.teamId,
						issue: freshIssue,
					});
				}

				return created;
			} catch (error) {
				if (attempt === 0) {
					await rebalanceStatusIssues(input.statusId);
				} else {
					throw error;
				}
			}
		}

		throw new Error("Failed to create issue after rebalancing");
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

		// move to another status col with changing sortOrder to top
		if (input.statusId) {
			const [currentIssue] = await db
				.select()
				.from(issue)
				.where(eq(issue.id, input.id))
				.limit(1);

			if (currentIssue && currentIssue.statusId !== input.statusId) {
				const firstRank = await db
					.select({ minSort: sql<string>`min(${issue.sortOrder})` })
					.from(issue)
					.where(eq(issue.statusId, input.statusId))
					.limit(1)
					.then((rows) => rows[0]?.minSort);

				values.sortOrder = calculateBeforeRank(firstRank || "a00");
			}
		}

		if (input.title !== undefined || input.description !== undefined) {
			const [currentIssue] = await db
				.select({ title: issue.title, description: issue.description })
				.from(issue)
				.where(
					and(eq(issue.id, input.id), eq(issue.workspaceId, input.workspaceId)),
				)
				.limit(1);

			if (!currentIssue) throw errors.NOT_FOUND;

			Object.assign(
				values,
				await buildIssueSearchFields({
					title: input.title ?? currentIssue.title,
					description:
						input.description !== undefined
							? input.description
							: currentIssue.description,
				}),
			);
		}

		const [updated] = await db
			.update(issue)
			.set(values)
			.where(
				and(eq(issue.id, input.id), eq(issue.workspaceId, input.workspaceId)),
			)
			.returning();
		if (!updated) throw errors.NOT_FOUND;

		const freshIssue = await getIssueWithRelations(input.id, input.workspaceId);
		if (freshIssue) {
			await issuePublisher.publish("issue:changed", {
				type: "update",
				workspaceId: input.workspaceId,
				teamId: freshIssue.teamId,
				issue: freshIssue,
			});
		}

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

		await issuePublisher.publish("issue:changed", {
			type: "delete",
			workspaceId: input.workspaceId,
			teamId: deleted.teamId,
			issueId: deleted.id,
		});

		return deleted;
	});

const bulkAddLabels = authedRouter
	.input(issueLabelsSchema)
	.errors(commonErrors)
	.handler(async ({ context, input, errors }) => {
		const allowed = await isAllowed({
			userId: context.auth.session.userId,
			workspaceId: input.workspaceId,
			permissionKey: "issue:update",
		});
		if (!allowed) throw errors.UNAUTHORIZED;

		if (input.labelIds.length === 0) return;

		await db
			.insert(issueLabel)
			.values(
				input.labelIds.map((labelId) => ({
					issueId: input.issueId,
					labelId,
				})),
			)
			.onConflictDoNothing();

		const freshIssue = await getIssueWithRelations(
			input.issueId,
			input.workspaceId,
		);
		if (freshIssue) {
			await issuePublisher.publish("issue:changed", {
				type: "update",
				workspaceId: input.workspaceId,
				teamId: freshIssue.teamId,
				issue: freshIssue,
			});
		}
	});

const bulkDeleteLabels = authedRouter
	.input(issueLabelsSchema)
	.errors(commonErrors)
	.handler(async ({ context, input, errors }) => {
		const allowed = await isAllowed({
			userId: context.auth.session.userId,
			workspaceId: input.workspaceId,
			permissionKey: "issue:update",
		});
		if (!allowed) throw errors.UNAUTHORIZED;

		if (input.labelIds.length === 0) return;

		await db
			.delete(issueLabel)
			.where(
				and(
					eq(issueLabel.issueId, input.issueId),
					inArray(issueLabel.labelId, input.labelIds),
				),
			);

		const freshIssue = await getIssueWithRelations(
			input.issueId,
			input.workspaceId,
		);
		if (freshIssue) {
			await issuePublisher.publish("issue:changed", {
				type: "update",
				workspaceId: input.workspaceId,
				teamId: freshIssue.teamId,
				issue: freshIssue,
			});
		}
	});

const updatePriority = authedRouter
	.input(issuePriorityUpdateSchema)
	.errors(updateDeleteErrors)
	.handler(async ({ context, input, errors }) => {
		const allowed = await isAllowed({
			userId: context.auth.session.userId,
			workspaceId: input.workspaceId,
			permissionKey: "issue:update",
		});
		if (!allowed) throw errors.UNAUTHORIZED;

		const [updated] = await db
			.update(issue)
			.set({ priorityId: input.priorityId })
			.where(
				and(eq(issue.id, input.id), eq(issue.workspaceId, input.workspaceId)),
			)
			.returning();
		if (!updated) throw errors.NOT_FOUND;

		const freshIssue = await getIssueWithRelations(input.id, input.workspaceId);
		if (freshIssue) {
			await issuePublisher.publish("issue:changed", {
				type: "update",
				workspaceId: input.workspaceId,
				teamId: freshIssue.teamId,
				issue: freshIssue,
			});
		}

		return updated;
	});

const updateAssignee = authedRouter
	.input(issueUpdateAssigneeSchema)
	.errors(updateDeleteErrors)
	.handler(async ({ context, input, errors }) => {
		const allowed = await isAllowed({
			userId: context.auth.session.userId,
			workspaceId: input.workspaceId,
			permissionKey: "issue:update",
		});
		if (!allowed) throw errors.UNAUTHORIZED;

		const [updated] = await db
			.update(issue)
			.set({ assigneeId: input.assigneeId })
			.where(
				and(eq(issue.id, input.id), eq(issue.workspaceId, input.workspaceId)),
			)
			.returning();
		if (!updated) throw errors.NOT_FOUND;

		const freshIssue = await getIssueWithRelations(input.id, input.workspaceId);
		if (freshIssue) {
			await issuePublisher.publish("issue:changed", {
				type: "update",
				workspaceId: input.workspaceId,
				teamId: freshIssue.teamId,
				issue: freshIssue,
			});
		}

		return updated;
	});

const moveIssue = authedRouter
	.input(issueMoveSchema)
	.errors(updateDeleteErrors)
	.handler(async ({ context, input, errors }) => {
		console.debug("Move issue input:", input);
		const allowed = await isAllowed({
			userId: context.auth.session.userId,
			workspaceId: input.workspaceId,
			permissionKey: "issue:update",
		});
		if (!allowed) throw errors.UNAUTHORIZED;

		console.debug("Move issue: fetching current issue", input.id);
		const [currentIssue] = await db
			.select()
			.from(issue)
			.where(eq(issue.id, input.id))
			.limit(1);

		console.debug("Move issue: current issue found", currentIssue);
		if (!currentIssue) throw errors.NOT_FOUND;

		const executeMove = async (
			tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
		): ReturnType<typeof db.transaction> => {
			console.debug("Move issue: executing move transaction");
			const [issueRecord] = await tx
				.select()
				.from(issue)
				.where(eq(issue.id, input.id))
				.for("update");

			console.debug("Move issue: issue record locked", issueRecord);
			if (!issueRecord) throw errors.NOT_FOUND;

			let targetStatusId = issueRecord.statusId;
			let newSortOrder: string;

			if (input.targetId) {
				console.debug("Move issue: moving relative to target", input.targetId);
				const [targetIssue] = await tx
					.select()
					.from(issue)
					.where(eq(issue.id, input.targetId))
					.for("update");

				console.debug("Move issue: target issue found", targetIssue);
				if (!targetIssue) throw errors.NOT_FOUND;
				if (input.targetId === input.id) throw errors.INVALID_MOVE;

				targetStatusId = targetIssue.statusId;

				const allNeighbors = await tx
					.select()
					.from(issue)
					.where(eq(issue.statusId, targetStatusId))
					.orderBy(issue.sortOrder);

				const filteredNeighbors = allNeighbors.filter((i) => i.id !== input.id);

				console.debug("Move issue: neighbors count", filteredNeighbors.length);

				const targetIndex = filteredNeighbors.findIndex(
					(i) => i.id === input.targetId,
				);
				const insertIndex = input.after ? targetIndex + 1 : targetIndex;
				console.debug("Move issue: indices", { targetIndex, insertIndex });

				if (insertIndex === 0) {
					const firstRank = filteredNeighbors[0]?.sortOrder || "a00";
					newSortOrder = calculateBeforeRank(firstRank);
				} else if (insertIndex >= filteredNeighbors.length) {
					const lastRank =
						filteredNeighbors[filteredNeighbors.length - 1]?.sortOrder || "a00";
					newSortOrder = calculateAfterRank(lastRank);
				} else {
					const beforeRank =
						filteredNeighbors[insertIndex - 1]?.sortOrder || "a00";
					const afterRank = filteredNeighbors[insertIndex]?.sortOrder || "b00";
					console.debug("Move issue: calculating middle rank", {
						beforeRank,
						afterRank,
					});
					try {
						newSortOrder = calculateMiddleRank(beforeRank, afterRank);
					} catch (error) {
						console.debug("Move issue: rank calculation error", error);
						if (
							error instanceof Error &&
							error.message === "RANK_EXHAUSTED: No space between ranks"
						) {
							// Rethrow original error to trigger retry with rebalancing
							throw error;
						}
						throw error;
					}
				}
			} else {
				console.debug("Move issue: moving to start/end of status");
				const allStatusIssues = await tx
					.select()
					.from(issue)
					.where(eq(issue.statusId, targetStatusId))
					.orderBy(issue.sortOrder);

				const statusIssues = allStatusIssues.filter((i) => i.id !== input.id);

				if (input.after) {
					const lastRank =
						statusIssues[statusIssues.length - 1]?.sortOrder || "a00";
					newSortOrder = calculateAfterRank(lastRank);
				} else {
					const firstRank = statusIssues[0]?.sortOrder || "a00";
					newSortOrder = calculateBeforeRank(firstRank);
				}
			}

			console.debug("Move issue: updating issue", {
				targetStatusId,
				newSortOrder,
			});
			const [updated] = await tx
				.update(issue)
				.set({
					statusId: targetStatusId,
					sortOrder: newSortOrder,
				})
				.where(eq(issue.id, input.id))
				.returning();

			if (!updated) throw errors.NOT_FOUND;
			return updated;
		};

		for (let attempt = 0; attempt <= 1; attempt++) {
			try {
				const moved = await db.transaction(executeMove);

				const freshIssue = await getIssueWithRelations(
					input.id,
					input.workspaceId,
				);
				if (freshIssue) {
					await issuePublisher.publish("issue:changed", {
						type: "update",
						workspaceId: input.workspaceId,
						teamId: freshIssue.teamId,
						issue: freshIssue,
					});
				}

				return moved;
			} catch (error) {
				console.debug("Move issue error caught:", error);
				if (typeof error === "object") {
					try {
						console.debug("Error details:", JSON.stringify(error, null, 2));
					} catch (e) {
						console.debug("Error details (stringify failed):", error);
					}
				}
				if (
					!(error instanceof Error && error.message.includes("RANK_EXHAUSTED"))
				) {
					throw error;
				}

				if (attempt === 0) {
					await rebalanceStatusIssues(
						input.targetId ? currentIssue.statusId : currentIssue.statusId,
					);
				} else {
					throw new Error("Failed to move issue after rebalancing");
				}
			}
		}

		throw new Error("Failed to move issue after rebalancing");
	});

const liveIssues = authedRouter
	.input(
		z.object({
			workspaceId: z.string(),
			teamId: z.string().optional(),
		}),
	)
	.errors(commonErrors)
	.handler(async function* ({ context, input, errors, signal, lastEventId }) {
		const allowed = await isAllowed({
			userId: context.auth.session.userId,
			workspaceId: input.workspaceId,
			permissionKey: "issue:read",
		});
		if (!allowed) throw errors.UNAUTHORIZED;

		const stream = issuePublisher.subscribe("issue:changed", {
			signal,
			lastEventId,
		});

		for await (const event of stream) {
			if (event.workspaceId !== input.workspaceId) continue;
			if (input.teamId && event.teamId !== input.teamId) continue;
			yield event;
		}
	});

const searchIssuesHandler = authedRouter
	.input(issueSearchSchema)
	.errors(commonErrors)
	.handler(async ({ context, input, errors }) => {
		const allowed = await isAllowed({
			userId: context.auth.session.userId,
			workspaceId: input.workspaceId,
			permissionKey: "issue:read",
		});
		if (!allowed) throw errors.UNAUTHORIZED;

		const results = await searchIssues(input);
		return { issues: results };
	});

export const issueRouter = {
	list: listIssues,
	get: getIssue,
	create: createIssue,
	update: updateIssue,
	delete: deleteIssue,
	move: moveIssue,
	updatePriority,
	updateAssignee,
	search: searchIssuesHandler,
	live: liveIssues,
	labels: {
		bulkAdd: bulkAddLabels,
		bulkDelete: bulkDeleteLabels,
	},
};
