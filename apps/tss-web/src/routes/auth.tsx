import { createFileRoute } from "@tanstack/react-router";
import AuthForm, { modeSchema } from "src/sections/auth/auth";
import z from "zod";

const searchParamsSchema = z.object({
	email: z.string().optional(),
	initialMode: modeSchema.default("signin"),
	inviteToken: z.string().optional(),
});

export const Route = createFileRoute("/auth")({
	component: RouteComponent,
	validateSearch: searchParamsSchema,
});

function RouteComponent() {
	const { email, initialMode, inviteToken } = Route.useSearch();

	return (
		<div className="flex flex-col items-center justify-center max-w-md mx-auto my-auto">
			<AuthForm
				initialEmail={email}
				initialMode={initialMode}
				inviteToken={inviteToken}
			/>
		</div>
	);
}
