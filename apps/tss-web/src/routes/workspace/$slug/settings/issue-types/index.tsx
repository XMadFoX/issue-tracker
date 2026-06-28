import {
	type IssueType,
	type IssueTypeArchiveInput,
	type IssueTypeCreateDraft,
	type IssueTypeHideForTeamInput,
	type IssueTypeReassignAndArchiveInput,
	type IssueTypeReorderInput,
	type IssueTypeReplaceForTeamInput,
	type IssueTypeRestoreForTeamInput,
	type IssueTypeScopeValue,
	type IssueTypeSetDefaultInput,
	IssueTypesView,
	type IssueTypeUpdateInput,
	type SubmitResult,
} from "@prism/blocks/src/features/issue-types";
import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { orpc } from "src/orpc/client";
import {
	issueQueries,
	useIssueTypeMutations,
} from "@/features/issues/issues-feature";

export const Route = createFileRoute("/workspace/$slug/settings/issue-types/")({
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

function createIssueTypeKey(name: string, existingKeys: string[]) {
	const base =
		name
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, "-")
			.replace(/^-+|-+$/g, "") || "type";
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
	const [scope, setScope] = useState<IssueTypeScopeValue>({
		kind: "workspace",
	});

	const workspace = useSuspenseQuery(issueQueries.workspaceBySlug(slug));
	const workspaceId = workspace.data.id;
	const scopeTeamId = scope.kind === "team" ? scope.teamId : null;

	const teams = useQuery(
		orpc.team.listByWorkspace.queryOptions({ input: { id: workspaceId } }),
	);
	const workspaceTypes = useQuery(issueQueries.issueTypes({ workspaceId }));
	const teamTypes = useQuery({
		...issueQueries.issueTypes({
			workspaceId,
			teamId: scopeTeamId ?? undefined,
		}),
		enabled: scope.kind === "team",
	});

	const { issueTypeActions } = useIssueTypeMutations({
		workspaceId,
		teamId: scopeTeamId,
	});

	const workspaceTypeRows = workspaceTypes.data ?? [];
	const effectiveTypes =
		scope.kind === "team" ? (teamTypes.data ?? []) : workspaceTypeRows;

	const hiddenGlobalTypes: IssueType[] =
		scope.kind === "team"
			? workspaceTypeRows.filter(
					(global) =>
						global.teamId === null &&
						!effectiveTypes.some((type) => type.id === global.id),
				)
			: [];

	const handleCreateIssueType = async (
		draft: IssueTypeCreateDraft,
	): Promise<SubmitResult> => {
		try {
			const scopeRows = effectiveTypes.filter(
				(type) => type.teamId === (scopeTeamId ?? null),
			);
			await issueTypeActions.createIssueType({
				...draft,
				teamId: scopeTeamId,
				key: createIssueTypeKey(
					draft.name,
					scopeRows.map((type) => type.key),
				),
				orderIndex: getNextOrderIndex(scopeRows),
			});
			return { success: true };
		} catch (error) {
			return { error };
		}
	};

	const handleUpdateIssueType = async (input: IssueTypeUpdateInput) => {
		try {
			await issueTypeActions.updateIssueType(input);
		} catch {
			// errors surfaced via mutation notify
		}
	};

	const handleArchiveIssueType = async (
		input: IssueTypeArchiveInput,
	): Promise<SubmitResult> => {
		try {
			await issueTypeActions.archiveIssueType(input);
			return { success: true };
		} catch (error) {
			return { error };
		}
	};

	const handleReassignAndArchive = async (
		input: IssueTypeReassignAndArchiveInput,
	): Promise<SubmitResult> => {
		try {
			await issueTypeActions.reassignAndArchiveIssueType(input);
			return { success: true };
		} catch (error) {
			return { error };
		}
	};

	const handleReorderIssueTypes = async (input: IssueTypeReorderInput) => {
		try {
			await issueTypeActions.reorderIssueTypes(input);
		} catch {
			// errors surfaced via mutation notify
		}
	};

	const handleSetDefault = async (input: IssueTypeSetDefaultInput) => {
		try {
			await issueTypeActions.setDefaultIssueType(input);
		} catch {
			// errors surfaced via mutation notify
		}
	};

	const handleHideForTeam = async (input: IssueTypeHideForTeamInput) => {
		try {
			await issueTypeActions.hideIssueTypeForTeam(input);
		} catch {
			// errors surfaced via mutation notify
		}
	};

	const handleReplaceForTeam = async (input: IssueTypeReplaceForTeamInput) => {
		try {
			await issueTypeActions.replaceIssueTypeForTeam(input);
		} catch {
			// errors surfaced via mutation notify
		}
	};

	const handleRestoreForTeam = async (input: IssueTypeRestoreForTeamInput) => {
		try {
			await issueTypeActions.restoreIssueTypeForTeam(input);
		} catch {
			// errors surfaced via mutation notify
		}
	};

	return (
		<IssueTypesView
			workspaceId={workspaceId}
			teams={teams.data ?? []}
			scope={scope}
			issueTypes={effectiveTypes}
			hiddenGlobalTypes={hiddenGlobalTypes}
			onScopeChange={setScope}
			onCreateIssueType={handleCreateIssueType}
			onUpdateIssueType={handleUpdateIssueType}
			onArchiveIssueType={handleArchiveIssueType}
			onReassignAndArchive={handleReassignAndArchive}
			onReorderIssueTypes={handleReorderIssueTypes}
			onSetDefault={handleSetDefault}
			onHideForTeam={handleHideForTeam}
			onReplaceForTeam={handleReplaceForTeam}
			onRestoreForTeam={handleRestoreForTeam}
		/>
	);
}
