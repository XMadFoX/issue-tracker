import { db } from "db";
import { ensurePermissionCatalog } from "./features/workspaces/defaults";

let initPromise: Promise<void> | null = null;

export function ensureApiInit() {
	if (initPromise) {
		return initPromise;
	}

	initPromise = db.transaction(async (tx) => {
		await ensurePermissionCatalog(tx);
	});

	return initPromise;
}
