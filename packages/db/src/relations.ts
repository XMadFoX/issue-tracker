import { abacRelations } from "./features/abac/abac.relations";
import { authRelations } from "./features/auth/auth.relations";
import { cycleRelations } from "./features/tracker/cycles.relations";
import { issueStatusRelations } from "./features/tracker/issue-statuses.relations";
import { issueRelations } from "./features/tracker/issues.relations";
import { labelRelations } from "./features/tracker/labels.relations";
import { trackerRelations } from "./features/tracker/tracker.relations";

export const relations = {
	...abacRelations,
	...authRelations,
	...cycleRelations,
	...issueStatusRelations,
	...issueRelations,
	...labelRelations,
	...trackerRelations,
};
