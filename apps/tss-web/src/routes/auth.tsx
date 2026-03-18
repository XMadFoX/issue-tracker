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
		<div className="flex flex-col items-center justify-center max-w-md mx-auto my-auto">
			<AuthForm initialMode={initialMode} />
		</div>
	);
}
