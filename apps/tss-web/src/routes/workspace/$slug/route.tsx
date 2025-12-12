import type { Outputs } from "@prism/api/src/router";

import {
	Sidebar,
	SidebarContent,
	SidebarGroup,
	SidebarGroupContent,
	SidebarGroupLabel,
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

const items = [
	{
		title: "Teams",
		url: "teams",
		icon: Contact,
	},
] as const;

export function WorkspaceSidebar({
	workspace,
}: {
	workspace: undefined | Outputs["workspace"]["getBySlug"];
}) {
	return (
		<Sidebar>
			<SidebarContent>
				<SidebarGroup>
					<SidebarGroupLabel>
						{workspace?.name || "Loading..."}
					</SidebarGroupLabel>
					<SidebarGroupContent>
						<SidebarMenu>
							{items.map((item) => (
								<SidebarMenuItem key={item.title}>
									<SidebarMenuButton asChild>
										<Link
											to={`/workspace/$slug/${item.url}`}
											params={{ slug: workspace?.slug ?? "" }}
										>
											<item.icon />
											<span>{item.title}</span>
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
