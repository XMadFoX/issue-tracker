import { CycleCompleteDialog } from "@prism/blocks/src/features/cycles/cycle-complete-dialog";
import type { Cycle } from "@prism/blocks/src/features/cycles/cycle-card";
import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "bun:test";

afterEach(cleanup);

const source: Cycle = {
	id: "source-cycle",
	workspaceId: "workspace-1",
	teamId: "team-1",
	name: "Current cycle",
	sequence: 1,
	startDate: new Date("2026-07-01T00:00:00.000Z"),
	endDate: new Date("2026-07-14T00:00:00.000Z"),
	state: "active",
	capacity: null,
	velocity: null,
	createdAt: new Date("2026-06-20T00:00:00.000Z"),
	updatedAt: new Date("2026-06-20T00:00:00.000Z"),
};

const nextPlanned: Cycle = {
	...source,
	id: "planned-cycle",
	name: "Next planned cycle",
	sequence: 3,
	startDate: new Date("2026-07-28T00:00:00.000Z"),
	endDate: new Date("2026-08-11T00:00:00.000Z"),
	state: "planned",
};

const earlierActive: Cycle = {
	...source,
	id: "active-cycle",
	name: "Fallback active cycle",
	sequence: 2,
	startDate: new Date("2026-07-15T00:00:00.000Z"),
	endDate: new Date("2026-07-28T00:00:00.000Z"),
	state: "active",
};

function renderDialog({
	cycles = [source, nextPlanned, earlierActive],
	isCompleting = false,
	onSubmit = vi.fn(async () => undefined),
}: {
	cycles?: Cycle[];
	isCompleting?: boolean;
	onSubmit?: (
		value:
			| { type: "carryOver"; targetCycleId: string }
			| { type: "moveToBacklog" },
	) => Promise<void>;
} = {}) {
	const onOpenChange = vi.fn();
	render(
		<CycleCompleteDialog
			source={source}
			cycles={cycles}
			open
			onOpenChange={onOpenChange}
			isCompleting={isCompleting}
			onSubmit={onSubmit}
		/>,
	);
	return { onOpenChange, onSubmit };
}

describe("CycleCompleteDialog", () => {
	it("defaults to the next planned same-team target and submits carry-over", async () => {
		const { onOpenChange, onSubmit } = renderDialog({
			cycles: [
				source,
				{ ...nextPlanned, id: "wrong-team", teamId: "team-2" },
				{ ...nextPlanned, id: "closed", state: "completed" },
				nextPlanned,
				earlierActive,
			],
		});

		expect(
			screen.getByRole("alertdialog", { name: "Complete Current cycle?" }),
		).toBeTruthy();
		expect(screen.getByText("Target cycle")).toBeTruthy();
		fireEvent.click(screen.getByRole("button", { name: "Complete cycle" }));

		await waitFor(() => {
			expect(onSubmit).toHaveBeenCalledWith({
				type: "carryOver",
				targetCycleId: "planned-cycle",
			});
		});
		expect(onOpenChange).toHaveBeenCalledWith(false);
	});

	it("keeps backlog completion available with an accessible no-target explanation", async () => {
		const { onSubmit } = renderDialog({ cycles: [source] });

		expect(
			screen.getByText(
				"No planned or active cycle is available for this team. Create one first, or choose Move to backlog.",
			),
		).toBeTruthy();
		expect(screen.getByRole("radio", { name: "Carry over" })).toHaveProperty(
			"disabled",
			true,
		);
		fireEvent.click(screen.getByRole("button", { name: "Complete cycle" }));

		await waitFor(() => {
			expect(onSubmit).toHaveBeenCalledWith({ type: "moveToBacklog" });
		});
	});

	it("retains the dialog and selection when completion fails", async () => {
		const onSubmit = vi.fn(async () => {
			throw new Error("Cycle already completed");
		});
		const { onOpenChange } = renderDialog({ onSubmit });

		fireEvent.click(screen.getByRole("radio", { name: "Move to backlog" }));
		fireEvent.click(screen.getByRole("button", { name: "Complete cycle" }));

		await waitFor(() => {
			expect(onSubmit).toHaveBeenCalledWith({ type: "moveToBacklog" });
		});
		expect(screen.getByRole("alertdialog")).toBeTruthy();
		expect(
			screen
				.getByRole("radio", { name: "Move to backlog" })
				.getAttribute("aria-checked"),
		).toBe("true");
		expect(onOpenChange).not.toHaveBeenCalledWith(false);
	});

	it("prevents close and duplicate submission while completion is pending", () => {
		const { onOpenChange, onSubmit } = renderDialog({ isCompleting: true });

		expect(screen.getByRole("button", { name: "Completing…" })).toHaveProperty(
			"disabled",
			true,
		);
		expect(screen.getByRole("button", { name: "Cancel" })).toHaveProperty(
			"disabled",
			true,
		);
		fireEvent.click(screen.getByRole("button", { name: "Completing…" }));
		expect(onSubmit).not.toHaveBeenCalled();
		expect(onOpenChange).not.toHaveBeenCalled();
	});
});
