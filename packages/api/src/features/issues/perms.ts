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
