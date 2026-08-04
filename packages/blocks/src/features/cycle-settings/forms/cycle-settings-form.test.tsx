import { afterEach, describe, expect, mock, test } from "bun:test";
import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@testing-library/react";
import type { CycleSettings, CycleSettingsDraft } from "../types";
import { CycleSettingsForm } from "./cycle-settings-form";

const settings: CycleSettings = {
	teamId: "team-1",
	cadenceEnabled: false,
	cadenceDays: 14,
	anchorDate: null,
	planningHorizon: 2,
	endBehavior: "automatic" as const,
	gracePeriodMinutes: 1440,
	defaultRolloverPolicy: "carry_over" as const,
	reminderLeadMinutes: 1440,
	updatedBy: null,
	createdAt: new Date("2026-01-01T00:00:00.000Z"),
	updatedAt: new Date("2026-01-01T00:00:00.000Z"),
};

afterEach(cleanup);

describe("CycleSettingsForm", () => {
	test("allows inert disabled configuration and submits once with the revision", async () => {
		const onSubmit = mock(
			async (draft: CycleSettingsDraft, _revision: string) => ({
				success: true as const,
				settings: { ...settings, cadenceDays: draft.cadenceDays },
			}),
		);
		render(
			<CycleSettingsForm
				settings={settings}
				workspaceTimezone="UTC"
				automationAvailable={false}
				onSubmit={onSubmit}
			/>,
		);

		const save = screen.getByRole("button", { name: "Save changes" });
		expect(save.getAttribute("disabled")).not.toBeNull();
		fireEvent.change(screen.getByLabelText("Cadence days"), {
			target: { value: "21" },
		});
		fireEvent.click(save);
		await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
		expect(onSubmit).toHaveBeenCalledWith(
			expect.objectContaining({ cadenceEnabled: false, cadenceDays: 21 }),
			"2026-01-01T00:00:00.000Z",
		);
	});

	test("keeps persisted paused controls locked after keyboard toggle", () => {
		const pausedSettings = {
			...settings,
			cadenceEnabled: true,
			anchorDate: new Date("2026-01-01T00:00:00.000Z"),
		};
		render(
			<CycleSettingsForm
				settings={pausedSettings}
				workspaceTimezone="UTC"
				automationAvailable={false}
				onSubmit={async () => ({ success: true, settings: pausedSettings })}
			/>,
		);
		fireEvent.click(screen.getByRole("switch", { name: "Cadence enabled" }));
		expect(
			screen.getByLabelText("Cadence days").getAttribute("disabled"),
		).not.toBeNull();
		expect(
			screen.getByLabelText("Planning horizon").getAttribute("disabled"),
		).not.toBeNull();
		expect(
			screen
				.getByRole("button", { name: "Save changes" })
				.getAttribute("disabled"),
		).toBeNull();
	});

	test("associates validation errors and focuses the first invalid field", async () => {
		render(
			<CycleSettingsForm
				settings={settings}
				workspaceTimezone="UTC"
				automationAvailable={false}
				onSubmit={async () => ({ success: true, settings })}
			/>,
		);
		fireEvent.change(screen.getByLabelText("Cadence days"), {
			target: { value: "" },
		});
		fireEvent.submit(
			screen
				.getByRole("button", { name: "Save changes" })
				.closest("form") as HTMLFormElement,
		);
		expect(
			screen.getByLabelText("Cadence days").getAttribute("aria-invalid"),
		).toBe("true");
		expect(screen.getByText(/expected number/i)).toBeTruthy();
		await waitFor(() =>
			expect(document.activeElement).toBe(
				screen.getByLabelText("Cadence days"),
			),
		);
	});

	test("retains the draft and permits one retry after a rejection", async () => {
		const onSubmit = mock()
			.mockResolvedValueOnce({ error: new Error("temporary failure") })
			.mockResolvedValueOnce({
				success: true as const,
				settings: { ...settings, cadenceDays: 21 },
			});
		render(
			<CycleSettingsForm
				settings={settings}
				workspaceTimezone="UTC"
				automationAvailable={false}
				onSubmit={onSubmit}
			/>,
		);
		fireEvent.change(screen.getByLabelText("Cadence days"), {
			target: { value: "21" },
		});
		fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
		await waitFor(() =>
			expect(screen.getByText("temporary failure")).toBeTruthy(),
		);
		expect(screen.getByLabelText("Cadence days").getAttribute("value")).toBe(
			"21",
		);
		fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
		await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(2));
	});

	test("locks the form while a save is pending", async () => {
		let finish:
			| ((value: { success: true; settings: CycleSettings }) => void)
			| undefined;
		const onSubmit = mock(
			() =>
				new Promise<{ success: true; settings: CycleSettings }>((resolve) => {
					finish = resolve;
				}),
		);
		render(
			<CycleSettingsForm
				settings={settings}
				workspaceTimezone="UTC"
				automationAvailable={false}
				onSubmit={onSubmit}
			/>,
		);
		fireEvent.change(screen.getByLabelText("Cadence days"), {
			target: { value: "21" },
		});
		fireEvent.submit(
			screen
				.getByRole("button", { name: "Save changes" })
				.closest("form") as HTMLFormElement,
		);
		await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
		expect(
			screen.getByRole("button", { name: "Saving…" }).getAttribute("disabled"),
		).not.toBeNull();
		expect(
			screen.getByLabelText("Cadence days").getAttribute("disabled"),
		).not.toBeNull();
		finish?.({ success: true, settings: { ...settings, cadenceDays: 21 } });
		await waitFor(() => expect(screen.getByText("Saved")).toBeTruthy());
	});

	test("preserves a conflict draft and exposes explicit reapply", () => {
		const onConflictReapply = mock();
		render(
			<CycleSettingsForm
				settings={settings}
				workspaceTimezone="UTC"
				automationAvailable={false}
				conflictCurrent={{ ...settings, cadenceDays: 21 }}
				onConflictReapply={onConflictReapply}
				onSubmit={async () => ({ success: true, settings })}
			/>,
		);
		fireEvent.change(screen.getByLabelText("Cadence days"), {
			target: { value: "28" },
		});
		expect(screen.getByLabelText("Cadence days").getAttribute("value")).toBe(
			"28",
		);
		fireEvent.click(screen.getByRole("button", { name: "Reapply my draft" }));
		expect(onConflictReapply).toHaveBeenCalledTimes(1);
		expect(screen.getByLabelText("Cadence days").getAttribute("value")).toBe(
			"28",
		);
	});

	test("keeps enabling unavailable and explains the runtime gate", () => {
		render(
			<CycleSettingsForm
				settings={settings}
				workspaceTimezone="UTC"
				automationAvailable={false}
				onSubmit={async () => ({ success: true, settings })}
			/>,
		);
		expect(screen.getByText(/server feature gate is off/i)).toBeTruthy();
		expect(
			screen
				.getByRole("switch", { name: "Cadence enabled" })
				.getAttribute("disabled"),
		).not.toBeNull();
	});
});
