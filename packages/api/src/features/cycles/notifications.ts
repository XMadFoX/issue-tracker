import { createId } from "@paralleldrive/cuid2";
import { db } from "db";
import { cycleActionRequired } from "db/features/tracker/cycle-actions.schema";
import { cycleNotification } from "db/features/tracker/cycle-notifications.schema";
import { cycleScheduleJob } from "db/features/tracker/cycle-schedule-jobs.schema";
import { cycle } from "db/features/tracker/cycles.schema";
import { teamCycleSettings } from "db/features/tracker/team-cycle-settings.schema";
import {
	team,
	teamMembership,
	workspace,
	workspaceMembership,
} from "db/features/tracker/tracker.schema";
import { and, eq, inArray, isNull, ne, notInArray, or, sql } from "drizzle-orm";
import { isAllowed } from "../../lib/abac";
import { deriveScheduleActionTiming, type ScheduleSettings } from "./schedule";
import type { WorkerClock } from "./worker";

export const REMINDER_JOB_TYPE = "send_cycle_reminder" as const;
export const CONFIRMATION_JOB_TYPE =
	"create_cycle_confirmation_required" as const;
export const NOTIFICATION_JOB_TYPES = [
	REMINDER_JOB_TYPE,
	CONFIRMATION_JOB_TYPE,
] as const;

export type NotificationJobType = (typeof NOTIFICATION_JOB_TYPES)[number];
export type NotificationJobOutcome =
	| "created"
	| "already_satisfied"
	| "obsolete_cycle_state"
	| "obsolete_settings"
	| "no_recipients";

export type NotificationDbExecutor =
	| typeof db
	| Parameters<Parameters<typeof db.transaction>[0]>[0];
type CycleJob = {
	id: string;
	workspaceId: string;
	teamId: string;
	cycleId: string | null;
	jobType: NotificationJobType;
	scheduledBoundary: Date;
	availableAt: Date;
	eventRevisionAt: Date | null;
	attempts: number;
	maxAttempts: number;
	claimToken: string | null;
};

type CycleWithSettings = {
	cycle: typeof cycle.$inferSelect;
	settings: typeof teamCycleSettings.$inferSelect | null;
	workspaceTimezone: string;
	teamName: string;
};

export function isNotificationJobType(
	value: string,
): value is NotificationJobType {
	return (NOTIFICATION_JOB_TYPES as readonly string[]).includes(value);
}

function settingsValue(
	settings: typeof teamCycleSettings.$inferSelect,
): ScheduleSettings {
	return {
		cadenceEnabled: settings.cadenceEnabled,
		cadenceDays: settings.cadenceDays,
		anchorDate: settings.anchorDate,
		endBehavior: settings.endBehavior,
		gracePeriodMinutes: settings.gracePeriodMinutes,
		reminderLeadMinutes: settings.reminderLeadMinutes,
	};
}

function expectedJob(row: CycleWithSettings): {
	jobType: NotificationJobType;
	availableAt: Date;
	eventRevisionAt: Date;
}[] {
	if (!row.settings?.cadenceEnabled) return [];
	const eventRevisionAt = row.settings.updatedAt;
	const timing = deriveScheduleActionTiming({
		workspaceTimezone: row.workspaceTimezone,
		endDate: row.cycle.endDate,
		settings: settingsValue(row.settings),
	});
	const reminderAt = new Date(timing.reminderCandidateAt.utcIso);
	const result: {
		jobType: NotificationJobType;
		availableAt: Date;
		eventRevisionAt: Date;
	}[] = [
		{ jobType: REMINDER_JOB_TYPE, availableAt: reminderAt, eventRevisionAt },
	];
	if (row.settings.endBehavior === "confirmation_required") {
		result.push({
			jobType: CONFIRMATION_JOB_TYPE,
			availableAt: new Date(
				timing.managerConfirmationRequiredAt?.utcIso ?? row.cycle.endDate,
			),
			eventRevisionAt,
		});
	}
	return result;
}

export async function cancelCycleArtifacts(
	executor: NotificationDbExecutor,
	{
		workspaceId,
		teamId,
		cycleId,
		reason,
	}: { workspaceId: string; teamId: string; cycleId: string; reason: string },
): Promise<void> {
	const now = new Date();
	await executor
		.update(cycleActionRequired)
		.set({
			status: "canceled",
			canceledAt: now,
			cancellationReason: reason.slice(0, 256),
			updatedAt: now,
		})
		.where(
			and(
				eq(cycleActionRequired.workspaceId, workspaceId),
				eq(cycleActionRequired.teamId, teamId),
				eq(cycleActionRequired.cycleId, cycleId),
				eq(cycleActionRequired.status, "open"),
			),
		);
	await executor
		.update(cycleNotification)
		.set({ canceledAt: now, cancellationReason: reason.slice(0, 256) })
		.where(
			and(
				eq(cycleNotification.workspaceId, workspaceId),
				eq(cycleNotification.teamId, teamId),
				eq(cycleNotification.cycleId, cycleId),
				isNull(cycleNotification.canceledAt),
			),
		);
	await executor
		.update(cycleScheduleJob)
		.set({
			status: "succeeded",
			outcome:
				reason === "settings_changed"
					? "obsolete_settings"
					: "obsolete_cycle_state",
			finishedAt: now,
			leaseExpiresAt: null,
			workerId: null,
			claimToken: null,
		})
		.where(
			and(
				eq(cycleScheduleJob.workspaceId, workspaceId),
				eq(cycleScheduleJob.teamId, teamId),
				eq(cycleScheduleJob.cycleId, cycleId),
				inArray(cycleScheduleJob.jobType, [...NOTIFICATION_JOB_TYPES]),
				inArray(cycleScheduleJob.status, ["queued", "succeeded", "failed"]),
			),
		);
}

async function loadCyclesForReconciliation(): Promise<CycleWithSettings[]> {
	return await db
		.select({
			cycle,
			settings: teamCycleSettings,
			workspaceTimezone: workspace.timezone,
			teamName: team.name,
		})
		.from(cycle)
		.innerJoin(team, eq(cycle.teamId, team.id))
		.innerJoin(workspace, eq(cycle.workspaceId, workspace.id))
		.leftJoin(teamCycleSettings, eq(teamCycleSettings.teamId, team.id))
		.where(eq(cycle.origin, "scheduled"));
}

export async function cancelTeamCycleArtifacts(
	executor: NotificationDbExecutor,
	{
		workspaceId,
		teamId,
		reason,
	}: { workspaceId: string; teamId: string; reason: string },
): Promise<void> {
	const cycles = await executor
		.select({ id: cycle.id })
		.from(cycle)
		.where(
			and(
				eq(cycle.workspaceId, workspaceId),
				eq(cycle.teamId, teamId),
				eq(cycle.origin, "scheduled"),
			),
		);
	for (const row of cycles) {
		await cancelCycleArtifacts(executor, {
			workspaceId,
			teamId,
			cycleId: row.id,
			reason,
		});
	}
}

/** Reconciles the durable event outbox for current, persisted scheduled cycles. */
export async function enqueueNotificationJobs({
	clock,
}: {
	clock: WorkerClock;
}): Promise<{ enqueued: number; skipped: number }> {
	const now = clock.now();
	const rows = await loadCyclesForReconciliation();
	let enqueued = 0;
	let skipped = 0;
	for (const row of rows) {
		const expected = expectedJob(row);
		if (
			row.cycle.state === "completed" ||
			row.cycle.state === "canceled" ||
			!row.settings?.cadenceEnabled
		) {
			await db.transaction((tx) =>
				cancelCycleArtifacts(tx, {
					workspaceId: row.cycle.workspaceId,
					teamId: row.cycle.teamId,
					cycleId: row.cycle.id,
					reason: "cycle_not_eligible",
				}),
			);
			skipped += 1;
			continue;
		}
		if (!row.settings || expected.length === 0) {
			skipped += 1;
			continue;
		}
		const settingsRevision = row.settings.updatedAt;
		const currentSettings = row.settings;
		const expectedTypes = expected.map((item) => item.jobType);
		await db.transaction(async (tx) => {
			const staleJobs = await tx
				.select({ id: cycleScheduleJob.id })
				.from(cycleScheduleJob)
				.where(
					and(
						eq(cycleScheduleJob.cycleId, row.cycle.id),
						inArray(cycleScheduleJob.jobType, [...NOTIFICATION_JOB_TYPES]),
						or(
							ne(cycleScheduleJob.scheduledBoundary, row.cycle.endDate),
							ne(cycleScheduleJob.eventRevisionAt, settingsRevision),
							notInArray(cycleScheduleJob.jobType, expectedTypes),
						),
						eq(cycleScheduleJob.status, "queued"),
					),
				);
			if (staleJobs.length > 0) {
				await tx
					.update(cycleScheduleJob)
					.set({
						status: "succeeded",
						outcome: "obsolete_settings",
						finishedAt: now,
					})
					.where(
						inArray(
							cycleScheduleJob.id,
							staleJobs.map((job) => job.id),
						),
					);
			}
			if (currentSettings.endBehavior !== "confirmation_required") {
				await tx
					.update(cycleActionRequired)
					.set({
						status: "canceled",
						canceledAt: now,
						cancellationReason: "end_behavior_changed",
						updatedAt: now,
					})
					.where(
						and(
							eq(cycleActionRequired.cycleId, row.cycle.id),
							eq(cycleActionRequired.status, "open"),
						),
					);
			}
			await tx
				.update(cycleNotification)
				.set({ canceledAt: now, cancellationReason: "schedule_reconciled" })
				.where(
					and(
						eq(cycleNotification.cycleId, row.cycle.id),
						or(
							ne(cycleNotification.scheduledBoundary, row.cycle.endDate),
							ne(cycleNotification.eventRevisionAt, settingsRevision),
						),
						isNull(cycleNotification.canceledAt),
					),
				);
		});
		for (const event of expected) {
			const inserted = await db
				.insert(cycleScheduleJob)
				.values({
					id: createId(),
					workspaceId: row.cycle.workspaceId,
					teamId: row.cycle.teamId,
					cycleId: row.cycle.id,
					jobType: event.jobType,
					scheduledBoundary: row.cycle.endDate,
					eventRevisionAt: event.eventRevisionAt,
					availableAt: event.availableAt,
				})
				.onConflictDoNothing({
					target: [
						cycleScheduleJob.cycleId,
						cycleScheduleJob.jobType,
						cycleScheduleJob.scheduledBoundary,
						cycleScheduleJob.eventRevisionAt,
					],
					where: sql`${cycleScheduleJob.jobType} <> 'generate_planned_cycles'`,
				})
				.returning({ id: cycleScheduleJob.id });
			if (inserted.length > 0) enqueued += 1;
			else skipped += 1;
		}
	}
	return { enqueued, skipped };
}

async function resolveRecipients(
	executor: NotificationDbExecutor,
	workspaceId: string,
	teamId: string,
): Promise<string[]> {
	const [workspaceUsers, teamUsers] = await Promise.all([
		executor
			.select({ userId: workspaceMembership.userId })
			.from(workspaceMembership)
			.where(
				and(
					eq(workspaceMembership.workspaceId, workspaceId),
					eq(workspaceMembership.status, "active"),
				),
			),
		executor
			.select({ userId: teamMembership.userId })
			.from(teamMembership)
			.where(
				and(
					eq(teamMembership.teamId, teamId),
					eq(teamMembership.status, "active"),
				),
			),
	]);
	const activeWorkspaceUserIds = new Set(
		workspaceUsers.map((row) => row.userId),
	);
	const ids = new Set(
		[...workspaceUsers, ...teamUsers]
			.map((row) => row.userId)
			.filter((userId) => activeWorkspaceUserIds.has(userId)),
	);
	const recipients: string[] = [];
	for (const userId of ids) {
		const [canManage, canRead] = await Promise.all([
			isAllowed({
				userId,
				workspaceId,
				teamId,
				permissionKey: "cycle:manage_settings",
			}),
			isAllowed({ userId, workspaceId, teamId, permissionKey: "cycle:read" }),
		]);
		if (canManage && canRead) recipients.push(userId);
	}
	return recipients.sort();
}

export async function processNotificationJob({
	job,
}: {
	job: CycleJob;
}): Promise<NotificationJobOutcome> {
	const cycleId = job.cycleId;
	if (!cycleId || !isNotificationJobType(job.jobType))
		return "obsolete_settings";
	return await db.transaction(async (tx) => {
		const [row] = await tx
			.select({
				cycle,
				settings: teamCycleSettings,
				workspaceTimezone: workspace.timezone,
				teamName: team.name,
			})
			.from(cycle)
			.innerJoin(team, eq(cycle.teamId, team.id))
			.innerJoin(workspace, eq(cycle.workspaceId, workspace.id))
			.innerJoin(teamCycleSettings, eq(teamCycleSettings.teamId, team.id))
			.where(
				and(
					eq(cycle.id, cycleId),
					eq(cycle.workspaceId, job.workspaceId),
					eq(cycle.teamId, job.teamId),
				),
			)
			.for("update");
		if (!row) return "obsolete_cycle_state";
		if (
			row.cycle.origin !== "scheduled" ||
			row.cycle.state === "completed" ||
			row.cycle.state === "canceled"
		)
			return "obsolete_cycle_state";
		if (!row.settings?.cadenceEnabled) return "obsolete_settings";
		const expected = expectedJob(row).find(
			(item) => item.jobType === job.jobType,
		);
		if (
			!expected ||
			row.cycle.endDate.getTime() !== job.scheduledBoundary.getTime() ||
			expected.availableAt.getTime() !== job.availableAt.getTime() ||
			!job.eventRevisionAt ||
			expected.eventRevisionAt.getTime() !== job.eventRevisionAt.getTime()
		)
			return "obsolete_settings";
		const recipients = await resolveRecipients(
			tx,
			row.cycle.workspaceId,
			row.cycle.teamId,
		);
		const notificationKind =
			job.jobType === REMINDER_JOB_TYPE
				? "end_reminder"
				: "completion_confirmation";
		if (recipients.length === 0) return "no_recipients";
		let actionId: string | null = null;
		if (job.jobType === CONFIRMATION_JOB_TYPE) {
			const [action] = await tx
				.insert(cycleActionRequired)
				.values({
					id: createId(),
					workspaceId: row.cycle.workspaceId,
					teamId: row.cycle.teamId,
					cycleId: row.cycle.id,
					kind: "completion_confirmation",
					scheduledBoundary: row.cycle.endDate,
					eventRevisionAt: row.settings.updatedAt,
					dueAt: expected.availableAt,
				})
				.onConflictDoNothing({
					target: [
						cycleActionRequired.cycleId,
						cycleActionRequired.kind,
						cycleActionRequired.scheduledBoundary,
						cycleActionRequired.eventRevisionAt,
					],
				})
				.returning({ id: cycleActionRequired.id });
			if (action) actionId = action.id;
			else {
				const [existingAction] = await tx
					.select({
						id: cycleActionRequired.id,
						status: cycleActionRequired.status,
					})
					.from(cycleActionRequired)
					.where(
						and(
							eq(cycleActionRequired.cycleId, row.cycle.id),
							eq(cycleActionRequired.kind, "completion_confirmation"),
							eq(cycleActionRequired.scheduledBoundary, row.cycle.endDate),
							eq(cycleActionRequired.eventRevisionAt, row.settings.updatedAt),
						),
					)
					.limit(1);
				if (existingAction?.status !== "open") return "already_satisfied";
				actionId = existingAction.id;
			}
		}
		for (const recipientUserId of recipients) {
			await tx
				.insert(cycleNotification)
				.values({
					id: createId(),
					workspaceId: row.cycle.workspaceId,
					teamId: row.cycle.teamId,
					cycleId: row.cycle.id,
					actionRequiredId: actionId,
					recipientUserId,
					kind: notificationKind,
					scheduledBoundary: row.cycle.endDate,
					eventRevisionAt: row.settings.updatedAt,
					deliverAt: expected.availableAt,
					cycleName: row.cycle.name,
					teamName: row.teamName,
				})
				.onConflictDoNothing({
					target: [
						cycleNotification.recipientUserId,
						cycleNotification.cycleId,
						cycleNotification.kind,
						cycleNotification.scheduledBoundary,
						cycleNotification.eventRevisionAt,
					],
				});
		}
		return "created";
	});
}

export async function resolveCycleConfirmationAction(
	executor: NotificationDbExecutor,
	{
		workspaceId,
		teamId,
		cycleId,
		actorId,
	}: {
		workspaceId: string;
		teamId: string;
		cycleId: string;
		actorId: string | null;
	},
): Promise<void> {
	const now = new Date();
	const [action] = await executor
		.update(cycleActionRequired)
		.set({
			status: "resolved",
			resolvedAt: now,
			resolvedBy: actorId,
			updatedAt: now,
		})
		.where(
			and(
				eq(cycleActionRequired.workspaceId, workspaceId),
				eq(cycleActionRequired.teamId, teamId),
				eq(cycleActionRequired.cycleId, cycleId),
				eq(cycleActionRequired.kind, "completion_confirmation"),
				eq(cycleActionRequired.status, "open"),
			),
		)
		.returning({ id: cycleActionRequired.id });
	if (action) {
		await executor
			.update(cycleNotification)
			.set({ canceledAt: now, cancellationReason: "action_resolved" })
			.where(
				and(
					eq(cycleNotification.actionRequiredId, action.id),
					isNull(cycleNotification.canceledAt),
				),
			);
	}
}
