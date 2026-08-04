import type { Outputs } from "@prism/api/src/router";
import { z } from "zod";

export type CycleSettingsResponse = Outputs["cycle"]["getSettings"];
export type CycleSchedulePreview = Outputs["cycle"]["getSchedulePreview"];
export type CycleSettings = CycleSettingsResponse["settings"];

export const cycleSettingsDraftSchema = z
	.object({
		cadenceEnabled: z.boolean(),
		cadenceDays: z.number().int().positive(),
		anchorDate: z.string().nullable(),
		planningHorizon: z.number().int().min(1).max(12),
		endBehavior: z.enum([
			"automatic",
			"confirmation_required",
			"reminder_only",
		]),
		gracePeriodMinutes: z.number().int().nonnegative(),
		defaultRolloverPolicy: z.enum(["carry_over", "move_to_backlog"]),
		reminderLeadMinutes: z.number().int().nonnegative(),
	})
	.superRefine((value, context) => {
		if (value.cadenceEnabled && !value.anchorDate) {
			context.addIssue({
				code: "custom",
				message: "An anchor date is required when cadence is enabled",
				path: ["anchorDate"],
			});
		}
	});

export type CycleSettingsDraft = z.infer<typeof cycleSettingsDraftSchema>;
export type CycleSettingsSubmitResult =
	| { success: true; settings: CycleSettings }
	| { error: unknown };

export function settingsToDraft(settings: CycleSettings): CycleSettingsDraft {
	return {
		cadenceEnabled: settings.cadenceEnabled,
		cadenceDays: settings.cadenceDays,
		anchorDate: settings.anchorDate?.toISOString() ?? null,
		planningHorizon: settings.planningHorizon,
		endBehavior: settings.endBehavior,
		gracePeriodMinutes: settings.gracePeriodMinutes,
		defaultRolloverPolicy: settings.defaultRolloverPolicy,
		reminderLeadMinutes: settings.reminderLeadMinutes,
	};
}
