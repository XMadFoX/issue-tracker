export const wildcardPermission = {
	key: "*",
	resourceType: "*",
	action: "*",
	description: "Wildcard permission",
} as const;

export const workspacePerms = [
	{
		key: "workspace:read",
		resourceType: "workspace",
		action: "read",
		description: "Read workspace",
	},
	{
		key: "workspace:update",
		resourceType: "workspace",
		action: "update",
		description: "Update workspace",
	},
	{
		key: "workspace:delete",
		resourceType: "workspace",
		action: "delete",
		description: "Delete workspace",
	},
	{
		key: "workspace:read_members",
		resourceType: "workspace_membership",
		action: "read",
		description: "Read workspace members",
	},
	{
		key: "workspace:manage_members",
		resourceType: "workspace_membership",
		action: "manage",
		description: "Manage workspace members",
	},
] as const;

export const teamPerms = [
	{
		key: "team:read",
		resourceType: "team",
		action: "read",
		description: "Read teams",
	},
	{
		key: "team:create",
		resourceType: "team",
		action: "create",
		description: "Create teams",
	},
	{
		key: "team:update",
		resourceType: "team",
		action: "update",
		description: "Update teams",
	},
	{
		key: "team:delete",
		resourceType: "team",
		action: "delete",
		description: "Delete teams",
	},
	{
		key: "team:read_members",
		resourceType: "team_membership",
		action: "read",
		description: "Read team members",
	},
	{
		key: "team:manage_members",
		resourceType: "team_membership",
		action: "manage",
		description: "Manage team members",
	},
] as const;

export const rolePerms = [
	{
		key: "role:create",
		resourceType: "role",
		action: "create",
		description: "Create roles",
	},
	{
		key: "role:read",
		resourceType: "role",
		action: "read",
		description: "Read roles",
	},
	{
		key: "role:update",
		resourceType: "role",
		action: "update",
		description: "Update roles",
	},
	{
		key: "role:delete",
		resourceType: "role",
		action: "delete",
		description: "Delete roles",
	},
	{
		key: "role:manage_permissions",
		resourceType: "role_permission",
		action: "manage",
		description: "Manage role permissions",
	},
] as const;

export const labelPerms = [
	{
		key: "label:read",
		resourceType: "label",
		action: "read",
		description: "Read labels",
	},
	{
		key: "label:create",
		resourceType: "label",
		action: "create",
		description: "Create labels",
	},
	{
		key: "label:update",
		resourceType: "label",
		action: "update",
		description: "Update labels",
	},
	{
		key: "label:delete",
		resourceType: "label",
		action: "delete",
		description: "Delete labels",
	},
] as const;

export const issuePerms = [
	{
		key: "issue:read",
		resourceType: "issue",
		action: "read",
		description: "Read issues",
	},
	{
		key: "issue:create",
		resourceType: "issue",
		action: "create",
		description: "Create issues",
	},
	{
		key: "issue:update",
		resourceType: "issue",
		action: "update",
		description: "Update issues",
	},
	{
		key: "issue:delete",
		resourceType: "issue",
		action: "delete",
		description: "Delete issues",
	},
] as const;

export const issuePriorityPerms = [
	{
		key: "issue_priority:read",
		resourceType: "issue_priority",
		action: "read",
		description: "Read issue priorities",
	},
	{
		key: "issue_priority:create",
		resourceType: "issue_priority",
		action: "create",
		description: "Create issue priorities",
	},
	{
		key: "issue_priority:update",
		resourceType: "issue_priority",
		action: "update",
		description: "Update issue priorities",
	},
	{
		key: "issue_priority:delete",
		resourceType: "issue_priority",
		action: "delete",
		description: "Delete issue priorities",
	},
	{
		key: "issue_priority:reorder",
		resourceType: "issue_priority",
		action: "reorder",
		description: "Reorder issue priorities",
	},
] as const;

export const issueStatusPerms = [
	{
		key: "issue_status:read",
		resourceType: "issue_status",
		action: "read",
		description: "Read issue statuses",
	},
	{
		key: "issue_status:create",
		resourceType: "issue_status",
		action: "create",
		description: "Create issue statuses",
	},
	{
		key: "issue_status:update",
		resourceType: "issue_status",
		action: "update",
		description: "Update issue statuses",
	},
	{
		key: "issue_status:delete",
		resourceType: "issue_status",
		action: "delete",
		description: "Delete issue statuses",
	},
	{
		key: "issue_status:reorder",
		resourceType: "issue_status",
		action: "reorder",
		description: "Reorder issue statuses",
	},
] as const;

export const issueStatusGroupPerms = [
	{
		key: "issue_status_group:read",
		resourceType: "issue_status_group",
		action: "read",
		description: "Read issue status groups",
	},
	{
		key: "issue_status_group:create",
		resourceType: "issue_status_group",
		action: "create",
		description: "Create issue status groups",
	},
	{
		key: "issue_status_group:update",
		resourceType: "issue_status_group",
		action: "update",
		description: "Update issue status groups",
	},
	{
		key: "issue_status_group:delete",
		resourceType: "issue_status_group",
		action: "delete",
		description: "Delete issue status groups",
	},
	{
		key: "issue_status_group:reorder",
		resourceType: "issue_status_group",
		action: "reorder",
		description: "Reorder issue status groups",
	},
] as const;

export const permissionCatalogEntries = [
	wildcardPermission,
	...workspacePerms,
	...teamPerms,
	...rolePerms,
	...labelPerms,
	...issuePerms,
	...issuePriorityPerms,
	...issueStatusPerms,
	...issueStatusGroupPerms,
] as const;
