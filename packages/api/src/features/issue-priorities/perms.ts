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
] as const;
