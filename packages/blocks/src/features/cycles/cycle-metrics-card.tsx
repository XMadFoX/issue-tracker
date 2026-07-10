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
			<CardContent className="space-y-4 text-sm">
				<div className="grid gap-3 sm:grid-cols-4">
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
				</div>
				{metrics?.byIssueType.current.length ? (
					<div className="space-y-2 border-t pt-3">
						<p className="font-medium">By issue type</p>
						<div className="space-y-1 text-muted-foreground">
							{metrics.byIssueType.current.map((metric) => (
								<div
									className="flex items-center justify-between gap-3"
									key={metric.issueType?.id ?? "unclassified"}
								>
									<span className="flex min-w-0 items-center gap-2">
										{metric.issueType ? (
											<span
												aria-hidden="true"
												className="size-2 shrink-0 rounded-full"
												style={{ backgroundColor: metric.issueType.color }}
											/>
										) : (
											<span
												aria-hidden="true"
												className="size-2 shrink-0 rounded-full bg-muted-foreground"
											/>
										)}
										<span className="truncate">
											{metric.issueType ? `${metric.issueType.icon} ` : ""}
											{metric.issueType?.name ?? "Unclassified"}
											{metric.issueType?.archivedAt ? " (Archived)" : ""}
										</span>
									</span>
									<span className="shrink-0">
										{metric.completedPoints} / {metric.totalPoints} pts ·{" "}
										{metric.completedIssueCount} / {metric.issueCount} issues
									</span>
								</div>
							))}
						</div>
					</div>
				) : null}
			</CardContent>
		</Card>
	);
}
