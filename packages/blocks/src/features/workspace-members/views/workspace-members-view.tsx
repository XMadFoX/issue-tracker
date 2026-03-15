import { Badge } from "@prism/ui/components/badge";
import { Button } from "@prism/ui/components/button";
import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
} from "@prism/ui/components/card";
import { Checkbox } from "@prism/ui/components/checkbox";
import { Input } from "@prism/ui/components/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@prism/ui/components/select";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@prism/ui/components/table";
import { useEffect, useMemo, useState } from "react";

type WorkspaceMember = {
	workspaceMembership: {
		id: string;
		status: string;
	};
	user: {
		id: string;
		name: string;
		email: string;
	};
	roleDefinitions: {
		id: string;
		name: string;
	};
};

type WorkspaceRole = {
	id: string;
	name: string;
};

type WorkspaceTeam = {
	id: string;
	name: string;
	key: string;
};

type WorkspaceInvitation = {
	id: string;
	email: string;
	roleId: string;
	roleName: string;
	status: string;
	expiresAt: Date;
	createdAt: Date;
	teams: {
		id: string;
		name: string;
		key: string;
	}[];
};

type InviteInput = {
	email: string;
	roleId: string;
	teamIds: string[];
};

type SubmitResult = { success: true } | { error: unknown };

type Props = {
	roles: WorkspaceRole[];
	teams: WorkspaceTeam[];
	members: WorkspaceMember[];
	invitations: WorkspaceInvitation[];
	onInvite: (input: InviteInput) => Promise<SubmitResult>;
	onCopyInvite: (invitation: WorkspaceInvitation) => Promise<void>;
	onRevokeInvite: (invitationId: string) => Promise<void>;
	onChangeRole: (input: {
		membershipId: string;
		roleId: string;
	}) => Promise<void>;
	onKickMember: (membershipId: string) => Promise<void>;
	isInviting?: boolean;
};

export function WorkspaceMembersView({
	roles,
	teams,
	members,
	invitations,
	onInvite,
	onCopyInvite,
	onRevokeInvite,
	onChangeRole,
	onKickMember,
	isInviting = false,
}: Props) {
	const [email, setEmail] = useState("");
	const [roleId, setRoleId] = useState<string | null>(roles[0]?.id ?? null);
	const [selectedTeamIds, setSelectedTeamIds] = useState<string[]>([]);

	useEffect(() => {
		const nextDefaultRoleId = roles[0]?.id ?? null;
		const hasSelectedRole =
			roleId !== null && roles.some((role) => role.id === roleId);

		if (!hasSelectedRole && roleId !== nextDefaultRoleId) {
			setRoleId(nextDefaultRoleId);
		}
	}, [roleId, roles]);

	const sortedRoles = useMemo(
		() => [...roles].sort((left, right) => left.name.localeCompare(right.name)),
		[roles],
	);

	const canSubmitInvite =
		email.trim().length > 0 && roleId !== null && selectedTeamIds.length > 0;

	const handleInviteRoleChange = (nextRoleId: string | null) => {
		setRoleId(nextRoleId);
	};

	const handleInvite = async () => {
		if (roleId === null) {
			return;
		}

		const result = await onInvite({
			email,
			roleId,
			teamIds: selectedTeamIds,
		});

		if ("error" in result) {
			return;
		}

		setEmail("");
		setSelectedTeamIds([]);
	};

	const handleMemberRoleChange = (
		membershipId: string,
		currentRoleId: string,
		nextRoleId: string | null,
	) => {
		if (nextRoleId === null || nextRoleId === currentRoleId) {
			return;
		}

		void onChangeRole({
			membershipId,
			roleId: nextRoleId,
		});
	};

	return (
		<div className="space-y-6 w-full">
			<Card>
				<CardHeader>
					<CardTitle>Invite Member</CardTitle>
				</CardHeader>
				<CardContent className="space-y-4">
					<div className="grid gap-4 md:grid-cols-2">
						<div className="space-y-2">
							<label className="text-sm font-medium" htmlFor="invite-email">
								Email
							</label>
							<Input
								id="invite-email"
								type="email"
								value={email}
								onChange={(event) => setEmail(event.target.value)}
								placeholder="name@example.com"
							/>
						</div>
						<div className="space-y-2">
							<label className="text-sm font-medium" htmlFor="invite-role">
								Workspace role
							</label>
							<Select value={roleId} onValueChange={handleInviteRoleChange}>
								<SelectTrigger id="invite-role" className="w-full">
									<SelectValue placeholder="Select role" />
								</SelectTrigger>
								<SelectContent>
									{sortedRoles.map((role) => (
										<SelectItem key={role.id} value={role.id}>
											{role.name}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>
					</div>

					<div className="space-y-2">
						<div className="text-sm font-medium">Teams</div>
						<div className="grid gap-2 md:grid-cols-2">
							{teams.map((team) => {
								const isChecked = selectedTeamIds.includes(team.id);

								return (
									<div
										key={team.id}
										className="flex items-center gap-3 rounded-md border px-3 py-2"
									>
										<Checkbox
											checked={isChecked}
											onCheckedChange={(checked) => {
												setSelectedTeamIds((currentIds) => {
													if (checked === true) {
														if (currentIds.includes(team.id)) {
															return currentIds;
														}

														return [...currentIds, team.id];
													}

													return currentIds.filter(
														(currentId) => currentId !== team.id,
													);
												});
											}}
										/>
										<div className="flex flex-col">
											<span className="text-sm font-medium">{team.name}</span>
											<span className="text-xs text-muted-foreground">
												{team.key}
											</span>
										</div>
									</div>
								);
							})}
						</div>
					</div>

					<Button
						type="button"
						disabled={!canSubmitInvite || isInviting}
						onClick={handleInvite}
					>
						{isInviting ? "Creating invite..." : "Create invite"}
					</Button>
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle>Pending Invitations</CardTitle>
				</CardHeader>
				<CardContent>
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead>Email</TableHead>
								<TableHead>Role</TableHead>
								<TableHead>Teams</TableHead>
								<TableHead>Expires</TableHead>
								<TableHead className="text-right">Actions</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{invitations.length > 0 ? (
								invitations.map((invitation) => (
									<TableRow key={invitation.id}>
										<TableCell>{invitation.email}</TableCell>
										<TableCell>
											<Badge variant="secondary">{invitation.roleName}</Badge>
										</TableCell>
										<TableCell>
											<div className="flex flex-wrap gap-1">
												{invitation.teams.map((team) => (
													<Badge key={team.id} variant="outline">
														{team.name}
													</Badge>
												))}
											</div>
										</TableCell>
										<TableCell>
											{new Date(invitation.expiresAt).toLocaleDateString()}
										</TableCell>
										<TableCell className="text-right">
											<Button
												type="button"
												variant="ghost"
												onClick={() => onCopyInvite(invitation)}
											>
												Copy link
											</Button>
											<Button
												type="button"
												variant="ghost"
												onClick={() => onRevokeInvite(invitation.id)}
											>
												Revoke
											</Button>
										</TableCell>
									</TableRow>
								))
							) : (
								<TableRow>
									<TableCell colSpan={5} className="h-24 text-center">
										No pending invitations.
									</TableCell>
								</TableRow>
							)}
						</TableBody>
					</Table>
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle>Members</CardTitle>
				</CardHeader>
				<CardContent>
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead>Name</TableHead>
								<TableHead>Email</TableHead>
								<TableHead>Status</TableHead>
								<TableHead>Role</TableHead>
								<TableHead className="text-right">Actions</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{members.map((member) => (
								<TableRow key={member.workspaceMembership.id}>
									<TableCell>{member.user.name}</TableCell>
									<TableCell>{member.user.email}</TableCell>
									<TableCell>
										<Badge variant="outline">
											{member.workspaceMembership.status}
										</Badge>
									</TableCell>
									<TableCell>
										<Select
											value={member.roleDefinitions.id}
											onValueChange={(nextRoleId) =>
												handleMemberRoleChange(
													member.workspaceMembership.id,
													member.roleDefinitions.id,
													nextRoleId,
												)
											}
										>
											<SelectTrigger className="w-44">
												<SelectValue />
											</SelectTrigger>
											<SelectContent>
												{sortedRoles.map((role) => (
													<SelectItem key={role.id} value={role.id}>
														{role.name}
													</SelectItem>
												))}
											</SelectContent>
										</Select>
									</TableCell>
									<TableCell className="text-right">
										<Button
											type="button"
											variant="ghost"
											onClick={() =>
												onKickMember(member.workspaceMembership.id)
											}
										>
											Remove
										</Button>
									</TableCell>
								</TableRow>
							))}
						</TableBody>
					</Table>
				</CardContent>
			</Card>
		</div>
	);
}
