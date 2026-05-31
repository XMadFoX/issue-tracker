import type { Outputs } from "@prism/api/src/router";
import { Badge } from "@prism/ui/components/badge";
import { Button } from "@prism/ui/components/button";
import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
} from "@prism/ui/components/card";
import { Progress } from "@prism/ui/components/progress";

export type Cycle = Outputs["cycle"]["list"][0];
export type CycleMetrics = Outputs["cycle"]["metrics"];

type CycleCardProps = {
	cycle: Cycle;
	metrics?: CycleMetrics;
	onComplete?: (cycle: Cycle) => void;
	onCancel?: (cycle: Cycle) => void;
	onEdit?: (cycle: Cycle) => void;
};

export function formatCycleDateRange(
	cycle: Pick<Cycle, "startDate" | "endDate">,
) {
	const formatter = new Intl.DateTimeFormat(undefined, {
		month: "short",
		day: "2-digit",
	});
	return `${formatter.format(new Date(cycle.startDate))} – ${formatter.format(new Date(cycle.endDate))}`;
}

function formatSignedPoints(points: number) {
	if (points > 0) return `+${points}`;
	return points.toString();
}

export function CycleCard({
	cycle,
	metrics,
	onComplete,
	onCancel,
	onEdit,
}: CycleCardProps) {
	const totalPoints = metrics?.current?.totalPoints ?? 0;
	const completedPoints = metrics?.current?.completedPoints ?? 0;
	const plannedPoints = metrics?.planned?.totalPoints ?? 0;
	const pointsDelta = metrics?.scopeChange?.pointsDelta ?? 0;
	const progress = totalPoints > 0 ? (completedPoints / totalPoints) * 100 : 0;

	return (
		<Card>
			<CardHeader className="pb-3">
				<div className="flex items-start justify-between gap-3">
					<div>
						<CardTitle>{cycle.name}</CardTitle>
						<p className="mt-1 text-sm text-muted-foreground">
							{formatCycleDateRange(cycle)}
						</p>
					</div>
					<Badge variant="secondary">Active</Badge>
				</div>
			</CardHeader>
			<CardContent className="space-y-4">
				<div className="grid gap-2 text-sm sm:grid-cols-2">
					<div>
						{metrics?.current?.completedIssueCount ?? 0} /{" "}
						{metrics?.current?.issueCount ?? 0} issues done
					</div>
					<div>
						{completedPoints} / {totalPoints} pts done
					</div>
				</div>
				<Progress value={progress} />
				<div className="flex flex-wrap items-center justify-between gap-3">
					<div className="space-y-1 text-sm text-muted-foreground">
						<p>Capacity: {cycle.capacity ?? "—"} pts</p>
						{pointsDelta !== 0 ? (
							<p>
								Scope change: {formatSignedPoints(pointsDelta)} pts vs planned{" "}
								{plannedPoints} pts
							</p>
						) : null}
					</div>
					<div className="flex gap-2">
						<Button
							variant="outline"
							size="sm"
							onClick={() => onCancel?.(cycle)}
						>
							Cancel
						</Button>
						<Button variant="outline" size="sm" onClick={() => onEdit?.(cycle)}>
							Edit
						</Button>
						<Button size="sm" onClick={() => onComplete?.(cycle)}>
							Complete cycle
						</Button>
					</div>
				</div>
			</CardContent>
		</Card>
	);
}
