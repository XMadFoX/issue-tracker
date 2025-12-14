import type { Outputs } from "@prism/api/src/router";

import {
	Sidebar,
	SidebarContent,
	SidebarGroup,
	SidebarGroupContent,
	SidebarGroupLabel,
	SidebarHeader,
	SidebarMenu,
	SidebarMenuButton,
	SidebarMenuItem,
	SidebarProvider,
} from "@prism/ui/components/sidebar";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link, Outlet } from "@tanstack/react-router";
import { Contact } from "lucide-react";
import { orpc } from "src/orpc/client";

export const Route = createFileRoute("/workspace/$slug")({
	component: WorkspaceLayout,
});

function WorkspaceLayout() {
	const { slug } = Route.useParams();
	const workspace = useQuery(
		orpc.workspace.getBySlug.queryOptions({ input: { slug } }),
	);

	return (
		<div>
			<SidebarProvider defaultOpen={true}>
				<WorkspaceSidebar workspace={workspace.data} />
				<Outlet />
			</SidebarProvider>
		</div>
	);
}

export function WorkspaceSidebar({
	workspace,
}: {
	workspace: undefined | Outputs["workspace"]["getBySlug"];
}) {
	const teams = useQuery(
		orpc.team.listByWorkspace.queryOptions({
			input: { id: workspace?.id ?? "" },
			enabled: !!workspace?.id,
		}),
	);

	return (
		<Sidebar>
			<SidebarHeader>{workspace?.name || "Loading..."}</SidebarHeader>
			<SidebarContent>
				<SidebarGroup>
					<SidebarGroupLabel>Teams</SidebarGroupLabel>
					<SidebarGroupContent>
						<SidebarMenu>
							{teams?.data?.map((team) => (
								<SidebarMenuItem key={team.name}>
									<SidebarMenuButton asChild>
										<Link
											to={`/workspace/$slug/teams/$teamSlug`}
											params={{
												slug: workspace?.slug ?? "",
												teamSlug: team.key ?? "",
											}}
										>
											<Contact />
											<span>{team.name}</span>
										</Link>
									</SidebarMenuButton>
								</SidebarMenuItem>
							))}
						</SidebarMenu>
					</SidebarGroupContent>
				</SidebarGroup>
			</SidebarContent>
		</Sidebar>
	);
}
