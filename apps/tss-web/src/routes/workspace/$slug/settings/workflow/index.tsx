import type { Inputs } from "@prism/api/src/router";
import {
	type IssueStatusCreateDraft,
	IssueStatusesView,
	type IssueStatusGroupCreateDraft,
	type SubmitResult,
	type WorkflowScopeValue,
} from "@prism/blocks/src/features/issue-statuses";
import {
	useMutation,
	useQuery,
	useQueryClient,
	useSuspenseQuery,
} from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { orpc } from "src/orpc/client";

export const Route = createFileRoute("/workspace/$slug/settings/workflow/")({
	component: RouteComponent,
});

function getNextOrderIndex(items: Array<{ orderIndex: number }>) {
	return (
		items.reduce(
			(max, item) => (item.orderIndex > max ? item.orderIndex : max),
			-1,
		) + 1
	);
}

function createGroupKey(name: string, existingKeys: string[]) {
	const base =
		name
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, "-")
			.replace(/^-+|-+$/g, "") || "group";
	let key = base;
	let index = 2;
	while (existingKeys.includes(key)) {
		key = `${base}-${index}`;
		index += 1;
	}
	return key;
}

function RouteComponent() {
	const { slug } = Route.useParams();
	const queryClient = useQueryClient();
	const [scope, setScope] = useState<WorkflowScopeValue>({ kind: "workspace" });
	const workspace = useSuspenseQuery(
		orpc.workspace.getBySlug.queryOptions({ input: { slug } }),
	);
	const workspaceId = workspace.data.id;
	const groups = useQuery(
		orpc.issue.status.group.list.queryOptions({ input: { id: workspaceId } }),
	);
	const statuses = useQuery(
		orpc.issue.status.list.queryOptions({ input: { id: workspaceId } }),
	);
	const teams = useQuery(
		orpc.team.listByWorkspace.queryOptions({ input: { id: workspaceId } }),
	);

	const createStatus = useMutation(
		orpc.issue.status.create.mutationOptions({}),
	);
	const updateStatus = useMutation(
		orpc.issue.status.update.mutationOptions({}),
	);
	const deleteStatus = useMutation(
		orpc.issue.status.delete.mutationOptions({}),
	);
	const reorderStatus = useMutation(
		orpc.issue.status.reorder.mutationOptions({}),
	);
	const createGroup = useMutation(
		orpc.issue.status.group.create.mutationOptions({}),
	);
	const updateGroup = useMutation(
		orpc.issue.status.group.update.mutationOptions({}),
	);
	const deleteGroup = useMutation(
		orpc.issue.status.group.delete.mutationOptions({}),
	);
	const reorderGroup = useMutation(
		orpc.issue.status.group.reorder.mutationOptions({}),
	);

	const refreshWorkflow = async () => {
		await Promise.all([
			queryClient.invalidateQueries({
				queryKey: orpc.issue.status.list.queryKey({
					input: { id: workspaceId },
				}),
			}),
			queryClient.invalidateQueries({
				queryKey: orpc.issue.status.group.list.queryKey({
					input: { id: workspaceId },
				}),
			}),
		]);
	};
	const rejectTeamScope = () => {
		if (scope.kind === "workspace") return false;
		toast.error("Team workflow customization is read-only in this version");
		return true;
	};
	const handleCreateStatus = async (
		input: IssueStatusCreateDraft,
	): Promise<SubmitResult> => {
		if (rejectTeamScope())
			return { error: new Error("Team scope is read-only") };
		const workspaceStatuses = (statuses.data ?? []).filter(
			(status) => status.teamId === null,
		);
		if (
			workspaceStatuses.some(
				(status) =>
					status.name.trim().toLowerCase() === input.name.trim().toLowerCase(),
			)
		) {
			return { error: new Error("A status with this name already exists") };
		}
		try {
			const groupStatuses = workspaceStatuses.filter(
				(status) => status.statusGroupId === input.statusGroupId,
			);
			await createStatus.mutateAsync({
				...input,
				workspaceId,
				teamId: null,
				orderIndex: getNextOrderIndex(groupStatuses),
			});
			await refreshWorkflow();
			toast.success("Status created");
			return { success: true };
		} catch (error) {
			await refreshWorkflow();
			toast.error(
				error instanceof Error ? error.message : "Failed to create status",
			);
			return { error };
		}
	};
	const handleUpdateStatus = async (
		input: Inputs["issue"]["status"]["update"],
	): Promise<SubmitResult> => {
		if (rejectTeamScope())
			return { error: new Error("Team scope is read-only") };
		const updatedName = input.name?.trim().toLowerCase();
		if (updatedName) {
			const workspaceStatuses = (statuses.data ?? []).filter(
				(status) => status.teamId === null,
			);
			if (
				workspaceStatuses.some(
					(status) =>
						status.id !== input.id &&
						status.name.trim().toLowerCase() === updatedName,
				)
			) {
				return { error: new Error("A status with this name already exists") };
			}
		}
		try {
			await updateStatus.mutateAsync(input);
			await refreshWorkflow();
			toast.success("Status updated");
			return { success: true };
		} catch (error) {
			await refreshWorkflow();
			toast.error(
				error instanceof Error ? error.message : "Failed to update status",
			);
			return { error };
		}
	};
	const handleDeleteStatus = async (
		input: Inputs["issue"]["status"]["delete"],
	): Promise<SubmitResult> => {
		if (rejectTeamScope())
			return { error: new Error("Team scope is read-only") };
		try {
			const deleted = await deleteStatus.mutateAsync(input);
			await refreshWorkflow();
			if (!deleted) return { error: new Error("Status not found") };
			toast.success("Status deleted");
			return { success: true };
		} catch (error) {
			await refreshWorkflow();
			toast.error(
				error instanceof Error ? error.message : "Failed to delete status",
			);
			return { error };
		}
	};
	const handleReorderStatuses = async (
		input: Inputs["issue"]["status"]["reorder"],
	) => {
		if (rejectTeamScope()) return;
		try {
			await reorderStatus.mutateAsync(input);
			await refreshWorkflow();
		} catch (error) {
			await refreshWorkflow();
			toast.error(
				error instanceof Error ? error.message : "Failed to reorder statuses",
			);
		}
	};
	const handleCreateGroup = async (
		input: IssueStatusGroupCreateDraft,
	): Promise<SubmitResult> => {
		if (rejectTeamScope())
			return { error: new Error("Team scope is read-only") };
		try {
			await createGroup.mutateAsync({
				...input,
				workspaceId,
				key: createGroupKey(
					input.name,
					(groups.data ?? []).map((group) => group.key),
				),
				orderIndex: getNextOrderIndex(groups.data ?? []),
				isEditable: true,
			});
			await refreshWorkflow();
			toast.success("Group created");
			return { success: true };
		} catch (error) {
			await refreshWorkflow();
			toast.error(
				error instanceof Error ? error.message : "Failed to create group",
			);
			return { error };
		}
	};
	const handleUpdateGroup = async (
		input: Inputs["issue"]["status"]["group"]["update"],
	): Promise<SubmitResult> => {
		if (rejectTeamScope())
			return { error: new Error("Team scope is read-only") };
		try {
			const updated = await updateGroup.mutateAsync(input);
			await refreshWorkflow();
			if (!updated) return { error: new Error("This group cannot be updated") };
			toast.success("Group updated");
			return { success: true };
		} catch (error) {
			await refreshWorkflow();
			toast.error(
				error instanceof Error ? error.message : "Failed to update group",
			);
			return { error };
		}
	};
	const handleDeleteGroup = async (
		input: Inputs["issue"]["status"]["group"]["delete"],
	): Promise<SubmitResult> => {
		if (rejectTeamScope())
			return { error: new Error("Team scope is read-only") };
		try {
			const deleted = await deleteGroup.mutateAsync(input);
			await refreshWorkflow();
			if (!deleted) return { error: new Error("Group not found") };
			toast.success("Group deleted");
			return { success: true };
		} catch (error) {
			await refreshWorkflow();
			toast.error(
				error instanceof Error ? error.message : "Failed to delete group",
			);
			return { error };
		}
	};
	const handleReorderGroups = async (
		input: Inputs["issue"]["status"]["group"]["reorder"],
	) => {
		if (rejectTeamScope()) return;
		try {
			await reorderGroup.mutateAsync(input);
			await refreshWorkflow();
		} catch (error) {
			await refreshWorkflow();
			toast.error(
				error instanceof Error ? error.message : "Failed to reorder groups",
			);
		}
	};
	const visibleStatuses = (statuses.data ?? []).filter((status) =>
		scope.kind === "workspace"
			? status.teamId === null
			: status.teamId === null || status.teamId === scope.teamId,
	);
	return (
		<IssueStatusesView
			workspaceId={workspaceId}
			teams={teams.data ?? []}
			scope={scope}
			groups={groups.data ?? []}
			statuses={visibleStatuses}
			isLoading={groups.isPending || statuses.isPending || teams.isPending}
			isDeletingStatus={deleteStatus.isPending}
			isDeletingGroup={deleteGroup.isPending}
			onScopeChange={setScope}
			onCreateStatus={handleCreateStatus}
			onUpdateStatus={handleUpdateStatus}
			onDeleteStatus={handleDeleteStatus}
			onReorderStatuses={handleReorderStatuses}
			onCreateGroup={handleCreateGroup}
			onUpdateGroup={handleUpdateGroup}
			onDeleteGroup={handleDeleteGroup}
			onReorderGroups={handleReorderGroups}
		/>
	);
}
