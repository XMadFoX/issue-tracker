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

function formatSignedValue(value: number) {
	if (value > 0) return `+${value}`;
	return value.toString();
}

export function CycleMetricsCard({ metrics }: CycleMetricsCardProps) {
	return (
		<Card>
			<CardHeader>
				<CardTitle className="text-base">Cycle metrics</CardTitle>
			</CardHeader>
			<CardContent className="grid gap-3 text-sm sm:grid-cols-4">
				<div>
					<p className="text-muted-foreground">Current issues</p>
					<p className="font-medium">
						{metrics?.current?.completedIssueCount ?? 0} /{" "}
						{metrics?.current?.issueCount ?? 0}
					</p>
				</div>
				<div>
					<p className="text-muted-foreground">Current points</p>
					<p className="font-medium">
						{metrics?.current?.completedPoints ?? 0} /{" "}
						{metrics?.current?.totalPoints ?? 0}
					</p>
				</div>
				<div>
					<p className="text-muted-foreground">Planned points</p>
					<p className="font-medium">{metrics?.planned?.totalPoints ?? 0}</p>
				</div>
				<div>
					<p className="text-muted-foreground">Scope change</p>
					<p className="font-medium">
						{formatSignedValue(metrics?.scopeChange?.pointsDelta ?? 0)} pts
					</p>
				</div>
			</CardContent>
		</Card>
	);
}
