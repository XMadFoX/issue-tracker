import type { Inputs } from "@prism/api/src/router";
import {
	AlertDialog,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@prism/ui/components/alert-dialog";
import { Button } from "@prism/ui/components/button";
import { Label } from "@prism/ui/components/label";
import { RadioGroup, RadioGroupItem } from "@prism/ui/components/radio-group";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@prism/ui/components/select";
import { useId, useState } from "react";
import { type Cycle, formatCycleDateRange } from "./cycle-card";

export type CycleCompletionDisposition =
	Inputs["cycle"]["complete"]["disposition"];

type CycleCompleteDialogProps = {
	source: Cycle;
	cycles: Cycle[];
	open: boolean;
	onOpenChange: (open: boolean) => void;
	isCompleting?: boolean;
	onSubmit: (disposition: CycleCompletionDisposition) => Promise<void>;
};

function getCycleLabel(cycle: Cycle) {
	return cycle.name || `Cycle ${cycle.sequence}`;
}

function getEligibleTargets(source: Cycle, cycles: Cycle[]) {
	return cycles
		.filter(
			(cycle) =>
				cycle.id !== source.id &&
				cycle.teamId === source.teamId &&
				(cycle.state === "planned" || cycle.state === "active"),
		)
		.sort((a, b) => {
			const startDelta =
				new Date(a.startDate).getTime() - new Date(b.startDate).getTime();
			return startDelta !== 0 ? startDelta : a.sequence - b.sequence;
		});
}

function getDefaultTargetId(eligibleTargets: Cycle[]) {
	const nextPlanned = eligibleTargets.find(
		(cycle) => cycle.state === "planned",
	);
	return nextPlanned?.id ?? eligibleTargets[0]?.id ?? null;
}

function parseDispositionType(value: string) {
	return value === "carryOver" || value === "moveToBacklog" ? value : null;
}

type CycleCompleteDialogBodyProps = Omit<CycleCompleteDialogProps, "open">;

function CycleCompleteDialogBody({
	source,
	cycles,
	isCompleting = false,
	onOpenChange,
	onSubmit,
}: CycleCompleteDialogBodyProps) {
	const carryOverId = useId();
	const moveToBacklogId = useId();
	const targetSelectId = useId();
	const targetErrorId = useId();

	const eligibleTargets = getEligibleTargets(source, cycles);
	const hasEligibleTargets = eligibleTargets.length > 0;

	const [dispositionType, setDispositionType] = useState<
		CycleCompletionDisposition["type"]
	>(hasEligibleTargets ? "carryOver" : "moveToBacklog");
	const [targetCycleId, setTargetCycleId] = useState<string | null>(
		getDefaultTargetId(eligibleTargets),
	);
	const [showTargetError, setShowTargetError] = useState(false);

	const targetIsValid =
		dispositionType !== "carryOver" ||
		(targetCycleId !== null &&
			eligibleTargets.some((cycle) => cycle.id === targetCycleId));
	const canSubmit = !isCompleting && targetIsValid;

	async function handleSubmit() {
		if (isCompleting) return;
		if (dispositionType === "carryOver" && !targetIsValid) {
			setShowTargetError(true);
			return;
		}

		const disposition: CycleCompletionDisposition =
			dispositionType === "carryOver" && targetCycleId
				? { type: "carryOver", targetCycleId }
				: { type: "moveToBacklog" };

		try {
			await onSubmit(disposition);
			onOpenChange(false);
		} catch {
			// The caller is responsible for surfacing the error (e.g. a toast).
			// Keep the dialog open so the user's selection is retained.
		}
	}

	return (
		<>
			<AlertDialogHeader>
				<AlertDialogTitle>Complete {source.name}?</AlertDialogTitle>
				<AlertDialogDescription>
					Completed and canceled issues stay on this cycle for history. Backlog
					issues return to the backlog. Choose what happens to planned and
					in-progress work below.
				</AlertDialogDescription>
			</AlertDialogHeader>

			<RadioGroup
				value={dispositionType}
				onValueChange={(value) => {
					const nextType = parseDispositionType(value);
					if (!nextType) return;
					setDispositionType(nextType);
					setShowTargetError(false);
				}}
				disabled={isCompleting}
				aria-label="Completion disposition for open work"
				className="gap-4"
			>
				<div className="flex items-start gap-3">
					<RadioGroupItem
						id={carryOverId}
						value="carryOver"
						disabled={isCompleting || !hasEligibleTargets}
						className="mt-0.5"
					/>
					<div className="grid flex-1 gap-1.5">
						<Label htmlFor={carryOverId}>Carry over</Label>
						<p className="text-muted-foreground text-sm">
							Move planned and in-progress issues into another cycle.
						</p>
						{!hasEligibleTargets ? (
							<p className="text-destructive text-sm">
								No planned or active cycle is available for this team. Create
								one first, or choose Move to backlog.
							</p>
						) : dispositionType === "carryOver" ? (
							<div className="mt-1 grid gap-1.5">
								<Label htmlFor={targetSelectId}>Target cycle</Label>
								<Select
									value={targetCycleId}
									onValueChange={(value) => {
										setTargetCycleId(value);
										setShowTargetError(false);
									}}
									disabled={isCompleting}
								>
									<SelectTrigger
										id={targetSelectId}
										aria-required
										aria-describedby={
											showTargetError ? targetErrorId : undefined
										}
										aria-invalid={showTargetError}
										className="w-full"
									>
										<SelectValue placeholder="Select a cycle" />
									</SelectTrigger>
									<SelectContent>
										{eligibleTargets.map((cycle) => (
											<SelectItem key={cycle.id} value={cycle.id}>
												{getCycleLabel(cycle)} · {formatCycleDateRange(cycle)}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
								{showTargetError ? (
									<p
										id={targetErrorId}
										role="alert"
										className="text-destructive text-sm"
									>
										Select a target cycle to carry work into.
									</p>
								) : null}
							</div>
						) : null}
					</div>
				</div>

				<div className="flex items-start gap-3">
					<RadioGroupItem
						id={moveToBacklogId}
						value="moveToBacklog"
						disabled={isCompleting}
						className="mt-0.5"
					/>
					<div className="grid flex-1 gap-1.5">
						<Label htmlFor={moveToBacklogId}>Move to backlog</Label>
						<p className="text-muted-foreground text-sm">
							Clear the cycle from all remaining planned and in-progress issues.
							Eligible open work will lose its cycle assignment.
						</p>
					</div>
				</div>
			</RadioGroup>

			<AlertDialogFooter>
				<AlertDialogCancel disabled={isCompleting}>Cancel</AlertDialogCancel>
				<Button
					type="button"
					variant="destructive"
					disabled={!canSubmit}
					onClick={() => {
						void handleSubmit();
					}}
				>
					{isCompleting ? "Completing…" : "Complete cycle"}
				</Button>
			</AlertDialogFooter>
		</>
	);
}

export function CycleCompleteDialog({
	source,
	cycles,
	open,
	onOpenChange,
	isCompleting = false,
	onSubmit,
}: CycleCompleteDialogProps) {
	return (
		<AlertDialog
			open={open}
			onOpenChange={(nextOpen) => {
				if (isCompleting) return;
				onOpenChange(nextOpen);
			}}
		>
			<AlertDialogContent>
				<CycleCompleteDialogBody
					key={open ? source.id : "closed"}
					source={source}
					cycles={cycles}
					isCompleting={isCompleting}
					onOpenChange={onOpenChange}
					onSubmit={onSubmit}
				/>
			</AlertDialogContent>
		</AlertDialog>
	);
}
