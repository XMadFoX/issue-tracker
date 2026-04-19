import {
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
	CommandShortcut,
} from "@prism/ui/components/command";
import { Search } from "lucide-react";

export type PaletteIssueSearchInput = {
	workspaceId: string;
	teamId?: string;
	query: string;
};

export type PaletteIssueSearchResult = {
	id: string;
	title: string;
	number?: number | null;
	team?: {
		id: string;
		name: string;
		key: string;
	} | null;
};

type PaletteContentProps = {
	workspaceId?: string;
	query: string;
	onQueryChange: (query: string) => void;
	issues: Array<PaletteIssueSearchResult>;
	isSearching: boolean;
	hasSearched: boolean;
	minQueryLength?: number;
	onIssueSelect?: (issue: PaletteIssueSearchResult) => void;
};

const MIN_QUERY_LENGTH = 2;
const EMPTY_ISSUES: Array<PaletteIssueSearchResult> = [];
const ignoreQueryChange = () => {};

function getIssueReferenceLabel(issue: PaletteIssueSearchResult) {
	if (issue.team?.key && typeof issue.number === "number") {
		return `${issue.team.key}-${issue.number}`;
	}

	if (typeof issue.number === "number") {
		return `#${issue.number}`;
	}

	return null;
}

export function PaletteContent({
	workspaceId,
	query = "",
	onQueryChange = ignoreQueryChange,
	issues = EMPTY_ISSUES,
	isSearching = false,
	hasSearched = false,
	minQueryLength = MIN_QUERY_LENGTH,
	onIssueSelect,
}: PaletteContentProps) {
	const normalizedQuery = query.trim();
	const canSearch = Boolean(
		workspaceId && normalizedQuery.length >= minQueryLength,
	);

	const showOpenIssuesPrompt = !workspaceId;
	const showQueryLengthPrompt =
		Boolean(workspaceId) &&
		normalizedQuery.length > 0 &&
		normalizedQuery.length < minQueryLength;
	const showSearching = canSearch && isSearching;
	const showNoResults =
		canSearch && hasSearched && !isSearching && issues.length === 0;

	return (
		<>
			<CommandInput
				placeholder="Search issues..."
				value={query}
				onValueChange={onQueryChange}
			/>
			<CommandList>
				<CommandEmpty>
					{showOpenIssuesPrompt
						? "Open a team issues page to search issues."
						: showQueryLengthPrompt
							? `Type at least ${minQueryLength} characters, or enter an issue number.`
							: showSearching
								? "Searching issues..."
								: showNoResults
									? "No issues found."
									: "Start typing to search issues."}
				</CommandEmpty>
				{issues.length > 0 && (
					<CommandGroup heading="Issues">
						{issues.map((issue) => {
							const issueReference = getIssueReferenceLabel(issue);

							return (
								<CommandItem
									key={issue.id}
									value={`${issue.title} ${issueReference ?? ""}`}
									onSelect={() => {
										onIssueSelect?.(issue);
									}}
								>
									<Search />
									<span className="truncate">{issue.title}</span>
									{issueReference && (
										<CommandShortcut>{issueReference}</CommandShortcut>
									)}
								</CommandItem>
							);
						})}
					</CommandGroup>
				)}
			</CommandList>
		</>
	);
}
