import { Button } from "@prism/ui/components/button";

export type CycleAutomationProblem = {
	id: string;
	cycleId: string | null;
	cycleName: string;
	jobType: "start_scheduled_cycle" | "complete_scheduled_cycle";
	status: "blocked" | "queued" | "failed";
	attempts: number;
	maxAttempts: number;
	availableAt: string | Date;
	scheduledBoundary: string | Date;
	outcome: string | null;
	lastErrorCode: string | null;
	lastErrorSummary: string | null;
	canRetry: boolean;
};

type CycleAutomationAlertsProps = {
	problems: CycleAutomationProblem[];
	workspaceTimezone: string;
	onRetry?: (jobId: string) => Promise<void>;
	retryingJobId?: string | null;
	isLoading?: boolean;
	hasError?: boolean;
};

function formatAt(value: string | Date, timezone: string): string {
	try {
		return new Intl.DateTimeFormat(undefined, {
			year: "numeric",
			month: "short",
			day: "numeric",
			hour: "numeric",
			minute: "2-digit",
			timeZone: timezone,
			timeZoneName: "short",
		}).format(typeof value === "string" ? new Date(value) : value);
	} catch {
		return "Unavailable time";
	}
}

function actionLabel(jobType: CycleAutomationProblem["jobType"]): string {
	return jobType === "start_scheduled_cycle"
		? "Automatic cycle start"
		: "Automatic cycle completion";
}

export function CycleAutomationAlerts({
	problems,
	workspaceTimezone,
	onRetry,
	retryingJobId = null,
	isLoading = false,
	hasError = false,
}: CycleAutomationAlertsProps) {
	if (isLoading) {
		return (
			<output className="text-sm text-muted-foreground">
				Loading automation status…
			</output>
		);
	}
	if (hasError) {
		return (
			<p role="alert" className="text-sm text-destructive">
				Cycle automation status is temporarily unavailable.
			</p>
		);
	}
	if (problems.length === 0) return null;

	return (
		<section aria-label="Cycle automation problems" className="space-y-3">
			{problems.map((problem) => {
				const isBlocked = problem.status === "blocked";
				const isRetrying = problem.status === "queued";
				const isRetryPending = retryingJobId === problem.id;
				return (
					<div
						key={problem.id}
						role={problem.status === "failed" ? "alert" : "status"}
						className={
							problem.status === "failed"
								? "flex flex-wrap items-center justify-between gap-4 rounded-lg border border-destructive/40 bg-destructive/5 p-4"
								: "flex flex-wrap items-center justify-between gap-4 rounded-lg border border-amber-500/40 bg-amber-500/10 p-4"
						}
					>
						<div className="space-y-1">
							<p className="font-semibold">
								{isBlocked
									? "Automatic start waiting"
									: isRetrying
										? "Automation retry scheduled"
										: `${actionLabel(problem.jobType)} failed`}
							</p>
							<p className="text-sm text-muted-foreground">
								{isBlocked
									? `${problem.cycleName} cannot start until the current active cycle is completed.`
									: isRetrying
										? `${actionLabel(problem.jobType)} for ${problem.cycleName} will retry at ${formatAt(problem.availableAt, workspaceTimezone)} (attempt ${problem.attempts + 1} of ${problem.maxAttempts}).`
										: (problem.lastErrorSummary ??
											`${actionLabel(problem.jobType)} for ${problem.cycleName} could not be completed.`)}
							</p>
						</div>
						{problem.status === "failed" && problem.canRetry && onRetry ? (
							<Button
								type="button"
								disabled={isRetryPending}
								onClick={() => void onRetry(problem.id)}
							>
								{isRetryPending ? "Retrying…" : "Retry"}
							</Button>
						) : null}
					</div>
				);
			})}
		</section>
	);
}
