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

	useEffect(() => {
		if (!session.isPending && !session.data?.user) {
			navigate({ to: "/auth" });
		}
	}, [session, navigate]);
}
