import type { Outputs } from "@prism/api/src/router";
import { DeleteWorkspaceCard } from "../components/delete-workspace-card";

type Workspace = Outputs["workspace"]["getBySlug"];

type WorkspaceSettingsViewProps = {
	workspace: Workspace;
	isDeleting?: boolean;
	onDeleteWorkspace: (confirmationSlug: string) => void | Promise<void>;
};

export function WorkspaceSettingsView({
	workspace,
	isDeleting = false,
	onDeleteWorkspace,
}: WorkspaceSettingsViewProps) {
	return (
		<div className="w-full max-w-4xl space-y-8">
			<div className="space-y-2">
				<h1 className="text-2xl font-semibold tracking-tight">
					Workspace settings
				</h1>
				<p className="text-sm text-muted-foreground">
					Manage general settings for {workspace.name}.
				</p>
			</div>

			<section className="space-y-3">
				<div>
					<h2 className="text-sm font-medium text-destructive">Danger zone</h2>
					<p className="text-sm text-muted-foreground">
						Destructive actions for this workspace.
					</p>
				</div>
				<DeleteWorkspaceCard
					workspace={workspace}
					isDeleting={isDeleting}
					onDelete={onDeleteWorkspace}
				/>
			</section>
		</div>
	);
}
