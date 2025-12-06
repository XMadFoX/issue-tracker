import { createId } from "@paralleldrive/cuid2";
import { db } from "db";
import { permissionsCatalog } from "db/features/abac/abac.schema";

await db.transaction(async (tx) => {
	// add wildcard permission
	await tx.insert(permissionsCatalog).values({
		id: createId(),
		key: "*",
		action: "*",
		resourceType: "*",
		description: "Wildcard permission",
	});

	// add label permissions
	const labelPerms = [
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
	];

	for (const v of labelPerms) {
		await tx
			.insert(permissionsCatalog)
			.values({ id: createId(), ...v })
			.onConflictDoNothing?.();
	}
});
