export type IssueTypeIdentity = {
	id: string;
	name: string;
	key: string;
	icon: string;
	color: string;
	archivedAt: Date | null;
};

export type IssueTypeMetric = {
	issueType: IssueTypeIdentity | null;
	issueCount: number;
	completedIssueCount: number;
	totalPoints: number;
	completedPoints: number;
	completionRate: number;
};

export type IssueTypeScopeChange = {
	issueType: IssueTypeIdentity | null;
	issueCountDelta: number;
	pointsDelta: number;
};

export type IssueTypeMetricRow = Omit<
	IssueTypeMetric,
	"issueType" | "completionRate"
> & {
	issueTypeId: string | null;
	issueTypeName: string | null;
	issueTypeKey: string | null;
	issueTypeIcon: string | null;
	issueTypeColor: string | null;
	issueTypeArchivedAt: Date | null;
};

function compareIssueTypes(
	left: IssueTypeIdentity | null,
	right: IssueTypeIdentity | null,
) {
	if (left === null) return right === null ? 0 : 1;
	if (right === null) return -1;
	return (
		left.name.localeCompare(right.name) ||
		left.key.localeCompare(right.key) ||
		left.id.localeCompare(right.id)
	);
}

function getIssueType(row: IssueTypeMetricRow): IssueTypeIdentity | null {
	if (
		row.issueTypeId === null ||
		row.issueTypeName === null ||
		row.issueTypeKey === null ||
		row.issueTypeIcon === null ||
		row.issueTypeColor === null
	) {
		return null;
	}

	return {
		id: row.issueTypeId,
		name: row.issueTypeName,
		key: row.issueTypeKey,
		icon: row.issueTypeIcon,
		color: row.issueTypeColor,
		archivedAt: row.issueTypeArchivedAt,
	};
}

export function completionRate(
	issueCount: number,
	completedIssueCount: number,
) {
	return issueCount === 0 ? 0 : completedIssueCount / issueCount;
}

export function normalizeIssueTypeMetrics(rows: IssueTypeMetricRow[]) {
	return rows
		.map(
			(row): IssueTypeMetric => ({
				issueType: getIssueType(row),
				issueCount: row.issueCount,
				completedIssueCount: row.completedIssueCount,
				totalPoints: row.totalPoints,
				completedPoints: row.completedPoints,
				completionRate: completionRate(row.issueCount, row.completedIssueCount),
			}),
		)
		.sort((left, right) => compareIssueTypes(left.issueType, right.issueType));
}

export function buildIssueTypeScopeChange(
	current: IssueTypeMetric[],
	planned: IssueTypeMetric[],
) {
	const currentById = new Map(
		current.map((metric) => [metric.issueType?.id ?? null, metric]),
	);
	const plannedById = new Map(
		planned.map((metric) => [metric.issueType?.id ?? null, metric]),
	);
	const ids = new Set([...currentById.keys(), ...plannedById.keys()]);

	return [...ids]
		.map((id): IssueTypeScopeChange => {
			const currentMetric = currentById.get(id);
			const plannedMetric = plannedById.get(id);
			return {
				issueType: currentMetric?.issueType ?? plannedMetric?.issueType ?? null,
				issueCountDelta:
					(currentMetric?.issueCount ?? 0) - (plannedMetric?.issueCount ?? 0),
				pointsDelta:
					(currentMetric?.totalPoints ?? 0) - (plannedMetric?.totalPoints ?? 0),
			};
		})
		.sort((left, right) => compareIssueTypes(left.issueType, right.issueType));
}
