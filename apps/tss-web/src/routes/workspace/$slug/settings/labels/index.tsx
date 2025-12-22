import type { Inputs } from "@prism/api/src/router";
import {
	LabelList,
	type ScopeSelectorValue,
} from "@prism/blocks/src/features/labels/label-list";
import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
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
		scope: "workspace",
	});

	const labels = useQuery(
		orpc.label.list.queryOptions({
			input: labelListInput,
		}),
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
		<div className="p-6">
			<LabelList
				labels={labels.data ?? []}
				teams={teams.data ?? []}
				onScopeChange={handleScopeChange}
				currentScopeValue={currentScopeValue}
			/>
		</div>
	);
}
