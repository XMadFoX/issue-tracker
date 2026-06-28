import type { Outputs } from "@prism/api/src/router";
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "@prism/ui/components/collapsible";
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
	SidebarMenuSub,
	SidebarMenuSubButton,
	SidebarMenuSubItem,
	SidebarProvider,
} from "@prism/ui/components/sidebar";
import { useQuery } from "@tanstack/react-query";
import {
	createFileRoute,
	Link,
	Outlet,
	useMatchRoute,
	useNavigate,
} from "@tanstack/react-router";
import type { LucideIcon } from "lucide-react";
import {
	ChevronRight,
	Contact,
	ListTodo,
	RefreshCw,
	Settings,
} from "lucide-react";
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
					value={workspace?.slug ?? null}
					items={workspaces?.map((ws) => ({ value: ws.slug, label: ws.name }))}
					onValueChange={(slug) => {
						if (!slug) return;
						navigate({
							to: "/workspace/$slug",
							params: { slug },
						});
					}}
				>
					<SelectTrigger className="w-full">
						<SelectValue placeholder="Select workspace">
							{(value) => {
								const ws = workspaces?.find((w) => w.slug === value);
								return ws?.name ?? value;
							}}
						</SelectValue>
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
				<TeamSidebarGroup
					workspaceSlug={workspace?.slug ?? ""}
					teams={teams.data}
				/>
				<SidebarGroup>
					<SidebarGroupLabel>Settings</SidebarGroupLabel>
					<SidebarGroupContent>
						<SidebarMenu>
							<SidebarMenuItem>
								<SidebarMenuButton
									render={
										<Link
											to="/workspace/$slug/settings/members"
											params={{ slug: workspace?.slug ?? "" }}
										/>
									}
								>
									<span>Members</span>
								</SidebarMenuButton>
							</SidebarMenuItem>
							<SidebarMenuItem>
								<SidebarMenuButton
									render={
										<Link
											to="/workspace/$slug/settings/roles"
											params={{ slug: workspace?.slug ?? "" }}
										/>
									}
								>
									<span>Roles & permissions</span>
								</SidebarMenuButton>
							</SidebarMenuItem>
							<SidebarMenuItem>
								<SidebarMenuButton
									render={
										<Link
											to="/workspace/$slug/settings/labels"
											params={{ slug: workspace?.slug ?? "" }}
										/>
									}
								>
									<span>Labels</span>
								</SidebarMenuButton>
							</SidebarMenuItem>
							<SidebarMenuItem>
								<SidebarMenuButton
									render={
										<Link
											to="/workspace/$slug/settings/priorities"
											params={{ slug: workspace?.slug ?? "" }}
										/>
									}
								>
									<span>Priorities</span>
								</SidebarMenuButton>
							</SidebarMenuItem>
							<SidebarMenuItem>
								<SidebarMenuButton
									render={
										<Link
											to="/workspace/$slug/settings/issue-types"
											params={{ slug: workspace?.slug ?? "" }}
										/>
									}
								>
									<span>Issue types</span>
								</SidebarMenuButton>
							</SidebarMenuItem>
							<SidebarMenuItem>
								<SidebarMenuButton
									render={
										<Link
											to="/workspace/$slug/settings/workflow"
											params={{ slug: workspace?.slug ?? "" }}
										/>
									}
								>
									<span>Workflow</span>
								</SidebarMenuButton>
							</SidebarMenuItem>
						</SidebarMenu>
					</SidebarGroupContent>
				</SidebarGroup>
			</SidebarContent>
		</Sidebar>
	);
}

type Team = Outputs["team"]["listByWorkspace"][number];
type TeamRoute =
	| "/workspace/$slug/teams/$teamSlug/issues"
	| "/workspace/$slug/teams/$teamSlug/cycles/";

type TeamMenuOption = {
	icon: LucideIcon;
	isActive: boolean;
	label: string;
	to: TeamRoute;
};

function TeamSidebarGroup({
	teams,
	workspaceSlug,
}: {
	teams: undefined | Outputs["team"]["listByWorkspace"];
	workspaceSlug: string;
}) {
	return (
		<SidebarGroup>
			<SidebarGroupLabel>
				Your teams
				<Link
					className="ml-auto rounded-sm text-sidebar-foreground/70 transition-colors hover:text-sidebar-foreground"
					to="/workspace/$slug/teams"
					params={{ slug: workspaceSlug }}
				>
					<Settings className="size-4" />
					<span className="sr-only">Manage teams</span>
				</Link>
			</SidebarGroupLabel>
			<SidebarGroupContent>
				<SidebarMenu>
					{teams?.map((team) => (
						<TeamSidebarMenuItem
							key={team.id}
							team={team}
							workspaceSlug={workspaceSlug}
						/>
					))}
				</SidebarMenu>
			</SidebarGroupContent>
		</SidebarGroup>
	);
}

function TeamSidebarMenuItem({
	team,
	workspaceSlug,
}: {
	team: Team;
	workspaceSlug: string;
}) {
	const matchRoute = useMatchRoute();
	const params = {
		slug: workspaceSlug,
		teamSlug: team.key ?? "",
	};
	const options: TeamMenuOption[] = [
		{
			icon: ListTodo,
			isActive: !!matchRoute({
				to: "/workspace/$slug/teams/$teamSlug/issues",
				params,
				fuzzy: true,
			}),
			label: "Issues",
			to: "/workspace/$slug/teams/$teamSlug/issues",
		},
		{
			icon: RefreshCw,
			isActive: !!matchRoute({
				to: "/workspace/$slug/teams/$teamSlug/cycles/",
				params,
				fuzzy: true,
			}),
			label: "Cycles",
			to: "/workspace/$slug/teams/$teamSlug/cycles/",
		},
	];

	return (
		<Collapsible
			defaultOpen={true}
			render={<SidebarMenuItem className="group/team" />}
		>
			<CollapsibleTrigger
				render={
					<SidebarMenuButton className="text-sidebar-foreground/80 hover:text-sidebar-foreground">
						<Contact className="text-sidebar-foreground/70" />
						<span>{team.name}</span>
						<ChevronRight className="ml-auto size-3.5 text-sidebar-foreground/50 transition-transform duration-200 group-data-open/team:rotate-90" />
					</SidebarMenuButton>
				}
			/>
			<CollapsibleContent>
				<SidebarMenuSub className="mx-0 border-l-0 px-0 py-1">
					{options.map((option) => (
						<TeamSidebarMenuOption
							key={option.label}
							option={option}
							params={params}
						/>
					))}
				</SidebarMenuSub>
			</CollapsibleContent>
		</Collapsible>
	);
}

function TeamSidebarMenuOption({
	option,
	params,
}: {
	option: TeamMenuOption;
	params: { slug: string; teamSlug: string };
}) {
	const Icon = option.icon;

	return (
		<SidebarMenuSubItem>
			<SidebarMenuSubButton
				isActive={option.isActive}
				className="h-8 pl-7 [&>svg]:!text-sidebar-foreground/70 hover:[&>svg]:!text-sidebar-foreground data-[active=true]:[&>svg]:!text-sidebar-foreground"
				render={<Link to={option.to} params={params} />}
			>
				<Icon />
				<span>{option.label}</span>
			</SidebarMenuSubButton>
		</SidebarMenuSubItem>
	);
}
