import { Button } from "@prism/ui/components/button";

export type ScheduleAlert = {
	id: string;
	cycleId: string;
	cycleName: string;
	dueAt: string | Date;
	kind?: "end_reminder" | "completion_confirmation";
	actionRequiredId?: string | null;
	cycleState?: "planned" | "active" | "completed" | "canceled";
};

type CycleScheduleAlertsProps = {
	pendingActions: ScheduleAlert[];
	notifications: ScheduleAlert[];
	workspaceTimezone: string;
	onOpenCompletion: (cycleId: string) => void;
	onMarkRead?: (notificationId: string) => Promise<void>;
	markingNotificationId?: string | null;
	isLoading?: boolean;
	hasError?: boolean;
};

function formatDueAt(value: string | Date, timezone: string): string {
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

export function CycleScheduleAlerts({
	pendingActions,
	notifications,
	workspaceTimezone,
	onOpenCompletion,
	onMarkRead,
	markingNotificationId = null,
	isLoading = false,
	hasError = false,
}: CycleScheduleAlertsProps) {
	const actionIds = new Set(pendingActions.map((action) => action.id));
	const visibleNotifications = notifications.filter(
		(notification) =>
			notification.kind !== "completion_confirmation" ||
			!notification.actionRequiredId ||
			!actionIds.has(notification.actionRequiredId),
	);
	if (isLoading) {
		return (
			<output className="text-sm text-muted-foreground">
				Loading cycle alerts…
			</output>
		);
	}
	if (hasError) {
		return (
			<p role="alert" className="text-sm text-destructive">
				Cycle alerts are temporarily unavailable.
			</p>
		);
	}
	if (pendingActions.length === 0 && visibleNotifications.length === 0)
		return null;
	return (
		<section aria-label="Cycle schedule alerts" className="space-y-3">
			{pendingActions.map((action) => (
				<div
					key={action.id}
					role="alert"
					className="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-amber-500/40 bg-amber-500/10 p-4"
				>
					<div>
						<p className="font-semibold">Completion confirmation required</p>
						<p className="text-sm text-muted-foreground">
							{action.cycleName} reached its end at{" "}
							{formatDueAt(action.dueAt, workspaceTimezone)}.
						</p>
					</div>
					{action.cycleState === "active" ? (
						<Button
							type="button"
							onClick={() => onOpenCompletion(action.cycleId)}
						>
							Review cycle
						</Button>
					) : (
						<div>
							<Button
								type="button"
								disabled
								aria-describedby={`${action.id}-state`}
							>
								Review cycle
							</Button>
							<span id={`${action.id}-state`} className="sr-only">
								This cycle is not active and cannot be completed yet.
							</span>
						</div>
					)}
				</div>
			))}
			{visibleNotifications.map((notification) => (
				<output
					key={notification.id}
					className="flex items-start justify-between gap-4 rounded-lg border border-sky-500/30 bg-sky-500/5 p-4"
				>
					<div>
						<p className="font-semibold">
							{notification.kind === "completion_confirmation"
								? "Completion confirmation required"
								: "Cycle ends soon"}
						</p>
						<p className="text-sm text-muted-foreground">
							{notification.cycleName} ends at{" "}
							{formatDueAt(notification.dueAt, workspaceTimezone)}.
						</p>
					</div>
					{onMarkRead ? (
						<Button
							type="button"
							variant="ghost"
							disabled={markingNotificationId === notification.id}
							aria-label={`Mark ${notification.cycleName} notification as read`}
							onClick={() => void onMarkRead(notification.id)}
						>
							{markingNotificationId === notification.id
								? "Saving…"
								: "Dismiss"}
						</Button>
					) : null}
				</output>
			))}
		</section>
	);
}
