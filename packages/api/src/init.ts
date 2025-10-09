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
});
