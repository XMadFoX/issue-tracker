import { IssueDetail } from "@prism/blocks/src/features/issues/view/issue-detail";
import {
	skipToken,
	useMutation,
	useQueryClient,
	useSuspenseQuery,
} from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { orpc } from "src/orpc/client";

export const Route = createFileRoute(
	"/workspace/$slug/teams/$teamSlug/issue/$issueId",
)({
	component: RouteComponent,
});

function RouteComponent() {
	const { issueId, slug, teamSlug } = Route.useParams();
	const qc = useQueryClient();

	const workspace = useSuspenseQuery(
		orpc.workspace.getBySlug.queryOptions({ input: { slug } }),
	);

	const workspaceId = workspace.data.id;

	const team = useSuspenseQuery(
		orpc.team.getBySlug.queryOptions({
			input: { key: teamSlug, workspaceId },
		}),
	);

	const issue = useSuspenseQuery(
		orpc.issue.get.queryOptions({
			input: { id: issueId, workspaceId },
		}),
	);

	const priorities = useSuspenseQuery(
		orpc.priority.list.queryOptions({
			input: { workspaceId },
		}),
	);

	const statuses = useSuspenseQuery(
		orpc.issue.status.list.queryOptions({
			input: { id: workspaceId },
		}),
	);

	const labels = useSuspenseQuery(
		orpc.label.list.queryOptions({
			input: {
				workspaceId,
				teamId: team.data.id,
				scope: "all",
			},
		}),
	);

	const teamMembers = useSuspenseQuery(
		orpc.teamMembership.list.queryOptions({
			input: { workspaceId, teamId: team.data.id },
		}),
	);

	const invalidate = () => {
		qc.invalidateQueries({ queryKey: orpc.issue.list.key() });
		qc.invalidateQueries({
			queryKey: orpc.issue.get.key({ input: { id: issueId, workspaceId } }),
		});
	};

	const onUpdate = useMutation(
		orpc.issue.update.mutationOptions({
			onSuccess: invalidate,
		}),
	);

	const updateIssuePriority = useMutation(
		orpc.issue.updatePriority.mutationOptions({
			onSuccess: invalidate,
		}),
	);

	const updateIssueAssignee = useMutation(
		orpc.issue.updateAssignee.mutationOptions({
			onSuccess: invalidate,
		}),
	);

	const addLabels = useMutation(
		orpc.issue.labels.bulkAdd.mutationOptions({
			onSuccess: invalidate,
		}),
	);

	const deleteLabels = useMutation(
		orpc.issue.labels.bulkDelete.mutationOptions({
			onSuccess: invalidate,
		}),
	);

	return (
		<div className="container mx-auto max-w-3xl py-8">
			<IssueDetail
				issue={issue.data}
				statuses={statuses.data}
				priorities={priorities.data}
				labels={labels.data}
				teamMembers={teamMembers.data}
				workspaceId={workspaceId}
				onUpdate={onUpdate.mutateAsync}
				updateIssuePriority={updateIssuePriority.mutateAsync}
				updateIssueAssignee={updateIssueAssignee.mutateAsync}
				addLabels={addLabels.mutateAsync}
				deleteLabels={deleteLabels.mutateAsync}
			/>
		</div>
	);
}
