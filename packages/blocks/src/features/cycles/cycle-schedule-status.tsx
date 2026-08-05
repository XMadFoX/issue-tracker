import { Badge } from "@prism/ui/components/badge";
import type { CycleSchedulePreview } from "../cycle-settings";

export function CycleScheduleStatus({
	preview,
	isLoading = false,
	isError = false,
	onRetry,
}: {
	preview?: CycleSchedulePreview;
	isLoading?: boolean;
	isError?: boolean;
	onRetry?: () => void;
}) {
	if (isError) {
		return (
			<div className="rounded-md border p-3 text-sm" role="alert">
				Unable to load schedule status.{" "}
				{onRetry ? (
					<button type="button" className="underline" onClick={onRetry}>
						Retry
					</button>
				) : null}
			</div>
		);
	}
	if (isLoading || !preview)
		return (
			<output className="block rounded-md border border-dashed p-3 text-sm text-muted-foreground">
				Loading schedule status…
			</output>
		);
	const title =
		preview.status === "disabled"
			? "Cadence is off"
			: preview.status === "anchor_required"
				? "Anchor required"
				: preview.automationAvailable
					? "Schedule planned"
					: "Automation paused";
	return (
		<section
			className="rounded-md border p-3"
			aria-label="Cycle schedule status"
		>
			<div className="flex flex-wrap items-center gap-2">
				<h2 className="font-medium">Schedule status</h2>
				<Badge
					variant={
						preview.status === "ready" && preview.automationAvailable
							? "default"
							: "secondary"
					}
				>
					{title}
				</Badge>
			</div>
			<p className="mt-1 text-sm text-muted-foreground">
				Policy preview only; this does not indicate worker health.
			</p>
			{preview.nextFutureBoundary ? (
				<div className="mt-2 space-y-1 text-sm">
					<p>
						Next planned boundary:{" "}
						<time dateTime={preview.nextFutureBoundary.utcIso}>
							{preview.nextFutureBoundary.localDateTime}
						</time>{" "}
						({preview.workspaceTimezone})
					</p>
					{preview.actionTiming?.reminderCandidateAt ? (
						<p>
							Reminder candidate:{" "}
							<time dateTime={preview.actionTiming.reminderCandidateAt.utcIso}>
								{preview.actionTiming.reminderCandidateAt.localDateTime}
							</time>
						</p>
					) : null}
					{preview.actionTiming?.automaticCompletionDue ? (
						<p>
							Automatic completion due:{" "}
							<time
								dateTime={preview.actionTiming.automaticCompletionDue.utcIso}
							>
								{preview.actionTiming.automaticCompletionDue.localDateTime}
							</time>
						</p>
					) : null}
					{preview.actionTiming?.managerConfirmationRequiredAt ? (
						<p>
							Manager confirmation required:{" "}
							<time
								dateTime={
									preview.actionTiming.managerConfirmationRequiredAt.utcIso
								}
							>
								{
									preview.actionTiming.managerConfirmationRequiredAt
										.localDateTime
								}
							</time>
						</p>
					) : null}
				</div>
			) : null}
		</section>
	);
}
