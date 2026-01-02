import type { Outputs } from "@prism/api/src/router";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@prism/ui/components/select";
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
import {
	createFileRoute,
	Link,
	Outlet,
	useNavigate,
} from "@tanstack/react-router";
import { Cog, Contact, Settings } from "lucide-react";
import { orpc } from "src/orpc/client";

export const Route = createFileRoute("/workspace/$slug")({
	component: WorkspaceLayout,
});

function WorkspaceLayout() {
	const { slug } = Route.useParams();
	const workspace = useQuery(
		orpc.workspace.getBySlug.queryOptions({ input: { slug } }),
	);
	const workspaces = useQuery(orpc.workspace.list.queryOptions());

	return (
		<div>
			<SidebarProvider defaultOpen={true}>
				<WorkspaceSidebar
					workspace={workspace.data}
					workspaces={workspaces.data}
				/>
				<Outlet />
			</SidebarProvider>
		</div>
	);
}

export function WorkspaceSidebar({
	workspace,
	workspaces,
}: {
	workspace: undefined | Outputs["workspace"]["getBySlug"];
	workspaces: undefined | Outputs["workspace"]["list"];
}) {
	const navigate = useNavigate();
	const teams = useQuery(
		orpc.team.listByWorkspace.queryOptions({
			input: { id: workspace?.id ?? "" },
			enabled: !!workspace?.id,
		}),
	);

	return (
		<Sidebar>
			<SidebarHeader>
				<Select
					value={workspace?.slug}
					onValueChange={(slug) => {
						navigate({
							to: "/workspace/$slug",
							params: { slug },
						});
					}}
				>
					<SelectTrigger className="w-full">
						<SelectValue placeholder="Select workspace" />
					</SelectTrigger>
					<SelectContent>
						{workspaces
							?.filter((ws) => ws.slug !== "")
							.map((ws) => (
								<SelectItem key={ws.id} value={ws.slug}>
									{ws.name}
								</SelectItem>
							))}
					</SelectContent>
				</Select>
			</SidebarHeader>
			<SidebarContent>
				<SidebarGroup>
					<SidebarGroupLabel>
						Teams
						<Link
							className="ml-auto"
							to="/workspace/$slug/teams"
							params={{ slug: workspace?.slug ?? "" }}
						>
							<Settings className="size-4" />
						</Link>
					</SidebarGroupLabel>
					<SidebarGroupContent>
						<SidebarMenu>
							{teams?.data?.map((team) => (
								<SidebarMenuItem key={team.name}>
									<SidebarMenuButton asChild>
										<Link
											to={`/workspace/$slug/teams/$teamSlug/issues`}
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
