import { connect, type NatsConnection } from "@nats-io/transport-node";
import { env } from "../env";
import {
	recordNatsConnectionAttempt,
	recordNatsConnectionError,
} from "../metrics";

let nc: NatsConnection | null = null;
let connectionPromise: Promise<NatsConnection> | null = null;

export async function getNatsConnection(): Promise<NatsConnection> {
	if (nc && !nc.isClosed() && !nc.isDraining()) return nc;
	if (nc?.isClosed() || nc?.isDraining()) {
		nc = null;
	}
	if (connectionPromise) return connectionPromise;

	recordNatsConnectionAttempt();

	connectionPromise = connect({ servers: env.NATS_URL })
		.then((connection) => {
			nc = connection;
			return connection;
		})
		.catch((error: unknown) => {
			recordNatsConnectionError();
			nc = null;
			throw error;
		})
		.finally(() => {
			connectionPromise = null;
		});

	return connectionPromise;
}

export async function checkNatsReachable(): Promise<void> {
	const connection = await getNatsConnection();
	if (connection.isClosed() || connection.isDraining()) {
		throw new Error("NATS connection is not active");
	}
	await connection.flush();
}

export async function closeNatsConnection(): Promise<void> {
	if (nc) {
		await nc.drain();
		nc = null;
		connectionPromise = null;
	}
}
