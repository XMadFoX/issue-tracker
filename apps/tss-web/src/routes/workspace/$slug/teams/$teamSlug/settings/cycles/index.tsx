import {
	type CycleSettings,
	type CycleSettingsDraft,
	type CycleSettingsSubmitResult,
	CycleSettingsView,
} from "@prism/blocks/src/features/cycle-settings";
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

export const Route = createFileRoute(
	"/workspace/$slug/teams/$teamSlug/settings/cycles/",
)({ component: RouteComponent });

function isSettingsChangedError(error: unknown): boolean {
	return (
		typeof error === "object" &&
		error !== null &&
		"code" in error &&
		error.code === "SETTINGS_CHANGED"
	);
}

export function RouteComponent() {
	const { slug, teamSlug } = Route.useParams();
	const queryClient = useQueryClient();
	const workspace = useSuspenseQuery(
		orpc.workspace.getBySlug.queryOptions({ input: { slug } }),
	);
	const team = useSuspenseQuery(
		orpc.team.getBySlug.queryOptions({
			input: { workspaceId: workspace.data.id, key: teamSlug },
		}),
	);
	const settings = useQuery(
		orpc.cycle.getSettings.queryOptions({
			input: { workspaceId: workspace.data.id, teamId: team.data.id },
		}),
	);
	const preview = useQuery({
		...orpc.cycle.getSchedulePreview.queryOptions({
			input: { workspaceId: workspace.data.id, teamId: team.data.id },
		}),
		enabled: settings.data !== undefined,
	});
	const updateSettings = useMutation(
		orpc.cycle.updateSettings.mutationOptions({}),
	);
	const [conflictCurrent, setConflictCurrent] = useState<CycleSettings>();
	const [conflictDraft, setConflictDraft] = useState<CycleSettingsDraft>();

	if (settings.isPending)
		return <output className="block p-6">Loading cycle settings…</output>;
	if (settings.isError)
		return (
			<div className="space-y-3 p-6" role="alert">
				<p>Unable to load cycle settings. Please try again.</p>
				<button
					type="button"
					className="underline"
					onClick={() => void settings.refetch()}
				>
					Retry
				</button>
			</div>
		);
	const settingsData = settings.data;
	if (!settingsData)
		return (
			<div className="p-6" role="alert">
				Cycle settings are unavailable.
			</div>
		);

	const submit = async (
		draft: CycleSettingsDraft,
		expectedUpdatedAt: string,
	) => {
		try {
			const result = await updateSettings.mutateAsync({
				workspaceId: workspace.data.id,
				teamId: team.data.id,
				expectedUpdatedAt,
				...draft,
			});
			await Promise.all([
				queryClient.invalidateQueries({
					queryKey: orpc.cycle.getSettings.queryKey({
						input: { workspaceId: workspace.data.id, teamId: team.data.id },
					}),
				}),
				queryClient.invalidateQueries({
					queryKey: orpc.cycle.getSchedulePreview.queryKey({
						input: { workspaceId: workspace.data.id, teamId: team.data.id },
					}),
				}),
				queryClient.invalidateQueries({
					queryKey: orpc.team.listByWorkspace.queryKey({
						input: { id: workspace.data.id },
					}),
				}),
				queryClient.invalidateQueries({
					queryKey: orpc.team.getBySlug.queryKey({
						input: { workspaceId: workspace.data.id, key: teamSlug },
					}),
				}),
				queryClient.invalidateQueries({
					queryKey: orpc.cycle.list.queryKey({
						input: { workspaceId: workspace.data.id, teamId: team.data.id },
					}),
				}),
				queryClient.invalidateQueries({
					queryKey: orpc.cycle.listPendingActions.queryKey({
						input: { workspaceId: workspace.data.id, teamId: team.data.id },
					}),
				}),
				queryClient.invalidateQueries({
					queryKey: orpc.cycle.listNotifications.queryKey({
						input: {
							workspaceId: workspace.data.id,
							teamId: team.data.id,
							unreadOnly: true,
						},
					}),
				}),
			]);
			toast.success(
				result.unchanged
					? "Cycle settings already up to date"
					: "Cycle settings saved",
			);
			const successResult: CycleSettingsSubmitResult = {
				success: true,
				settings: result.settings,
			};
			return successResult;
		} catch (error) {
			if (isSettingsChangedError(error)) {
				setConflictDraft(draft);
				const refreshed = await settings.refetch();
				await preview.refetch();
				if (refreshed.data) setConflictCurrent(refreshed.data.settings);
				toast.error(
					"These settings changed in another session. Your draft is preserved.",
				);
			} else {
				toast.error(
					error instanceof Error
						? error.message
						: "Unable to save cycle settings.",
				);
			}
			return { error } as const;
		}
	};

	const reapplyDraft = async () => {
		if (!conflictCurrent || !conflictDraft) return;
		const result = await submit(
			conflictDraft,
			conflictCurrent.updatedAt.toISOString(),
		);
		if (!("error" in result)) {
			setConflictCurrent(undefined);
			setConflictDraft(undefined);
		}
	};

	return (
		<main className="w-full p-6">
			<div className="mx-auto max-w-3xl space-y-4">
				<div>
					<a
						className="text-sm text-muted-foreground underline underline-offset-4"
						href={`/workspace/${slug}/teams`}
					>
						← Teams
					</a>
					<h1 className="mt-2 text-2xl font-bold">
						{team.data.name} cycle settings
					</h1>
				</div>
				<CycleSettingsView
					settings={settingsData.settings}
					workspaceTimezone={settingsData.workspaceTimezone}
					automationAvailable={settingsData.automationAvailable}
					canManageSettings={settingsData.canManageSettings}
					preview={preview.data}
					previewLoading={preview.isPending}
					previewError={preview.isError}
					onPreviewRetry={() => void preview.refetch()}
					conflictCurrent={conflictCurrent}
					onConflictClear={() => {
						setConflictCurrent(undefined);
						setConflictDraft(undefined);
					}}
					onConflictReapply={() => void reapplyDraft()}
					workspaceGeneralHref={`/workspace/${slug}/settings/general`}
					onSubmit={submit}
				/>
			</div>
		</main>
	);
}
