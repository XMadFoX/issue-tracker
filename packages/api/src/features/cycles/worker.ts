import { createId } from "@paralleldrive/cuid2";
import { checkDbReachable, db } from "db";
import {
	type CycleScheduleJob,
	cycleScheduleJob,
} from "db/features/tracker/cycle-schedule-jobs.schema";
import { teamCycleSettings } from "db/features/tracker/team-cycle-settings.schema";
import { team, workspace } from "db/features/tracker/tracker.schema";
import { and, asc, eq, isNotNull, lt, lte, or, sql } from "drizzle-orm";
import { redactErrorSummary } from "../../cycles-worker-errors";
import {
	addWorkerActiveLease,
	recordWorkerGenerationOutcome,
	recordWorkerJobEvent,
	recordWorkerLatency,
	setWorkerDbReady,
} from "../../cycles-worker-metrics";
import { env } from "../../env";
import {
	maintainPlannedCycleHorizon,
	type PlannedCycleHorizonResult,
} from "./generation";
import { enumerateScheduledCycleOccurrences } from "./schedule";

export const GENERATION_JOB_TYPE = "generate_planned_cycles" as const;
export const DEFAULT_MAX_ATTEMPTS = 8;
export const DEFAULT_LEASE_MS = 5 * 60 * 1000;
export const DEFAULT_BACKOFF_MS = 60 * 1000;
export const MAX_BACKOFF_MS = 60 * 60 * 1000;

export type WorkerClock = {
	now: () => Date;
	sleep?: (milliseconds: number) => Promise<void>;
};

export type GeneratePlannedCycles = (input: {
	workspaceId: string;
	teamId: string;
	now: Date;
}) => Promise<PlannedCycleHorizonResult>;

export type WorkerJobEvent = {
	phase: "started" | "completed" | "failed";
	jobId: string;
	jobType: typeof GENERATION_JOB_TYPE;
	teamId: string;
	scheduledBoundary: Date;
	attempt: number;
	outcome?: string;
};

export type CycleWorkerConfig = {
	workerId: string;
	clock: WorkerClock;
	batchSize?: number;
	leaseMs?: number;
	maxAttempts?: number;
	automationEnabled?: boolean;
	onJobEvent?: (event: WorkerJobEvent) => void;
	/** Runs after a lease is claimed and before generation starts. */
	onBeforeGeneration?: (jobId: string) => void;
	/** Runs after generation returns and before its lease is acknowledged. */
	onBeforeAcknowledgement?: (
		jobId: string,
		result: PlannedCycleHorizonResult,
	) => void;
	/** Runs before a transient generation failure is finalized. */
	onBeforeFailureAcknowledgement?: (jobId: string) => void;
	generateHorizon?: GeneratePlannedCycles;
};

export type EnqueueResult = {
	enqueued: number;
	skipped: number;
};

export type RunOnceResult = {
	enqueue: EnqueueResult;
	claimed: number;
	acknowledged: number;
};

export type WorkerHealth = {
	dbReady: boolean;
	lastSuccessfulPollAt: Date | null;
	lastSuccessfulClaimAt: Date | null;
	activeLeases: number;
	stopping: boolean;
};

type ClaimedJob = Pick<
	CycleScheduleJob,
	| "id"
	| "workspaceId"
	| "teamId"
	| "jobType"
	| "scheduledBoundary"
	| "attempts"
	| "maxAttempts"
	| "claimToken"
>;

const successfulOutcomes = new Set<PlannedCycleHorizonResult["status"]>([
	"created",
	"already_satisfied",
	"disabled",
	"anchor_required",
	"team_not_found",
]);

function addMilliseconds(value: Date, milliseconds: number): Date {
	return new Date(value.getTime() + milliseconds);
}

export function retryDelayMs(attempt: number): number {
	const exponent = Math.max(0, attempt - 1);
	return Math.min(MAX_BACKOFF_MS, DEFAULT_BACKOFF_MS * 2 ** exponent);
}

function isSuccessfulOutcome(
	status: PlannedCycleHorizonResult["status"],
): boolean {
	return successfulOutcomes.has(status);
}

export async function enqueueGenerationJobs({
	clock,
}: {
	clock: WorkerClock;
}): Promise<EnqueueResult> {
	const now = clock.now();
	return await db.transaction(async (tx) => {
		const candidates = await tx
			.select({
				workspaceId: team.workspaceId,
				teamId: team.id,
				workspaceTimezone: workspace.timezone,
				settings: teamCycleSettings,
			})
			.from(teamCycleSettings)
			.innerJoin(team, eq(teamCycleSettings.teamId, team.id))
			.innerJoin(workspace, eq(team.workspaceId, workspace.id))
			.where(eq(teamCycleSettings.cadenceEnabled, true));

		let enqueued = 0;
		let skipped = 0;
		for (const candidate of candidates) {
			const [occurrence] = enumerateScheduledCycleOccurrences({
				workspaceTimezone: candidate.workspaceTimezone,
				settings: candidate.settings,
				now,
				count: 1,
			});
			if (!occurrence) {
				skipped += 1;
				continue;
			}

			const inserted = await tx
				.insert(cycleScheduleJob)
				.values({
					id: createId(),
					workspaceId: candidate.workspaceId,
					teamId: candidate.teamId,
					jobType: GENERATION_JOB_TYPE,
					scheduledBoundary: occurrence.boundary,
					maxAttempts: DEFAULT_MAX_ATTEMPTS,
					availableAt: now,
				})
				.onConflictDoNothing({
					target: [
						cycleScheduleJob.teamId,
						cycleScheduleJob.jobType,
						cycleScheduleJob.scheduledBoundary,
					],
				})
				.returning({ id: cycleScheduleJob.id });
			enqueued += inserted.length;
			if (inserted.length > 0) recordWorkerJobEvent("enqueued");
			if (inserted.length === 0) skipped += 1;
		}
		return { enqueued, skipped };
	});
}

export async function claimGenerationJobs({
	config,
}: {
	config: CycleWorkerConfig;
}): Promise<ClaimedJob[]> {
	const now = config.clock.now();
	const leaseExpiresAt = addMilliseconds(
		now,
		config.leaseMs ?? DEFAULT_LEASE_MS,
	);
	const batchSize = config.batchSize ?? 10;
	const maxAttempts = config.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;

	return await db.transaction(async (tx) => {
		const candidates = await tx
			.select()
			.from(cycleScheduleJob)
			.where(
				and(
					or(
						and(
							eq(cycleScheduleJob.status, "queued"),
							lte(cycleScheduleJob.availableAt, now),
						),
						and(
							eq(cycleScheduleJob.status, "started"),
							isNotNull(cycleScheduleJob.leaseExpiresAt),
							lt(cycleScheduleJob.leaseExpiresAt, now),
						),
					),
					lt(cycleScheduleJob.attempts, cycleScheduleJob.maxAttempts),
					lt(cycleScheduleJob.attempts, maxAttempts),
				),
			)
			.orderBy(asc(cycleScheduleJob.availableAt), asc(cycleScheduleJob.id))
			.limit(batchSize)
			.for("update", { skipLocked: true });

		const [oldestQueued] = await tx
			.select({ availableAt: cycleScheduleJob.availableAt })
			.from(cycleScheduleJob)
			.where(eq(cycleScheduleJob.status, "queued"))
			.orderBy(asc(cycleScheduleJob.availableAt))
			.limit(1);
		if (oldestQueued) {
			recordWorkerLatency(
				"oldest_queued_age",
				Math.max(0, now.getTime() - oldestQueued.availableAt.getTime()),
			);
		}

		const claimed: ClaimedJob[] = [];
		for (const candidate of candidates) {
			recordWorkerLatency(
				"queue_lag",
				Math.max(0, now.getTime() - candidate.availableAt.getTime()),
			);
			const claimToken = crypto.randomUUID();
			const [updated] = await tx
				.update(cycleScheduleJob)
				.set({
					status: "started",
					attempts: sql<number>`${cycleScheduleJob.attempts} + 1`,
					maxAttempts,
					workerId: config.workerId,
					claimToken,
					leaseExpiresAt,
					startedAt: now,
					finishedAt: null,
				})
				.where(eq(cycleScheduleJob.id, candidate.id))
				.returning({
					id: cycleScheduleJob.id,
					workspaceId: cycleScheduleJob.workspaceId,
					teamId: cycleScheduleJob.teamId,
					jobType: cycleScheduleJob.jobType,
					scheduledBoundary: cycleScheduleJob.scheduledBoundary,
					attempts: cycleScheduleJob.attempts,
					maxAttempts: cycleScheduleJob.maxAttempts,
					claimToken: cycleScheduleJob.claimToken,
				});
			if (updated) {
				claimed.push(updated);
				recordWorkerJobEvent("claimed");
				if (candidate.status === "started") {
					recordWorkerJobEvent("lease_recovered");
				}
			}
		}
		return claimed;
	});
}

async function acknowledgeSuccess(
	job: ClaimedJob,
	result: PlannedCycleHorizonResult,
	clock: WorkerClock,
): Promise<boolean> {
	if (!job.claimToken) return false;
	const updated = await db
		.update(cycleScheduleJob)
		.set({
			status: "succeeded",
			outcome: result.status,
			finishedAt: clock.now(),
			leaseExpiresAt: null,
			workerId: null,
			claimToken: null,
			lastErrorCode: null,
			lastErrorSummary: null,
		})
		.where(
			and(
				eq(cycleScheduleJob.id, job.id),
				eq(cycleScheduleJob.status, "started"),
				eq(cycleScheduleJob.claimToken, job.claimToken),
			),
		)
		.returning({ id: cycleScheduleJob.id });
	return updated.length > 0;
}

type FailureAcknowledgement = "requeued" | "failed" | "lost";

async function acknowledgeFailure(
	job: ClaimedJob,
	code: string,
	summary: string,
	clock: WorkerClock,
	outcome: string,
	retryable: boolean,
): Promise<FailureAcknowledgement> {
	if (!job.claimToken) return "lost";
	const now = clock.now();
	const exhausted = !retryable || job.attempts >= job.maxAttempts;
	const updated = await db
		.update(cycleScheduleJob)
		.set({
			status: exhausted ? "failed" : "queued",
			outcome: outcome.slice(0, 64),
			availableAt: exhausted
				? now
				: addMilliseconds(now, retryDelayMs(job.attempts)),
			finishedAt: exhausted ? now : null,
			leaseExpiresAt: null,
			workerId: null,
			claimToken: null,
			lastErrorCode: code.slice(0, 128),
			lastErrorSummary: redactErrorSummary(summary),
		})
		.where(
			and(
				eq(cycleScheduleJob.id, job.id),
				eq(cycleScheduleJob.status, "started"),
				eq(cycleScheduleJob.claimToken, job.claimToken),
			),
		)
		.returning({ id: cycleScheduleJob.id });
	if (updated.length === 0) return "lost";
	return exhausted ? "failed" : "requeued";
}

async function processJob(
	job: ClaimedJob,
	clock: WorkerClock,
	onJobEvent: ((event: WorkerJobEvent) => void) | undefined,
	generateHorizon: GeneratePlannedCycles,
	onBeforeGeneration: ((jobId: string) => void) | undefined,
	onBeforeAcknowledgement:
		| ((jobId: string, result: PlannedCycleHorizonResult) => void)
		| undefined,
	onBeforeFailureAcknowledgement: ((jobId: string) => void) | undefined,
): Promise<boolean> {
	onBeforeGeneration?.(job.id);
	const event = {
		jobId: job.id,
		jobType: GENERATION_JOB_TYPE,
		teamId: job.teamId,
		scheduledBoundary: job.scheduledBoundary,
		attempt: job.attempts,
	};
	onJobEvent?.({ ...event, phase: "started" });

	let result: PlannedCycleHorizonResult;
	try {
		const startedAt = performance.now();
		result = await generateHorizon({
			workspaceId: job.workspaceId,
			teamId: job.teamId,
			now: clock.now(),
		});
		recordWorkerLatency("process", performance.now() - startedAt);
	} catch (error: unknown) {
		onBeforeFailureAcknowledgement?.(job.id);
		const acknowledgement = await acknowledgeFailure(
			job,
			"TRANSIENT_RUNTIME_ERROR",
			redactErrorSummary(error),
			clock,
			"transient_error",
			true,
		);
		if (acknowledgement === "requeued") recordWorkerJobEvent("retried");
		if (acknowledgement === "failed") recordWorkerJobEvent("failed");
		if (acknowledgement === "lost") return false;
		onJobEvent?.({ ...event, phase: "failed", outcome: "transient_error" });
		return true;
	}

	if (isSuccessfulOutcome(result.status)) {
		onBeforeAcknowledgement?.(job.id, result);
		if (result.status === "created") recordWorkerGenerationOutcome("created");
		if (result.status === "already_satisfied") {
			recordWorkerGenerationOutcome("already_satisfied");
		}
		const acknowledged = await acknowledgeSuccess(job, result, clock);
		if (!acknowledged) return false;
		recordWorkerJobEvent(
			result.status === "disabled" ? "skipped_disabled" : "succeeded",
		);
		onJobEvent?.({ ...event, phase: "completed", outcome: result.status });
		return true;
	}

	onBeforeAcknowledgement?.(job.id, result);
	recordWorkerGenerationOutcome("conflict");
	const acknowledgement = await acknowledgeFailure(
		job,
		result.status,
		result.status,
		clock,
		result.status,
		false,
	);
	if (acknowledgement === "failed") recordWorkerJobEvent("failed");
	if (acknowledgement === "lost") return false;
	onJobEvent?.({ ...event, phase: "failed", outcome: result.status });
	return true;
}

export class CycleWorker {
	private readonly config: CycleWorkerConfig;
	private stopping = false;
	private dbReady = false;
	private lastSuccessfulPollAt: Date | null = null;
	private lastSuccessfulClaimAt: Date | null = null;
	private activeLeases = 0;

	constructor(config: Partial<CycleWorkerConfig> = {}) {
		this.config = {
			workerId: config.workerId ?? crypto.randomUUID(),
			clock: config.clock ?? { now: () => new Date() },
			batchSize: config.batchSize ?? 10,
			leaseMs: config.leaseMs ?? DEFAULT_LEASE_MS,
			maxAttempts: config.maxAttempts ?? DEFAULT_MAX_ATTEMPTS,
			automationEnabled:
				config.automationEnabled ?? env.CYCLES_AUTOMATION_ENABLED,
			onJobEvent: config.onJobEvent,
			onBeforeGeneration: config.onBeforeGeneration,
			onBeforeAcknowledgement: config.onBeforeAcknowledgement,
			onBeforeFailureAcknowledgement: config.onBeforeFailureAcknowledgement,
			generateHorizon: config.generateHorizon,
		};
	}

	async runOnce(): Promise<RunOnceResult> {
		if (!this.config.automationEnabled || this.stopping) {
			return {
				enqueue: { enqueued: 0, skipped: 0 },
				claimed: 0,
				acknowledged: 0,
			};
		}

		try {
			await checkDbReachable();
			this.dbReady = true;
			setWorkerDbReady(true);
			const pollStartedAt = performance.now();
			const enqueue = await enqueueGenerationJobs({ clock: this.config.clock });
			recordWorkerLatency("poll", performance.now() - pollStartedAt);
			this.lastSuccessfulPollAt = this.config.clock.now();
			if (this.stopping) {
				return { enqueue, claimed: 0, acknowledged: 0 };
			}

			const claimStartedAt = performance.now();
			const jobs = await claimGenerationJobs({ config: this.config });
			recordWorkerLatency("claim", performance.now() - claimStartedAt);
			this.lastSuccessfulClaimAt = this.config.clock.now();
			this.activeLeases += jobs.length;
			addWorkerActiveLease(jobs.length);
			let acknowledged = 0;
			try {
				for (const job of jobs) {
					if (
						await processJob(
							job,
							this.config.clock,
							this.config.onJobEvent,
							this.config.generateHorizon ?? maintainPlannedCycleHorizon,
							this.config.onBeforeGeneration,
							this.config.onBeforeAcknowledgement,
							this.config.onBeforeFailureAcknowledgement,
						)
					)
						acknowledged += 1;
				}
				return { enqueue, claimed: jobs.length, acknowledged };
			} finally {
				this.activeLeases -= jobs.length;
				addWorkerActiveLease(-jobs.length);
			}
		} catch (error: unknown) {
			this.dbReady = false;
			setWorkerDbReady(false);
			throw error;
		}
	}

	stop(): void {
		this.stopping = true;
	}

	isAutomationEnabled(): boolean {
		return this.config.automationEnabled ?? false;
	}

	getHealth(): WorkerHealth {
		return {
			dbReady: this.dbReady,
			lastSuccessfulPollAt: this.lastSuccessfulPollAt,
			lastSuccessfulClaimAt: this.lastSuccessfulClaimAt,
			activeLeases: this.activeLeases,
			stopping: this.stopping,
		};
	}
}

export function isWorkerReady(
	health: WorkerHealth,
	automationEnabled: boolean,
	now = new Date(),
): boolean {
	if (!automationEnabled || !health.dbReady || health.stopping) return false;
	if (!health.lastSuccessfulPollAt) return false;
	return now.getTime() - health.lastSuccessfulPollAt.getTime() <= 2 * 60 * 1000;
}

export async function runCycleWorkerOnce(
	config: Partial<CycleWorkerConfig> = {},
): Promise<RunOnceResult> {
	return await new CycleWorker(config).runOnce();
}

export function isDirectPostgresWorker(): boolean {
	return process.env.ENV_TYPE !== "serverless";
}

export function workerHealthResponse(worker: CycleWorker): Response {
	const health = worker.getHealth();
	return Response.json({
		status: "ok",
		...health,
		lastSuccessfulPollAt: health.lastSuccessfulPollAt?.toISOString() ?? null,
		lastSuccessfulClaimAt: health.lastSuccessfulClaimAt?.toISOString() ?? null,
	});
}

export function workerReadinessResponse(worker: CycleWorker): Response {
	const ready = isWorkerReady(worker.getHealth(), worker.isAutomationEnabled());
	return Response.json({ ready }, { status: ready ? 200 : 503 });
}
