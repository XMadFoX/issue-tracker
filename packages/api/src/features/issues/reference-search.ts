export type IssueReferenceTeam = {
	id: string;
	key: string;
};

type IssueReferenceCandidate = {
	teamId: string;
	number: number;
};

export type IssueReferenceSearch =
	| {
			kind: "number";
			number: number;
	  }
	| {
			kind: "teamNumber";
			candidates: Array<IssueReferenceCandidate>;
	  };

const DIGITS_ONLY_REGEX = /^\d+$/;

function parseIssueNumber(value: string) {
	if (!DIGITS_ONLY_REGEX.test(value)) return null;

	const number = Number(value);
	if (!Number.isSafeInteger(number) || number < 1) return null;

	return number;
}

export function parseIssueReferenceSearch(
	query: string,
	teams: Array<IssueReferenceTeam>,
): IssueReferenceSearch | null {
	const normalizedQuery = query.trim();
	if (normalizedQuery.length === 0) return null;

	const bareNumber = parseIssueNumber(normalizedQuery);
	if (bareNumber !== null) {
		return { kind: "number", number: bareNumber };
	}

	const separatorIndex = normalizedQuery.lastIndexOf("-");
	if (separatorIndex > 0 && separatorIndex < normalizedQuery.length - 1) {
		const teamKey = normalizedQuery.slice(0, separatorIndex).toLowerCase();
		const number = parseIssueNumber(normalizedQuery.slice(separatorIndex + 1));

		if (number !== null) {
			const candidates = teams
				.filter((team) => team.key.toLowerCase() === teamKey)
				.map((team) => ({ teamId: team.id, number }));

			if (candidates.length === 0) return null;

			return {
				kind: "teamNumber",
				candidates,
			};
		}
	}

	const compactCandidates = teams.flatMap((team) => {
		const teamKey = team.key.toLowerCase();
		const normalizedReference = normalizedQuery.toLowerCase();

		if (!normalizedReference.startsWith(teamKey)) return [];

		const number = parseIssueNumber(normalizedReference.slice(teamKey.length));
		if (number === null) return [];

		return [{ teamId: team.id, number }];
	});

	if (compactCandidates.length === 0) return null;

	return { kind: "teamNumber", candidates: compactCandidates };
}
