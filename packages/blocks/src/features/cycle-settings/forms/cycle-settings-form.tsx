import { Button } from "@prism/ui/components/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardFooter,
	CardHeader,
	CardTitle,
} from "@prism/ui/components/card";
import { Input } from "@prism/ui/components/input";
import { Label } from "@prism/ui/components/label";
import { Switch } from "@prism/ui/components/switch";
import { useEffect, useRef, useState } from "react";
import { instantToLocalDateTime, localDateTimeToInstant } from "../timezone";
import {
	type CycleSchedulePreview,
	type CycleSettings,
	type CycleSettingsDraft,
	type CycleSettingsSubmitResult,
	cycleSettingsDraftSchema,
	settingsToDraft,
} from "../types";

export type CycleSettingsFormProps = {
	settings: CycleSettings;
	workspaceTimezone: string;
	automationAvailable: boolean;
	preview?: CycleSchedulePreview;
	previewLoading?: boolean;
	previewError?: boolean;
	onPreviewRetry?: () => void;
	workspaceGeneralHref?: string;
	conflictCurrent?: CycleSettings;
	onConflictClear?: () => void;
	onConflictReapply?: () => void;
	onSubmit: (
		draft: CycleSettingsDraft,
		expectedUpdatedAt: string,
	) => Promise<CycleSettingsSubmitResult>;
};

const endingOptions = [
	["automatic", "Automatic"],
	["confirmation_required", "Manager confirmation"],
	["reminder_only", "Reminders only"],
] as const;

type EndBehavior = CycleSettingsDraft["endBehavior"];
function parseEndBehavior(value: string): EndBehavior {
	switch (value) {
		case "confirmation_required":
			return "confirmation_required";
		case "reminder_only":
			return "reminder_only";
		default:
			return "automatic";
	}
}

type RolloverPolicy = CycleSettingsDraft["defaultRolloverPolicy"];
function parseRolloverPolicy(value: string): RolloverPolicy {
	return value === "move_to_backlog" ? value : "carry_over";
}

function parseNumberInput(value: string): number {
	return value.trim() === "" ? Number.NaN : Number(value);
}

function numberInputValue(value: number): number | "" {
	return Number.isFinite(value) ? value : "";
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

export function CycleSettingsForm({
	settings,
	workspaceTimezone,
	automationAvailable,
	preview,
	previewLoading = false,
	previewError = false,
	onPreviewRetry,
	workspaceGeneralHref,
	conflictCurrent,
	onConflictClear,
	onConflictReapply,
	onSubmit,
}: CycleSettingsFormProps) {
	const [draft, setDraft] = useState(() => settingsToDraft(settings));
	const [baselineDraft, setBaselineDraft] = useState(() =>
		settingsToDraft(settings),
	);
	const [error, setError] = useState<string | null>(null);
	const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
	const [isSubmitting, setIsSubmitting] = useState(false);
	const [saved, setSaved] = useState(false);
	const formRef = useRef<HTMLFormElement>(null);

	useEffect(() => {
		const nextDraft = settingsToDraft(settings);
		setBaselineDraft(nextDraft);
		setDraft((current) => {
			const wasDirty = (
				Object.keys(nextDraft) as Array<keyof CycleSettingsDraft>
			).some((key) => current[key] !== nextDraft[key]);
			return wasDirty ? current : nextDraft;
		});
		setError(null);
		setFieldErrors({});
	}, [settings]);

	useEffect(() => {
		if (Object.keys(fieldErrors).length === 0) return;
		const firstInvalid = formRef.current?.querySelector<HTMLElement>(
			'[aria-invalid="true"]',
		);
		firstInvalid?.focus();
	}, [fieldErrors]);

	// Keep every persisted enabled policy locked until the disabling save succeeds.
	// This intentionally uses the server baseline, not the draft switch value.
	const paused = !automationAvailable && baselineDraft.cadenceEnabled;
	const disablingPausedPolicy = paused && !draft.cadenceEnabled;
	const isDirty = (
		Object.keys(baselineDraft) as Array<keyof CycleSettingsDraft>
	).some((key) => draft[key] !== baselineDraft[key]);
	const setValue = <K extends keyof CycleSettingsDraft>(
		key: K,
		value: CycleSettingsDraft[K],
	) => {
		setSaved(false);
		setDraft((current) => ({ ...current, [key]: value }));
	};
	const submit = async (event: React.FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		setError(null);
		setFieldErrors({});
		const parsedDraft = cycleSettingsDraftSchema.safeParse(draft);
		if (!parsedDraft.success) {
			const nextFieldErrors: Record<string, string> = {};
			for (const issue of parsedDraft.error.issues) {
				const key = issue.path[0];
				if (typeof key === "string" && !nextFieldErrors[key]) {
					nextFieldErrors[key] = issue.message;
				}
			}
			setFieldErrors(nextFieldErrors);
			setError("Review the highlighted fields before saving.");
			return;
		}
		if (paused && draft.cadenceEnabled) {
			setError("Automation is paused. Turn cadence off before saving.");
			return;
		}
		if (!isDirty) return;
		setIsSubmitting(true);
		const submitDraft = disablingPausedPolicy
			? { ...baselineDraft, cadenceEnabled: false }
			: parsedDraft.data;
		const result = await onSubmit(
			submitDraft,
			settings.updatedAt.toISOString(),
		);
		setIsSubmitting(false);
		if ("error" in result) {
			setError(
				result.error instanceof Error
					? result.error.message
					: "Unable to save cycle settings.",
			);
			return;
		}
		const nextDraft = settingsToDraft(result.settings);
		setSaved(true);
		setDraft(nextDraft);
		setBaselineDraft(nextDraft);
	};

	return (
		<form
			ref={formRef}
			onSubmit={submit}
			className="space-y-6"
			aria-describedby="cycle-settings-description"
		>
			<Card>
				<CardHeader>
					<CardTitle>Cycle automation</CardTitle>
					<CardDescription id="cycle-settings-description">
						Configure recurring cycle planning for this team. Schedule previews
						describe policy timing, not worker health.
					</CardDescription>
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
				</CardHeader>
				<CardContent className="space-y-6">
					{!automationAvailable ? (
						<div
							className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm"
							aria-live="polite"
						>
							Automation is unavailable while the server feature gate is off.
							You can save an inert disabled configuration; enabling remains
							unavailable.
						</div>
					) : null}
					{paused ? (
						<div
							className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm"
							aria-live="assertive"
						>
							Automation paused. Turn cadence off before changing this policy.
						</div>
					) : null}
					{conflictCurrent ? (
						<div
							className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm"
							role="alert"
						>
							<p className="font-medium">Settings changed elsewhere.</p>
							<p className="mt-1">
								Your draft is preserved. Review the current server values or
								reapply your draft.
							</p>
							<div className="mt-3 flex flex-wrap gap-2">
								<Button
									type="button"
									variant="outline"
									onClick={() => {
										const current = settingsToDraft(conflictCurrent);
										setDraft(current);
										setBaselineDraft(current);
										setError(null);
										onConflictClear?.();
									}}
								>
									Review current values
								</Button>
								<Button type="button" onClick={() => onConflictReapply?.()}>
									Reapply my draft
								</Button>
							</div>
						</div>
					) : null}
					<div className="flex items-center justify-between gap-4 rounded-md border p-4">
						<div>
							<Label htmlFor="cadence-enabled">Cadence enabled</Label>
							<p className="text-sm text-muted-foreground">
								Plans future cycles from the workspace timezone.
							</p>
						</div>
						<Switch
							id="cadence-enabled"
							checked={draft.cadenceEnabled}
							disabled={
								(!automationAvailable && !draft.cadenceEnabled) || isSubmitting
							}
							onCheckedChange={(checked) => setValue("cadenceEnabled", checked)}
							aria-label="Cadence enabled"
						/>
					</div>
					<div className="grid gap-4 sm:grid-cols-2">
						<Field
							id="cadence-days"
							label="Cadence days"
							description="Calendar days between cycle boundaries."
							error={fieldErrors.cadenceDays}
						>
							<Input
								id="cadence-days"
								type="number"
								min={1}
								step={1}
								value={numberInputValue(draft.cadenceDays)}
								disabled={paused || isSubmitting}
								aria-invalid={fieldErrors.cadenceDays ? true : undefined}
								aria-describedby="cadence-days-description cadence-days-error"
								onChange={(event) =>
									setValue("cadenceDays", parseNumberInput(event.target.value))
								}
							/>
						</Field>
						<Field
							id="anchor-date"
							label={`Anchor date and time (${workspaceTimezone})`}
							description="Required only when cadence is enabled."
							error={fieldErrors.anchorDate}
						>
							<Input
								id="anchor-date"
								type="datetime-local"
								value={instantToLocalDateTime(
									draft.anchorDate,
									workspaceTimezone,
								)}
								disabled={paused || isSubmitting}
								aria-invalid={fieldErrors.anchorDate ? true : undefined}
								aria-describedby="anchor-date-description anchor-date-error"
								onChange={(event) =>
									setValue(
										"anchorDate",
										localDateTimeToInstant(
											event.target.value,
											workspaceTimezone,
										),
									)
								}
							/>
						</Field>
						<Field
							id="planning-horizon"
							label="Planning horizon"
							description="Number of upcoming planned cycles (1–12)."
							error={fieldErrors.planningHorizon}
						>
							<Input
								id="planning-horizon"
								type="number"
								min={1}
								max={12}
								step={1}
								value={numberInputValue(draft.planningHorizon)}
								disabled={paused || isSubmitting}
								aria-invalid={fieldErrors.planningHorizon ? true : undefined}
								aria-describedby="planning-horizon-description planning-horizon-error"
								onChange={(event) =>
									setValue(
										"planningHorizon",
										parseNumberInput(event.target.value),
									)
								}
							/>
						</Field>
						<Field
							id="end-behavior"
							label="Ending behavior"
							description="How the policy handles the scheduled ending."
							error={fieldErrors.endBehavior}
						>
							<select
								id="end-behavior"
								className="h-9 rounded-md border bg-transparent px-3 text-sm"
								value={draft.endBehavior}
								disabled={paused || isSubmitting}
								aria-invalid={fieldErrors.endBehavior ? true : undefined}
								aria-describedby="end-behavior-description end-behavior-error"
								onChange={(event) =>
									setValue("endBehavior", parseEndBehavior(event.target.value))
								}
							>
								{endingOptions.map(([value, label]) => (
									<option key={value} value={value}>
										{label}
									</option>
								))}
							</select>
						</Field>
						{draft.endBehavior === "automatic" ? (
							<Field
								id="grace-period"
								label="Grace period (minutes)"
								description="0 ends at the scheduled boundary."
								error={fieldErrors.gracePeriodMinutes}
							>
								<Input
									id="grace-period"
									type="number"
									min={0}
									step={1}
									value={numberInputValue(draft.gracePeriodMinutes)}
									disabled={paused || isSubmitting}
									aria-invalid={
										fieldErrors.gracePeriodMinutes ? true : undefined
									}
									aria-describedby="grace-period-description grace-period-error"
									onChange={(event) =>
										setValue(
											"gracePeriodMinutes",
											parseNumberInput(event.target.value),
										)
									}
								/>
							</Field>
						) : null}
						<Field
							id="default-rollover"
							label="Default rollover"
							description="Default disposition for unfinished work."
							error={fieldErrors.defaultRolloverPolicy}
						>
							<select
								id="default-rollover"
								className="h-9 rounded-md border bg-transparent px-3 text-sm"
								value={draft.defaultRolloverPolicy}
								disabled={paused || isSubmitting}
								aria-invalid={
									fieldErrors.defaultRolloverPolicy ? true : undefined
								}
								aria-describedby="default-rollover-description default-rollover-error"
								onChange={(event) =>
									setValue(
										"defaultRolloverPolicy",
										parseRolloverPolicy(event.target.value),
									)
								}
							>
								<option value="carry_over">
									Carry over to the next viable planned cycle
								</option>
								<option value="move_to_backlog">Move to backlog</option>
							</select>
						</Field>
						<Field
							id="reminder-lead"
							label="Reminder lead (minutes)"
							description="Reminders are available for every ending behavior."
							error={fieldErrors.reminderLeadMinutes}
						>
							<Input
								id="reminder-lead"
								type="number"
								min={0}
								step={1}
								value={numberInputValue(draft.reminderLeadMinutes)}
								disabled={paused || isSubmitting}
								aria-invalid={
									fieldErrors.reminderLeadMinutes ? true : undefined
								}
								aria-describedby="reminder-lead-description reminder-lead-error"
								onChange={(event) =>
									setValue(
										"reminderLeadMinutes",
										parseNumberInput(event.target.value),
									)
								}
							/>
						</Field>
					</div>
					<div className="rounded-md bg-muted/40 p-4 text-sm">
						<strong>
							{draft.endBehavior === "automatic"
								? "Automatic:"
								: draft.endBehavior === "confirmation_required"
									? "Manager confirmation:"
									: "Reminder-only:"}
						</strong>{" "}
						{draft.endBehavior === "automatic"
							? "The policy plans an ending after the grace period."
							: draft.endBehavior === "confirmation_required"
								? "A manager must complete the cycle manually."
								: "Reminders do not change cycle state."}{" "}
						Carry-over targets the next viable planned cycle; failure does not
						silently backlog work.
					</div>
					<PreviewState
						preview={preview}
						isLoading={previewLoading}
						isError={previewError}
						onRetry={onPreviewRetry}
						timezone={workspaceTimezone}
					/>
				</CardContent>
				<CardFooter className="justify-between gap-4 border-t">
					<span>
						{error ? (
							<span className="text-sm text-destructive" aria-live="assertive">
								{error}
							</span>
						) : saved ? (
							<span
								className="text-sm text-muted-foreground"
								aria-live="polite"
							>
								Saved
							</span>
						) : null}
					</span>
					<Button
						type="submit"
						disabled={
							isSubmitting || (paused && !disablingPausedPolicy) || !isDirty
						}
					>
						{isSubmitting ? "Saving…" : "Save changes"}
					</Button>
				</CardFooter>
			</Card>
		</form>
	);
}

function Field({
	id,
	label,
	description,
	error,
	children,
}: {
	id: string;
	label: string;
	description?: string;
	error?: string;
	children: React.ReactNode;
}) {
	return (
		<div className="space-y-2">
			<Label htmlFor={id}>{label}</Label>
			{children}
			{description ? (
				<p id={`${id}-description`} className="text-xs text-muted-foreground">
					{description}
				</p>
			) : null}
			{error ? (
				<p id={`${id}-error`} className="text-sm text-destructive">
					{error}
				</p>
			) : null}
		</div>
	);
}

function PreviewState({
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
	if (isLoading)
		return (
			<output className="block rounded-md border border-dashed p-4 text-sm">
				Loading schedule preview…
			</output>
		);
	if (isError)
		return (
			<div
				className="rounded-md border border-destructive/40 p-4 text-sm"
				role="alert"
			>
				Unable to load schedule preview.{" "}
				<Button type="button" variant="link" onClick={onRetry}>
					Retry
				</Button>
			</div>
		);
	if (!preview) return null;
	return <Preview preview={preview} timezone={timezone} />;
}

function Preview({
	preview,
	timezone,
}: {
	preview: CycleSchedulePreview;
	timezone: string;
}) {
	const status =
		preview.status === "disabled"
			? "Cadence is off"
			: preview.status === "anchor_required"
				? "Anchor required"
				: preview.automationAvailable
					? "Scheduled policy preview"
					: "Automation paused";
	return (
		<section className="rounded-md border p-4" aria-label="Schedule preview">
			<h3 className="font-medium">{status}</h3>
			<p className="mt-1 text-sm text-muted-foreground">
				This is derived from policy and does not indicate worker health.
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
					{preview.actionTiming?.reminderCandidateAt ? (
						<div>
							<dt className="text-muted-foreground">Reminder candidate</dt>
							<dd>
								{formatPreview(
									preview.actionTiming.reminderCandidateAt.utcIso,
									timezone,
								)}
							</dd>
						</div>
					) : null}
					{preview.actionTiming?.automaticCompletionDue ? (
						<div>
							<dt className="text-muted-foreground">
								Automatic completion due
							</dt>
							<dd>
								{formatPreview(
									preview.actionTiming.automaticCompletionDue.utcIso,
									timezone,
								)}
							</dd>
						</div>
					) : null}
					{preview.actionTiming?.managerConfirmationRequiredAt ? (
						<div>
							<dt className="text-muted-foreground">Manager confirmation</dt>
							<dd>
								{formatPreview(
									preview.actionTiming.managerConfirmationRequiredAt.utcIso,
									timezone,
								)}
							</dd>
						</div>
					) : null}
				</dl>
			) : null}
		</section>
	);
}
