import { createIssuesFeature } from "@prism/features/issues";
import { toast } from "sonner";
import { client, orpc } from "@/orpc/client";

export const {
	issueQueries,
	issueQueryKeys,
	issueTypeQueryKeys,
	useIssueLiveUpdates,
	useIssueMutations,
	useIssueTypeMutations,
	useSubIssueSearch,
} = createIssuesFeature({
	client,
	orpc,
	notify: {
		success: toast.success,
		error: toast.error,
	},
});
