import type { IssueActivityList, IssueStatusList } from "../types";

type Activity = IssueActivityList[number];

type Props = {
	activity: IssueActivityList;
	statuses: IssueStatusList;
};

const fieldLabels: Record<string, string> = {
	archivedAt: "archive status",
	assigneeId: "assignee",
	description: "description",
	dueDate: "due date",
	labels: "labels",
	parentIssueId: "parent issue",
	priorityId: "priority",
	reporterId: "reporter",
	sortOrder: "position",
	title: "title",
};

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getMetadata(activity: Activity) {
	if (!isRecord(activity.metadata)) return null;
	return activity.metadata;
}

function getMetadataCycleName(activity: Activity, key: string) {
	const metadata = getMetadata(activity);
	const value = metadata?.[key];
	return typeof value === "string" ? value : null;
}

function getUpdatedFields(activity: Activity) {
	const metadata = getMetadata(activity);
	const updatedFields = metadata?.updatedFields;
	if (!Array.isArray(updatedFields)) return [];
	return updatedFields.filter((field) => typeof field === "string");
}

function formatList(items: Array<string>) {
	if (items.length === 0) return "";
	return new Intl.ListFormat(undefined, {
		style: "long",
		type: "conjunction",
	}).format(items);
}

function formatActor(activity: Activity) {
	return activity.actor?.name ?? "Someone";
}

function formatStatusName(statuses: IssueStatusList, value: unknown) {
	if (typeof value !== "string") return "No status";
	return statuses.find((status) => status.id === value)?.name ?? value;
}

function formatEstimate(value: unknown) {
	if (typeof value === "number") return String(value);
	return "No estimate";
}

function formatCreatedDetails(activity: Activity, statuses: IssueStatusList) {
	const metadata = getMetadata(activity);
	const details = [];
	const statusId = metadata?.statusId;
	const estimate = metadata?.estimate;

	if (statusId) details.push(`Status: ${formatStatusName(statuses, statusId)}`);
	if (estimate !== undefined)
		details.push(`Estimate: ${formatEstimate(estimate)}`);
	if (activity.cycle?.name) details.push(`Cycle: ${activity.cycle.name}`);

	return details.join(" · ");
}

function formatUpdatedAction(activity: Activity) {
	const fields = getUpdatedFields(activity).map(
		(field) => fieldLabels[field] ?? field,
	);
	const fieldList = formatList(fields);
	if (!fieldList) return "updated this issue";
	return `updated ${fieldList}`;
}

function formatCycleName(activity: Activity) {
	if (activity.cycle?.name) return activity.cycle.name;
	if (typeof activity.toValue === "string") return activity.toValue;
	if (typeof activity.fromValue === "string") return activity.fromValue;
	return "";
}

function formatActivitySummary(activity: Activity, statuses: IssueStatusList) {
	switch (activity.actionType) {
		case "issue.created": {
			return {
				action: "created this issue",
				details: formatCreatedDetails(activity, statuses),
			};
		}
		case "issue.updated": {
			return { action: formatUpdatedAction(activity), details: "" };
		}
		case "issue.status_changed": {
			return {
				action: "changed status",
				details: `${formatStatusName(statuses, activity.fromValue)} → ${formatStatusName(statuses, activity.toValue)}`,
			};
		}
		case "issue.estimate_changed": {
			return {
				action: "changed estimate",
				details: `${formatEstimate(activity.fromValue)} → ${formatEstimate(activity.toValue)}`,
			};
		}
		case "issue.cycle_assigned": {
			return { action: "assigned cycle", details: formatCycleName(activity) };
		}
		case "issue.cycle_unassigned": {
			return { action: "unassigned cycle", details: formatCycleName(activity) };
		}
		case "issue.cycle_rolled_over": {
			// The activity's cycleId is the rollover destination, so the origin cycle
			// name only survives in metadata captured at mutation time.
			const fromCycleName =
				getMetadataCycleName(activity, "fromCycleName") ?? "a previous cycle";
			const toCycleName =
				activity.cycle?.name ??
				getMetadataCycleName(activity, "toCycleName") ??
				"the new cycle";
			return {
				action: "rolled over cycle",
				details: `${fromCycleName} → ${toCycleName}`,
			};
		}
		case "issue.cycle_returned_to_backlog": {
			// The activity's cycleId is the source cycle that completed, so it can be
			// used directly with a metadata fallback for safety.
			const fromCycleName =
				activity.cycle?.name ??
				getMetadataCycleName(activity, "fromCycleName") ??
				"the cycle";
			return {
				action: "returned to backlog",
				details: `${fromCycleName} completed`,
			};
		}
		default: {
			activity.actionType satisfies never;
			return { action: "updated this issue", details: "" };
		}
	}
}

function formatActivityDate(date: Activity["createdAt"]) {
	return new Intl.DateTimeFormat(undefined, {
		dateStyle: "medium",
		timeStyle: "short",
	}).format(new Date(date));
}

export function IssueActivitySection({ activity, statuses }: Props) {
	return (
		<section className="space-y-3">
			<div>
				<h2 className="font-medium text-sm">Activity</h2>
			</div>

			{activity.length === 0 ? (
				<p className="text-muted-foreground text-sm">No activity yet.</p>
			) : (
				<ul className="space-y-3">
					{activity.map((item) => {
						const summary = formatActivitySummary(item, statuses);

						return (
							<li key={item.id} className="text-sm">
								<div>
									<span className="font-medium">{formatActor(item)}</span>{" "}
									<span>{summary.action}</span>
									{summary.details ? (
										<span className="text-muted-foreground">
											{" "}
											· {summary.details}
										</span>
									) : null}
								</div>
								<time
									dateTime={new Date(item.createdAt).toISOString()}
									className="text-muted-foreground text-xs"
								>
									{formatActivityDate(item.createdAt)}
								</time>
							</li>
						);
					})}
				</ul>
			)}
		</section>
	);
}
