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
		<div className="flex flex-col items-center justify-center max-w-md mx-auto">
			{workspaces.data ? (
				<div>
					<h1>Your workspaces</h1>
					<ul>
						{workspaces.data.map((workspace) => (
							<li key={workspace.id}>
								<Link to={`/workspace/${workspace.slug}`}>
									{workspace.name}
								</Link>
							</li>
						))}
					</ul>
				</div>
			) : (
				<>
					<p>You don't have any workspaces yet</p>
					<Link to="/workspace/create">Create</Link>
				</>
			)}
		</div>
	);
}
