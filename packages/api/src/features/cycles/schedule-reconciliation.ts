import { z } from "zod";

export const scheduleReconciliationReasonSchema = z.enum([
	"scheduled_cycles_require_resolution",
	"active_cycle_conflict",
	"manual_cycle_conflict",
]);

export type ScheduleCompatibilityReason = z.infer<
	typeof scheduleReconciliationReasonSchema
>;

export const scheduleReconciliationMessages: Record<
	ScheduleCompatibilityReason,
	string
> = {
	scheduled_cycles_require_resolution:
		"Existing scheduled cycles cannot be safely moved to the requested cadence. Cancel or reschedule the conflicting planned cycles explicitly, then retry.",
	active_cycle_conflict:
		"An active cycle overlaps the requested cadence. Complete or cancel it explicitly, then retry.",
	manual_cycle_conflict:
		"A manual cycle overlaps the requested cadence. Cancel or reschedule it explicitly, then retry.",
};

export const scheduleReconciliationRequiredError = {
	SCHEDULE_RECONCILIATION_REQUIRED: {
		status: 409,
		message: scheduleReconciliationMessages.scheduled_cycles_require_resolution,
		data: z.object({
			reason: scheduleReconciliationReasonSchema,
		}),
	},
} as const;
