import { Button } from "@prism/ui/components/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardFooter,
	CardHeader,
	CardTitle,
} from "@prism/ui/components/card";
import { useMutation, useQuery } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { useSession } from "src/lib/auth";
import { orpc } from "src/orpc/client";

export const Route = createFileRoute("/invite/$token")({
	component: RouteComponent,
});

function RouteComponent() {
	const { token } = Route.useParams();
	const session = useSession();
	const navigate = useNavigate();
	const invitation = useQuery(
		orpc.workspaceInvitation.getByToken.queryOptions({
			input: { token },
		}),
	);
	const acceptInvitation = useMutation(
		orpc.workspaceInvitation.accept.mutationOptions(),
	);

	if (invitation.isLoading || session.isPending) {
		return (
			<div className="flex min-h-[70vh] items-center justify-center px-4">
				<Card className="w-full max-w-xl">
					<CardHeader>
						<CardTitle>Loading invitation</CardTitle>
					</CardHeader>
				</Card>
			</div>
		);
	}

	if (invitation.isError || !invitation.data) {
		return (
			<div className="flex min-h-[70vh] items-center justify-center px-4">
				<Card className="w-full max-w-xl">
					<CardHeader>
						<CardTitle>Invitation not found</CardTitle>
						<CardDescription>
							This invite link is invalid or no longer available.
						</CardDescription>
					</CardHeader>
				</Card>
			</div>
		);
	}

	const signedInEmail = session.data?.user?.email?.toLowerCase();
	const invitationEmail = invitation.data.email.toLowerCase();
	const emailMatches = signedInEmail === invitationEmail;

	return (
		<div className="flex min-h-[70vh] items-center justify-center px-4 py-10">
			<Card className="w-full max-w-xl">
				<CardHeader>
					<CardTitle>Workspace invitation</CardTitle>
					<CardDescription>
						You were invited to join {invitation.data.workspace.name}.
					</CardDescription>
				</CardHeader>
				<CardContent className="space-y-4 text-sm">
					<div className="space-y-1">
						<div className="font-medium">Invited email</div>
						<div className="text-muted-foreground">{invitation.data.email}</div>
					</div>
					<div className="space-y-1">
						<div className="font-medium">Workspace role</div>
						<div className="text-muted-foreground">
							{invitation.data.role.name}
						</div>
					</div>
					<div className="space-y-1">
						<div className="font-medium">Teams</div>
						<div className="text-muted-foreground">
							{invitation.data.teams.map((team) => team.name).join(", ")}
						</div>
					</div>
					<div className="space-y-1">
						<div className="font-medium">Status</div>
						<div className="text-muted-foreground">
							{invitation.data.status}
						</div>
					</div>
				</CardContent>
				<CardFooter className="flex flex-wrap gap-2">
					{!session.data?.user ? (
						<Button asChild>
							<Link
								to="/auth"
								search={{
									email: invitation.data.email,
									initialMode: "signin",
									inviteToken: token,
								}}
							>
								Sign in to continue
							</Link>
						</Button>
					) : invitation.data.status !== "pending" ? (
						<Button asChild>
							<Link to="/">Go to workspaces</Link>
						</Button>
					) : !emailMatches ? (
						<div className="text-sm text-destructive">
							You are signed in as {session.data.user.email}. Use the invited
							account to accept this workspace invitation.
						</div>
					) : (
						<Button
							disabled={acceptInvitation.isPending}
							onClick={async () => {
								try {
									const result = await acceptInvitation.mutateAsync({ token });
									toast.success("Invitation accepted");
									navigate({
										to: "/workspace/$slug",
										params: { slug: result.workspaceSlug },
									});
								} catch (error) {
									toast.error(
										error instanceof Error
											? error.message
											: "Failed to accept invitation",
									);
								}
							}}
						>
							{acceptInvitation.isPending ? "Joining..." : "Accept invitation"}
						</Button>
					)}
				</CardFooter>
			</Card>
		</div>
	);
}
