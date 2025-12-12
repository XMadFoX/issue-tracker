import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/workspace/$slug/teams/")({
	component: RouteComponent,
});

function RouteComponent() {
	return <div>Hello "/workspace/$slug/teams/"!</div>;
}
