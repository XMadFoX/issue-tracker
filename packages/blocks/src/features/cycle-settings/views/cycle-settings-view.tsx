import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@prism/ui/components/card";
import { CycleSettingsForm } from "../forms/cycle-settings-form";
import { instantToLocalDateTime } from "../timezone";
import type {
	CycleSchedulePreview,
	CycleSettings,
	CycleSettingsDraft,
	CycleSettingsSubmitResult,
} from "../types";

export type CycleSettingsViewProps = {
	settings: CycleSettings;
	workspaceTimezone: string;
	automationAvailable: boolean;
	canManageSettings: boolean;
	preview?: CycleSchedulePreview;
	previewLoading?: boolean;
	previewError?: boolean;
	onPreviewRetry?: () => void;
	conflictCurrent?: CycleSettings;
	onConflictClear?: () => void;
	onConflictReapply?: () => void;
	onSubmit: (
		draft: CycleSettingsDraft,
		expectedUpdatedAt: string,
	) => Promise<CycleSettingsSubmitResult>;
	workspaceGeneralHref?: string;
};

export function CycleSettingsView(props: CycleSettingsViewProps) {
	return props.canManageSettings ? (
		<CycleSettingsForm
			settings={props.settings}
			workspaceTimezone={props.workspaceTimezone}
			automationAvailable={props.automationAvailable}
			preview={props.preview}
			previewLoading={props.previewLoading}
			previewError={props.previewError}
			onPreviewRetry={props.onPreviewRetry}
			conflictCurrent={props.conflictCurrent}
			onConflictClear={props.onConflictClear}
			onConflictReapply={props.onConflictReapply}
			workspaceGeneralHref={props.workspaceGeneralHref}
			onSubmit={props.onSubmit}
		/>
	) : (
		<ReadOnlySettings {...props} />
	);
}

function ReadOnlySettings({
	settings,
	workspaceTimezone,
	preview,
	previewLoading = false,
	previewError = false,
	onPreviewRetry,
	workspaceGeneralHref,
}: CycleSettingsViewProps) {
	const values = [
		["Cadence", settings.cadenceEnabled ? "Enabled" : "Disabled"],
		["Cadence days", String(settings.cadenceDays)],
		[
			"Anchor",
			settings.anchorDate
				? `${instantToLocalDateTime(settings.anchorDate, workspaceTimezone)} (${workspaceTimezone})`
				: "Not configured",
		],
		["Planning horizon", String(settings.planningHorizon)],
		[
			"Ending behavior",
			settings.endBehavior === "confirmation_required"
				? "Manager confirmation"
				: settings.endBehavior === "reminder_only"
					? "Reminders only"
					: "Automatic",
		],
		["Grace period", `${settings.gracePeriodMinutes} minutes`],
		[
			"Default rollover",
			settings.defaultRolloverPolicy === "carry_over"
				? "Carry over"
				: "Move to backlog",
		],
		["Reminder lead", `${settings.reminderLeadMinutes} minutes`],
	];
	return (
		<Card>
			<CardHeader>
				<CardTitle>Cycle automation</CardTitle>
				<CardDescription>
					Read-only schedule policy. You do not have permission to manage cycle
					settings.
				</CardDescription>
			</CardHeader>
			<CardContent className="space-y-5">
				<dl className="grid gap-4 sm:grid-cols-2">
					{values.map(([label, value]) => (
						<div key={label}>
							<dt className="text-sm text-muted-foreground">{label}</dt>
							<dd className="font-medium">{value}</dd>
						</div>
					))}
				</dl>
				<p className="text-sm text-muted-foreground">
					Workspace timezone:{" "}
					{workspaceGeneralHref ? (
						<a
							className="underline underline-offset-4"
							href={workspaceGeneralHref}
						>
							{workspaceTimezone}
						</a>
					) : (
						workspaceTimezone
					)}
				</p>
				<ReadonlyPreview
					preview={preview}
					isLoading={previewLoading}
					isError={previewError}
					onRetry={onPreviewRetry}
					timezone={workspaceTimezone}
				/>
			</CardContent>
		</Card>
	);
}

function formatPreview(value: string | null, timezone: string) {
	if (!value) return "Not scheduled";
	try {
		return new Intl.DateTimeFormat(undefined, {
			dateStyle: "medium",
			timeStyle: "short",
			timeZone: timezone,
		}).format(new Date(value));
	} catch {
		return "Unavailable";
	}
}

function ReadonlyPreview({
	preview,
	isLoading,
	isError,
	onRetry,
	timezone,
}: {
	preview?: CycleSchedulePreview;
	isLoading: boolean;
	isError: boolean;
	onRetry?: () => void;
	timezone: string;
}) {
	if (isLoading) {
		return (
			<output className="block rounded-md border border-dashed p-4 text-sm">
				Loading schedule preview…
			</output>
		);
	}
	if (isError) {
		return (
			<div
				className="rounded-md border border-destructive/40 p-4 text-sm"
				role="alert"
			>
				Unable to load schedule preview.{" "}
				{onRetry ? (
					<button type="button" className="underline" onClick={onRetry}>
						Retry
					</button>
				) : null}
			</div>
		);
	}
	if (!preview) return null;
	const title =
		preview.status === "disabled"
			? "Cadence is off"
			: preview.status === "anchor_required"
				? "Anchor required"
				: preview.automationAvailable
					? "Schedule planned"
					: "Automation paused";
	return (
		<section className="rounded-md border p-4" aria-label="Schedule preview">
			<h3 className="font-medium">{title}</h3>
			<p className="mt-1 text-sm text-muted-foreground">
				Policy preview only; this does not indicate worker health.
			</p>
			{preview.nextFutureBoundary ? (
				<dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
					<div>
						<dt className="text-muted-foreground">Next boundary</dt>
						<dd>
							{formatPreview(preview.nextFutureBoundary.utcIso, timezone)}
						</dd>
					</div>
					<div>
						<dt className="text-muted-foreground">Next cycle end</dt>
						<dd>
							{formatPreview(preview.nextCycleEnd?.utcIso ?? null, timezone)}
						</dd>
					</div>
					<div>
						<dt className="text-muted-foreground">Reminder candidate</dt>
						<dd>
							{formatPreview(
								preview.actionTiming?.reminderCandidateAt.utcIso ?? null,
								timezone,
							)}
						</dd>
					</div>
				</dl>
			) : null}
		</section>
	);
}
