import { createFileRoute } from "@tanstack/react-router";
import AuthForm, { modeSchema } from "src/sections/auth/auth";
import z from "zod";

const searchParamsSchema = z.object({
	initialMode: modeSchema.default("signin"),
});

export const Route = createFileRoute("/auth")({
	component: RouteComponent,
	validateSearch: searchParamsSchema,
});

function RouteComponent() {
	const { initialMode } = Route.useSearch();

	return (
		<div>
			<AuthForm initialMode={initialMode} />
		</div>
	);
}
