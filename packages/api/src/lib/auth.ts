import { Base64KeyCodec, Bucket, Kvm, NoopKvCodecs } from "@nats-io/kv";
import type { NatsConnection } from "@nats-io/transport-node";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db, schema } from "db";
import { env } from "../env";
import { getNatsConnection } from "./nats";

let authStoragePromise: Promise<Bucket> | null = null;
let authStorageConnection: NatsConnection | null = null;

function ttlToNatsDuration(ttlSeconds: number): string {
	return `${Math.max(1, Math.ceil(ttlSeconds))}s`;
}

async function getAuthStorage(): Promise<Bucket> {
	if (
		authStorageConnection?.isClosed() ||
		authStorageConnection?.isDraining()
	) {
		authStoragePromise = null;
		authStorageConnection = null;
	}
	if (authStoragePromise) return authStoragePromise;

	authStoragePromise = getNatsConnection()
		.then(async (connection) => {
			const kvm = new Kvm(connection);
			const storage = await kvm.create(env.NATS_AUTH_KV_BUCKET, {
				codec: {
					...NoopKvCodecs(),
					key: Base64KeyCodec(),
				},
				// Enables per-message TTLs used by Better Auth session storage.
				markerTTL: 60_000,
			});
			if (!(storage instanceof Bucket)) {
				throw new Error("NATS KV client returned an unsupported bucket type");
			}

			const status = await storage.status();

			if (status.markerTTL <= 0) {
				throw new Error(
					`NATS KV bucket "${env.NATS_AUTH_KV_BUCKET}" must be created with markerTTL to support Better Auth secondaryStorage TTLs`,
				);
			}

			authStorageConnection = connection;
			return storage;
		})
		.catch((error: unknown) => {
			authStoragePromise = null;
			authStorageConnection = null;
			throw error;
		});

	return authStoragePromise;
}

export async function checkAuthStorageReachable(): Promise<void> {
	const storage = await getAuthStorage();
	await storage.status();
}

async function setAuthStorageValue(
	key: string,
	value: string,
	ttl?: number,
): Promise<void> {
	const storage = await getAuthStorage();

	if (ttl && ttl > 0) {
		const encodedKey = storage.encodeKey(key);
		storage.validateKey(encodedKey);
		await storage.js.publish(storage.subjectForKey(encodedKey, true), value, {
			ttl: ttlToNatsDuration(ttl),
		});
		return;
	}

	await storage.put(key, value);
}

export const auth = betterAuth({
	trustedOrigins: env.CORS_ORIGINS,
	emailAndPassword: {
		enabled: true,
	},
	secondaryStorage: {
		get: async (key: string) => {
			const entry = await (await getAuthStorage()).get(key);
			if (!entry || entry.operation !== "PUT") return null;

			return entry.string();
		},
		set: setAuthStorageValue,
		delete: async (key: string) => {
			await (await getAuthStorage()).delete(key);
		},
	},
	database: drizzleAdapter(db, {
		provider: "pg",
		schema,
	}),
});
