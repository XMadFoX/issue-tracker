import type { Inputs } from "@prism/api/src/router";
import { Button } from "@prism/ui/components/button";
import { Edit, Trash2 } from "lucide-react";
import { type ReactNode, useState } from "react";
import {
	type Cycle,
	CycleCard,
	type CycleMetrics,
	formatCycleDateRange,
} from "./cycle-card";
import { CycleCreateModal } from "./cycle-create-modal";
import { CycleFormDialog } from "./cycle-form-dialog";

type CycleListProps = {
	cycles: Cycle[];
	metricsByCycleId: Map<string, CycleMetrics>;
	cycleDuration?: number | null;
	onCreate: (
		value: Pick<
			Inputs["cycle"]["create"],
			"name" | "startDate" | "endDate" | "capacity"
		>,
	) => Promise<void>;
	onUpdate: (
		value: Omit<Inputs["cycle"]["update"], "workspaceId">,
	) => Promise<void>;
	onDelete: (cycle: Cycle) => Promise<void>;
};

export function CycleList({
	cycles,
	metricsByCycleId,
	cycleDuration,
	onCreate,
	onUpdate,
	onDelete,
}: CycleListProps) {
	const [editingCycle, setEditingCycle] = useState<Cycle | null>(null);
	const activeCycle = cycles.find((cycle) => cycle.state === "active");
	const plannedCycles = cycles.filter((cycle) => cycle.state === "planned");
	const completedCycles = cycles.filter((cycle) => cycle.state === "completed");

	return (
		<div className="w-full space-y-6">
			<div className="flex items-center justify-between gap-4">
				<h1 className="text-2xl font-bold">Cycles</h1>
				<CycleCreateModal cycleDuration={cycleDuration} onSubmit={onCreate} />
			</div>

			{activeCycle ? (
				<CycleCard
					cycle={activeCycle}
					metrics={metricsByCycleId.get(activeCycle.id)}
					onComplete={(cycle) => onUpdate({ id: cycle.id, state: "completed" })}
					onCancel={(cycle) => onUpdate({ id: cycle.id, state: "canceled" })}
					onEdit={setEditingCycle}
				/>
			) : (
				<div className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
					No active cycle.
				</div>
			)}

			<CycleSection title="Planned">
				{plannedCycles.map((cycle) => (
					<div
						key={cycle.id}
						className="grid items-center gap-3 border-b py-3 text-sm last:border-b-0 md:grid-cols-[1fr_1fr_auto_auto]"
					>
						<div className="font-medium">{cycle.name}</div>
						<div className="text-muted-foreground">
							{formatCycleDateRange(cycle)}
						</div>
						<div className="text-muted-foreground">
							Capacity {cycle.capacity ?? "—"}
						</div>
						<div className="flex items-center justify-end gap-2">
							<Button
								onClick={() => onUpdate({ id: cycle.id, state: "active" })}
							>
								Start
							</Button>
							<Button
								size="icon"
								variant="ghost"
								onClick={() => setEditingCycle(cycle)}
							>
								<Edit className="size-4" />
							</Button>
							<Button
								size="icon"
								variant="ghost"
								onClick={() => onDelete(cycle)}
							>
								<Trash2 className="size-4" />
							</Button>
						</div>
					</div>
				))}
				{plannedCycles.length === 0 ? (
					<EmptyState>No planned cycles.</EmptyState>
				) : null}
			</CycleSection>

			<CycleSection title="Completed">
				{completedCycles.map((cycle) => {
					const metrics = metricsByCycleId.get(cycle.id);
					return (
						<div
							key={cycle.id}
							className="grid items-center gap-3 border-b py-3 text-sm last:border-b-0 md:grid-cols-[1fr_1fr_auto_auto]"
						>
							<div className="font-medium">{cycle.name}</div>
							<div className="text-muted-foreground">
								{formatCycleDateRange(cycle)}
							</div>
							<div>
								{metrics?.completedPoints ?? 0} /{" "}
								{metrics?.plannedPoints ?? cycle.capacity ?? 0} pts
							</div>
							<div className="font-medium">
								{Math.round((metrics?.completionRate ?? 0) * 100)}%
							</div>
						</div>
					);
				})}
				{completedCycles.length === 0 ? (
					<EmptyState>No completed cycles.</EmptyState>
				) : null}
			</CycleSection>

			<CycleFormDialog
				open={editingCycle !== null}
				onOpenChange={(open) => {
					if (!open) setEditingCycle(null);
				}}
				title="Edit cycle"
				cycle={editingCycle ?? undefined}
				disableStartDate={editingCycle?.state === "active"}
				onSubmit={async (value) => {
					if (!editingCycle) return;
					await onUpdate({ id: editingCycle.id, ...value });
				}}
			/>
		</div>
	);
}

function CycleSection({
	title,
	children,
}: {
	title: string;
	children: ReactNode;
}) {
	return (
		<section>
			<h2 className="mb-2 border-b pb-2 text-lg font-semibold">{title}</h2>
			<div>{children}</div>
		</section>
	);
}

function EmptyState({ children }: { children: ReactNode }) {
	return <div className="py-6 text-sm text-muted-foreground">{children}</div>;
}
