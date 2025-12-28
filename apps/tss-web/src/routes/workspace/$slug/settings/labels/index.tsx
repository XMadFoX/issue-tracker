import type { Inputs, Outputs } from "@prism/api/src/router";
import {
	LabelList,
	type ScopeSelectorValue,
} from "@prism/blocks/src/features/labels/label-list";
import { useDebouncedCallback } from "@tanstack/react-pacer";
import {
	useMutation,
	useQuery,
	useQueryClient,
	useSuspenseQuery,
} from "@tanstack/react-query";

import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useMemo, useState } from "react";
import { orpc } from "src/orpc/client";

export const Route = createFileRoute("/workspace/$slug/settings/labels/")({
	component: RouteComponent,
});

type LabelListInput = Inputs["label"]["list"];

function RouteComponent() {
	const { slug } = Route.useParams();

	const workspace = useSuspenseQuery(
		orpc.workspace.getBySlug.queryOptions({ input: { slug: slug } }),
	);
	const [labelListInput, setLabelListInput] = useState<LabelListInput>({
		workspaceId: workspace.data.id,
		scope: "all",
	});

	const labels = useQuery(
		orpc.label.list.queryOptions({
			input: labelListInput,
		}),
	);

	const queryClient = useQueryClient();
	const updateLabel = useMutation(orpc.label.update.mutationOptions({}));

	const debouncedUpdateLabel = useDebouncedCallback(
		async (input: Inputs["label"]["update"]) => {
			await updateLabel.mutateAsync(input);
		},
		{ wait: 300 },
	);

	const handleUpdateLabel = useCallback(
		async (input: Inputs["label"]["update"]) => {
			const previousLabels = queryClient.getQueryData<Outputs["label"]["list"]>(
				orpc.label.list.queryKey({ input: labelListInput }),
			);

			queryClient.setQueryData<Outputs["label"]["list"]>(
				orpc.label.list.queryKey({ input: labelListInput }),
				(old) =>
					old?.map((label) =>
						label.id === input.id
							? {
									...label,
									color: input.color ?? label.color,
									name: input.name ?? label.name,
									description: input.description ?? label.description,
								}
							: label,
					),
			);

			try {
				debouncedUpdateLabel(input);
			} catch (error) {
				queryClient.setQueryData(
					orpc.label.list.queryKey({ input: labelListInput }),
					previousLabels,
				);
				throw error;
			}
		},
		[debouncedUpdateLabel, labelListInput, queryClient],
	);

	const teams = useQuery(
		orpc.team.listByWorkspace.queryOptions({
			input: { id: workspace.data.id },
		}),
	);

	const handleScopeChange = (value: ScopeSelectorValue) => {
		if (value === "workspace") {
			setLabelListInput({ workspaceId: workspace.data.id, scope: "workspace" });
		} else if (value === "all") {
			setLabelListInput({ workspaceId: workspace.data.id, scope: "all" });
		} else {
			setLabelListInput({
				workspaceId: workspace.data.id,
				scope: "team",
				teamId: value,
			});
		}
	};

	const currentScopeValue = useMemo(() => {
		if (labelListInput.scope === "team") {
			return labelListInput.teamId;
		}
		return labelListInput.scope;
	}, [labelListInput]);

	return (
		<div className="p-6 w-full">
			<LabelList
				labels={labels.data ?? []}
				teams={teams.data ?? []}
				onScopeChange={handleScopeChange}
				currentScopeValue={currentScopeValue}
				updateLabel={handleUpdateLabel}
			/>
		</div>
	);
}
