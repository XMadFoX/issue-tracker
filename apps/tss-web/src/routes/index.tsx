import { WorkspaceList } from "@prism/blocks/src/features/workspaces/list/workspace-list";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useSession } from "src/lib/auth";
import { orpc } from "src/orpc/client";

export const Route = createFileRoute("/")({
	component: RouteComponent,
});

function RouteComponent() {
	const session = useSession();
	const navigate = useNavigate();

	const workspaces = useQuery(orpc.workspace.list.queryOptions({ input: {} }));

	useEffect(() => {
		if (!session.isPending && !session.data?.user) {
			navigate({ to: "/auth" });
		}
	}, [session, navigate]);

	return (
		<WorkspaceList
			isLoading={session.isPending || workspaces.isLoading}
			workspaces={workspaces.data}
			renderWorkspaceLink={(workspace, children) => (
				<Link
					key={workspace.id}
					to={`/workspace/${workspace.slug}`}
					className="block group"
				>
					{children}
				</Link>
			)}
			renderCreateLink={(children) => (
				<Link to="/workspace/create">{children}</Link>
			)}
		/>
	);
}
