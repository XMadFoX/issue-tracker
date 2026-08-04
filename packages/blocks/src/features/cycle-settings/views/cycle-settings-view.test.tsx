import { afterEach, describe, expect, test } from "bun:test";
import { cleanup, render, screen } from "@testing-library/react";
import type { CycleSettings } from "../types";
import { CycleSettingsView } from "./cycle-settings-view";

const settings: CycleSettings = {
	teamId: "team-1",
	cadenceEnabled: false,
	cadenceDays: 14,
	anchorDate: null,
	planningHorizon: 2,
	endBehavior: "automatic",
	gracePeriodMinutes: 1440,
	defaultRolloverPolicy: "carry_over",
	reminderLeadMinutes: 60,
	updatedBy: null,
	createdAt: new Date("2026-01-01T00:00:00.000Z"),
	updatedAt: new Date("2026-01-01T00:00:00.000Z"),
};

afterEach(cleanup);

describe("CycleSettingsView", () => {
	test("renders reader policy as semantic read-only values", () => {
		render(
			<CycleSettingsView
				settings={settings}
				workspaceTimezone="UTC"
				automationAvailable={false}
				canManageSettings={false}
				onSubmit={async () => ({ success: true, settings })}
			/>,
		);
		expect(screen.getByText("Cadence")).toBeTruthy();
		expect(screen.getAllByRole("definition")).toHaveLength(8);
		expect(screen.queryByRole("switch")).toBeNull();
		expect(screen.queryByRole("button", { name: "Save changes" })).toBeNull();
	});

	test("keeps preview loading and retry states visible", () => {
		const { rerender } = render(
			<CycleSettingsView
				settings={settings}
				workspaceTimezone="UTC"
				automationAvailable={false}
				canManageSettings={false}
				previewLoading
				onSubmit={async () => ({ success: true, settings })}
			/>,
		);
		expect(screen.getByText("Loading schedule preview…")).toBeTruthy();
		rerender(
			<CycleSettingsView
				settings={settings}
				workspaceTimezone="UTC"
				automationAvailable={false}
				canManageSettings={false}
				previewError
				onPreviewRetry={() => undefined}
				onSubmit={async () => ({ success: true, settings })}
			/>,
		);
		expect(screen.getByRole("button", { name: "Retry" })).toBeTruthy();
	});
});
