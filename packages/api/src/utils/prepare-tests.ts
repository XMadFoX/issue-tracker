import path from "node:path";
import { $ } from "bun";
import { migrate } from "drizzle-orm/node-postgres/migrator";

const composeFile = path.resolve(
	import.meta.dir,
	"../../../../compose.test.yaml",
);

const STARTUP_TIMEOUT_MS = 180_000;
const TEARDOWN_TIMEOUT_SECONDS = 30;
const LOCK_WAIT_MS = 240_000;
const lockPath = path.join(
	process.env.TMPDIR ?? "/tmp",
	"prism-tracker-cycle-db-suite.lock",
);

function projectName(): string {
	return `prism-tracker-test-${process.pid}-${crypto.randomUUID().slice(0, 8)}`;
}

async function runCompose(
	project: string,
	command: string,
	...args: string[]
): Promise<string> {
	const result =
		await $`docker compose --project-name ${project} --file ${composeFile} ${command} ${args}`;
	return result.text();
}

async function acquireSuiteLock(owner: string): Promise<void> {
	const startedAt = Date.now();
	let emptyLockSince: number | null = null;
	while (true) {
		try {
			await $`mkdir ${lockPath}`;
			await Bun.write(path.join(lockPath, "owner"), owner);
			return;
		} catch {
			const ownerPath = path.join(lockPath, "owner");
			const existingOwner = await Bun.file(ownerPath)
				.text()
				.catch(() => "");
			const existingPid = existingOwner.match(
				/^prism-tracker-test-(\d+)-/,
			)?.[1];
			const staleOwner =
				existingPid !== undefined && !processExists(existingPid);
			if (staleOwner) {
				await $`rm -rf ${lockPath}`;
				continue;
			}
			if (!existingOwner.trim()) {
				emptyLockSince ??= Date.now();
				if (Date.now() - emptyLockSince >= 10_000) {
					await $`rm -rf ${lockPath}`;
					continue;
				}
			} else {
				emptyLockSince = null;
			}
			if (Date.now() - startedAt >= LOCK_WAIT_MS) {
				throw new Error("Timed out waiting for the serialized DB suite lock");
			}
			await Bun.sleep(250);
		}
	}
}

function processExists(pid: string): boolean {
	try {
		process.kill(Number(pid), 0);
		return true;
	} catch {
		return false;
	}
}

async function releaseSuiteLock(owner: string): Promise<void> {
	try {
		const currentOwner = (
			await Bun.file(path.join(lockPath, "owner")).text()
		).trim();
		if (currentOwner === owner) {
			await $`rm ${path.join(lockPath, "owner")}`;
			await $`rmdir ${lockPath}`;
		}
	} catch {
		// The lock may have been removed by a failed setup or process cleanup.
	}
}

async function removeOwnedComposeProject(project: string): Promise<void> {
	try {
		await $`timeout 45s docker compose --project-name ${project} --file ${composeFile} down --timeout ${TEARDOWN_TIMEOUT_SECONDS} --volumes`;
	} catch {
		// Setup failures can leave a partially-created service. Retry cleanup
		// through Docker using only this invocation's generated container ID.
	}
	try {
		const containerId = (
			await $`docker compose --project-name ${project} --file ${composeFile} ps -aq pg_test`.quiet()
		)
			.text()
			.trim();
		if (containerId) {
			try {
				await $`timeout 35s docker stop --time ${TEARDOWN_TIMEOUT_SECONDS} ${containerId}`;
			} catch {
				// Never force-stop or remove a still-running container.
			}
			await $`docker rm ${containerId}`.quiet();
		}
		await $`docker network rm ${`${project}_default`}`.quiet();
	} catch {
		// A later invocation-owned cleanup check can remove an already-stopped resource.
	}
}

function hostPort(composePort: string): string {
	const match = composePort.trim().match(/:(\d+)$/);
	if (!match?.[1])
		throw new Error(`Could not parse PostgreSQL host port: ${composePort}`);
	return match[1];
}

export default async function setupDb() {
	const project = projectName();
	const owner = `${project}:${crypto.randomUUID()}`;
	const previousDatabaseUrl = process.env.DATABASE_URL;
	const previousEnvType = process.env.ENV_TYPE;
	let dbLoaded = false;
	let cleaned = false;
	let setupComplete = false;

	await acquireSuiteLock(owner);

	const cleanup = async (): Promise<void> => {
		if (cleaned) return;
		cleaned = true;
		if (dbLoaded) {
			try {
				const { closeDb } = await import("db");
				await closeDb();
			} catch {
				// Preserve the original test failure while still attempting service cleanup.
			}
		}
		await removeOwnedComposeProject(project);
		if (previousDatabaseUrl === undefined) delete process.env.DATABASE_URL;
		else process.env.DATABASE_URL = previousDatabaseUrl;
		if (previousEnvType === undefined) delete process.env.ENV_TYPE;
		else process.env.ENV_TYPE = previousEnvType;
		await releaseSuiteLock(owner);
	};

	try {
		console.info(`[setupDb] compose up project=${project}`);
		await runCompose(project, "up", "-d");
		const composePort = await runCompose(project, "port", "pg_test", "5432");
		const port = hostPort(composePort);
		const containerId = (
			await runCompose(project, "ps", "-q", "pg_test")
		).trim();
		if (!containerId)
			throw new Error(
				`PostgreSQL container was not created (project ${project})`,
			);
		const deadline = Date.now() + STARTUP_TIMEOUT_MS;
		let ready = false;
		while (Date.now() < deadline) {
			try {
				const health = (
					await $`timeout 5s docker inspect --format '{{.State.Health.Status}}' ${containerId}`.quiet()
				)
					.text()
					.trim();
				if (health === "healthy") {
					ready = true;
					break;
				}
				if (health === "unhealthy") await Bun.sleep(1_000);
				else await Bun.sleep(1_000);
			} catch {
				await Bun.sleep(1_000);
			}
		}
		if (!ready) {
			throw new Error(
				`PostgreSQL test service did not become ready within ${STARTUP_TIMEOUT_MS / 1_000}s (project ${project})`,
			);
		}

		process.env.DATABASE_URL = `postgres://postgres:postgres@127.0.0.1:${port}/issue_tracker`;
		process.env.ENV_TYPE = "server";
		console.info(`[setupDb] connecting to db project=${project} port=${port}`);
		const { db } = await import("db");
		dbLoaded = true;

		console.info("[setupDb] running migrations");
		const folder = path.join(__dirname, "../../../db/drizzle");
		await migrate(db, { migrationsFolder: folder });
		console.info("[setupDb] migrations done");
		setupComplete = true;
		return cleanup;
	} finally {
		if (!setupComplete) await cleanup();
	}
}
