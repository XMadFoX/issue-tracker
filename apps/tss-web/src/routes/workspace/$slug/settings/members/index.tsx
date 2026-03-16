import { WorkspaceMembersView } from "@prism/blocks/src/features/workspace-members";
import {
	useMutation,
	useQuery,
	useQueryClient,
	useSuspenseQuery,
} from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import type { ComponentProps } from "react";
import { useMemo } from "react";
import { toast } from "sonner";
import { orpc } from "src/orpc/client";

export const Route = createFileRoute("/workspace/$slug/settings/members/")({
	component: RouteComponent,
});

type WorkspaceMember = ComponentProps<
	typeof WorkspaceMembersView
>["members"][number];

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

function getNestedRecord(
	value: Record<string, unknown>,
	keys: string[],
): Record<string, unknown> | null {
	for (const key of keys) {
		const candidate = value[key];

		if (isRecord(candidate)) {
			return candidate;
		}
	}

	return null;
}

function getString(
	value: Record<string, unknown> | null,
	key: string,
): string | null {
	if (!value) {
		return null;
	}

	const candidate = value[key];

	return typeof candidate === "string" ? candidate : null;
}

function normalizeMembers(rows: unknown[] | undefined): WorkspaceMember[] {
	if (!rows) {
		return [];
	}

	return rows.flatMap((row) => {
		if (!isRecord(row)) {
			return [];
		}

		const membership =
			getNestedRecord(row, ["workspaceMembership", "workspace_membership"]) ??
			row;
		const memberUser = getNestedRecord(row, ["user"]);
		const role =
			getNestedRecord(row, ["roleDefinitions", "role_definitions", "role"]) ??
			row;

		const membershipId =
			getString(membership, "id") ?? getString(row, "membershipId");
		const membershipStatus = getString(membership, "status");
		const userId = getString(memberUser, "id") ?? getString(row, "userId");
		const userName = getString(memberUser, "name") ?? "";
		const userEmail = getString(memberUser, "email") ?? "";
		const roleId = getString(role, "id") ?? getString(row, "roleId");
		const roleName = getString(role, "name") ?? "";

		if (
			!membershipId ||
			!membershipStatus ||
			!userId ||
			!userEmail ||
			!roleId
		) {
			return [];
		}

		return [
			{
				workspaceMembership: {
					id: membershipId,
					status: membershipStatus,
				},
				user: {
					id: userId,
					name: userName,
					email: userEmail,
				},
				roleDefinitions: {
					id: roleId,
					name: roleName,
				},
			},
		];
	});
}

function RouteComponent() {
	const { slug } = Route.useParams();
	const queryClient = useQueryClient();

	const workspace = useSuspenseQuery(
		orpc.workspace.getBySlug.queryOptions({ input: { slug } }),
	);

	const memberships = useQuery(
		orpc.workspaceMembership.list.queryOptions({
			input: { workspaceId: workspace.data.id },
		}),
	);
	const roles = useQuery(
		orpc.role.list.queryOptions({
			input: { workspaceId: workspace.data.id },
		}),
	);
	const teams = useQuery(
		orpc.team.listByWorkspace.queryOptions({
			input: { id: workspace.data.id },
		}),
	);
	const invitations = useQuery(
		orpc.workspaceInvitation.list.queryOptions({
			input: { workspaceId: workspace.data.id },
		}),
	);
	const members = useMemo(
		() => normalizeMembers(memberships.data),
		[memberships.data],
	);

	const createInvitation = useMutation(
		orpc.workspaceInvitation.create.mutationOptions(),
	);
	const revokeInvitation = useMutation(
		orpc.workspaceInvitation.revoke.mutationOptions(),
	);
	const updateMembership = useMutation(
		orpc.workspaceMembership.update.mutationOptions(),
	);
	const deleteMembership = useMutation(
		orpc.workspaceMembership.delete.mutationOptions(),
	);

	const refreshMembers = async () => {
		await queryClient.invalidateQueries({
			queryKey: orpc.workspaceMembership.list.queryKey({
				input: { workspaceId: workspace.data.id },
			}),
		});
	};

	const refreshInvitations = async () => {
		await queryClient.invalidateQueries({
			queryKey: orpc.workspaceInvitation.list.queryKey({
				input: { workspaceId: workspace.data.id },
			}),
		});
	};

	return (
		<div className="p-6 w-full">
			<WorkspaceMembersView
				roles={roles.data ?? []}
				teams={teams.data ?? []}
				members={members}
				invitations={invitations.data ?? []}
				isInviting={createInvitation.isPending}
				onInvite={async (input) => {
					try {
						const invitation = await createInvitation.mutateAsync({
							workspaceId: workspace.data.id,
							...input,
						});
						try {
							await navigator.clipboard.writeText(invitation.inviteUrl);
							toast.success("Invite link copied to clipboard");
						} catch {
							toast.success("Invitation created");
						}
						await refreshInvitations();
						return { success: true };
					} catch (error) {
						toast.error(
							error instanceof Error
								? error.message
								: "Failed to create invitation",
						);
						return { error };
					}
				}}
				onCopyInvite={async (invitation) => {
					try {
						const nextInvitation = await createInvitation.mutateAsync({
							workspaceId: workspace.data.id,
							email: invitation.email,
							roleId: invitation.roleId,
							teamIds: invitation.teams.map((team) => team.id),
						});
						await navigator.clipboard.writeText(nextInvitation.inviteUrl);
						toast.success("Invite link copied to clipboard");
						await refreshInvitations();
					} catch (error) {
						toast.error(
							error instanceof Error
								? error.message
								: "Failed to copy invitation link",
						);
					}
				}}
				onRevokeInvite={async (invitationId) => {
					try {
						await revokeInvitation.mutateAsync({
							id: invitationId,
							workspaceId: workspace.data.id,
						});
						toast.success("Invitation revoked");
						await refreshInvitations();
					} catch (error) {
						toast.error(
							error instanceof Error
								? error.message
								: "Failed to revoke invitation",
						);
					}
				}}
				onChangeRole={async ({ membershipId, roleId }) => {
					try {
						await updateMembership.mutateAsync({
							id: membershipId,
							workspaceId: workspace.data.id,
							roleId,
						});
						toast.success("Member role updated");
						await refreshMembers();
					} catch (error) {
						toast.error(
							error instanceof Error
								? error.message
								: "Failed to update member role",
						);
					}
				}}
				onKickMember={async (membershipId) => {
					try {
						await deleteMembership.mutateAsync({
							id: membershipId,
							workspaceId: workspace.data.id,
						});
						toast.success("Member removed");
						await refreshMembers();
					} catch (error) {
						toast.error(
							error instanceof Error
								? error.message
								: "Failed to remove member",
						);
					}
				}}
			/>
		</div>
	);
}
