import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
} from "@prism/ui/components/card";
import type { CycleMetrics } from "./cycle-card";

type CycleMetricsCardProps = {
	metrics?: CycleMetrics;
};

export function CycleMetricsCard({ metrics }: CycleMetricsCardProps) {
	return (
		<Card>
			<CardHeader>
				<CardTitle className="text-base">Cycle metrics</CardTitle>
			</CardHeader>
			<CardContent className="grid gap-3 text-sm sm:grid-cols-3">
				<div>
					<p className="text-muted-foreground">Issues</p>
					<p className="font-medium">
						{metrics?.completedIssueCount ?? 0} / {metrics?.issueCount ?? 0}
					</p>
				</div>
				<div>
					<p className="text-muted-foreground">Points</p>
					<p className="font-medium">
						{metrics?.completedPoints ?? 0} / {metrics?.plannedPoints ?? 0}
					</p>
				</div>
				<div>
					<p className="text-muted-foreground">Completion</p>
					<p className="font-medium">
						{Math.round((metrics?.completionRate ?? 0) * 100)}%
					</p>
				</div>
			</CardContent>
		</Card>
	);
}
