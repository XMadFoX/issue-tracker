import { db } from "db";
import { ensurePermissionCatalog } from "./features/workspaces/defaults";

let initCompleted = false;
let initPromise: Promise<void> | null = null;

export function isApiInitCompleted(): boolean {
	return initCompleted;
}

export function ensureApiInit(): Promise<void> {
	if (initPromise) {
		return initPromise;
	}

	initPromise = (async () => {
		try {
			await db.transaction(async (tx) => {
				await ensurePermissionCatalog(tx);
			});
			initCompleted = true;
		} catch (error) {
			initCompleted = false;
			initPromise = null;
			throw error;
		}
	})();

	return initPromise;
}
