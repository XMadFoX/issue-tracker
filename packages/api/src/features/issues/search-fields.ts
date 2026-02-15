import { sql } from "drizzle-orm";
import type { Value } from "platejs";
import { embedText } from "../../lib/ai";
import { editorToPlainText } from "../../lib/plate";

type BuildIssueSearchTextInput = {
	title?: string | null;
	description?: Value | null;
};

export function buildIssueSearchText({
	title,
	description,
}: BuildIssueSearchTextInput) {
	return [title?.trim(), description ? editorToPlainText(description) : ""]
		.filter(Boolean)
		.join("\n\n");
}

export async function buildIssueSearchFields(
	input: BuildIssueSearchTextInput,
	options?: {
		clearWhenEmpty?: boolean;
	},
) {
	const searchText = buildIssueSearchText(input);
	const clearWhenEmpty = options?.clearWhenEmpty ?? false;

	if (!searchText) {
		if (!clearWhenEmpty) {
			return {};
		}

		return {
			searchText: null,
			searchVector: null,
			embedding: null,
		};
	}

	return {
		searchText,
		searchVector: sql<string>`to_tsvector('english', ${searchText})`,
		embedding: await embedText(searchText),
	};
}
