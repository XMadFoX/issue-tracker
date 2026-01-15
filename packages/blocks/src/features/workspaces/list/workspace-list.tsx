import type { Outputs } from "@prism/api/src/router";
import {
	Avatar,
	AvatarFallback,
	AvatarImage,
} from "@prism/ui/components/avatar";
import { Badge } from "@prism/ui/components/badge";
import { Button } from "@prism/ui/components/button";
import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
} from "@prism/ui/components/card";
import { Skeleton } from "@prism/ui/components/skeleton";
import { CalendarIcon, PlusIcon } from "lucide-react";
import type { ReactNode } from "react";

type WorkspaceItem = Outputs["workspace"]["list"][0];

interface WorkspaceListProps {
	isLoading: boolean;
	workspaces?: WorkspaceItem[];
	renderWorkspaceLink: (
		workspace: WorkspaceItem,
		children: ReactNode,
	) => ReactNode;
	renderCreateLink: (children: ReactNode) => ReactNode;
}

export function WorkspaceList({
	isLoading,
	workspaces,
	renderWorkspaceLink,
	renderCreateLink,
}: WorkspaceListProps) {
	if (isLoading && !workspaces) {
		return <WorkspaceListSkeleton />;
	}

	if (workspaces?.length === 0) {
		return <WorkspaceListEmpty renderCreateLink={renderCreateLink} />;
	}

	return (
		<div className="p-8 max-w-5xl mx-auto space-y-8">
			<div className="flex items-center justify-between">
				<h1 className="text-3xl font-bold tracking-tight">Your Workspaces</h1>
				<Button asChild>
					{renderCreateLink(
						<>
							<PlusIcon className="w-4 h-4 mr-2" />
							Create Workspace
						</>,
					)}
				</Button>
			</div>

			<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
				{workspaces?.map((workspace) =>
					renderWorkspaceLink(
						workspace,
						<WorkspaceCard workspace={workspace} />,
					),
				)}
			</div>
		</div>
	);
}

function WorkspaceListSkeleton() {
	return <div className="p-8 max-w-5xl mx-auto space-y-8">{/* TODO */}</div>;
}

function WorkspaceListEmpty({
	renderCreateLink,
}: {
	renderCreateLink: (children: ReactNode) => ReactNode;
}) {
	return (
		<div className="flex flex-col items-center justify-center min-h-[60vh] p-4 text-center">
			<div className="max-w-md space-y-6">
				<div className="bg-primary/5 p-6 rounded-full inline-flex">
					<PlusIcon className="w-12 h-12 text-primary" />
				</div>
				<h1 className="text-3xl font-bold tracking-tight">Welcome to Prism</h1>
				<p className="text-muted-foreground text-lg">
					You don't have any workspaces yet. Create one to get started with your
					team.
				</p>
				<Button asChild size="lg" className="mt-4">
					{renderCreateLink("Create Workspace")}
				</Button>
			</div>
		</div>
	);
}

function WorkspaceCard({ workspace }: { workspace: WorkspaceItem }) {
	return (
		<Card className="h-full transition-all duration-200 hover:shadow-md hover:border-primary/50">
			<CardHeader className="flex flex-row items-center gap-4 space-y-0 pb-2">
				<Avatar className="h-12 w-12 rounded-lg border">
					<AvatarImage
						src={`https://api.dicebear.com/9.x/initials/svg?seed=${workspace.name}`}
					/>
					<AvatarFallback className="rounded-lg">
						{workspace.name.substring(0, 2).toUpperCase()}
					</AvatarFallback>
				</Avatar>
				<div className="flex-1 min-w-0">
					<CardTitle className="truncate text-lg">{workspace.name}</CardTitle>
					<div className="flex items-center gap-2 mt-1">
						<Badge variant="secondary" className="text-xs font-normal">
							{workspace.roleName || "Member"}
						</Badge>
					</div>
				</div>
			</CardHeader>
			<CardContent>
				<div className="flex items-center text-sm text-muted-foreground mt-4">
					<CalendarIcon className="w-4 h-4 mr-2 opacity-70" />
					<span>
						Joined{" "}
						{new Date(
							workspace.joinedAt || workspace.createdAt || new Date(),
						).toLocaleDateString(undefined, {
							dateStyle: "medium",
						})}
					</span>
				</div>
			</CardContent>
		</Card>
	);
}
