import {
	connect,
	type Msg,
	type NatsConnection,
	nuid,
	type Subscription,
} from "@nats-io/transport-node";
import { env } from "../../env";
import type { IssueWithRelations } from "./queries";

export type IssueEvents = {
	"issue:changed":
		| {
				type: "create" | "update";
				workspaceId: string;
				teamId: string;
				issue: IssueWithRelations;
		  }
		| {
				type: "delete";
				workspaceId: string;
				teamId: string;
				issueId: string;
		  };
};

type EventWithId<T> = { _eventId: string; data: T };

const MAX_HISTORY_SIZE = 1000;

let nc: NatsConnection | null = null;
let connectionPromise: Promise<NatsConnection> | null = null;

// In-memory history for resume support (ring buffer)
const eventHistory = new Map<string, EventWithId<unknown>[]>();

async function getConnection(): Promise<NatsConnection> {
	if (nc) return nc;
	if (connectionPromise) return connectionPromise;

	connectionPromise = connect({ servers: env.NATS_URL });
	nc = await connectionPromise;
	return nc;
}

export async function closeNatsConnection(): Promise<void> {
	if (nc) {
		await nc.drain();
		nc = null;
		connectionPromise = null;
	}
}

function getEventHistory<K extends keyof IssueEvents>(
	event: K,
): EventWithId<IssueEvents[K]>[] {
	const key = String(event);
	if (!eventHistory.has(key)) {
		eventHistory.set(key, []);
	}
	return eventHistory.get(key) as EventWithId<IssueEvents[K]>[];
}

function addToHistory<K extends keyof IssueEvents>(
	event: K,
	eventId: string,
	data: IssueEvents[K],
): void {
	const history = getEventHistory(event);
	history.push({ _eventId: eventId, data });

	// Keep only recent events (ring buffer behavior)
	if (history.length > MAX_HISTORY_SIZE) {
		history.shift();
	}
}

function findEventIndex<K extends keyof IssueEvents>(
	event: K,
	lastEventId: string,
): number {
	const history = getEventHistory(event);
	return history.findIndex((e) => e._eventId === lastEventId);
}

class NatsPublisher<T extends Record<string, unknown>> {
	async publish<K extends keyof T>(event: K, data: T[K]): Promise<void> {
		const connection = await getConnection();
		const subject = String(event);

		// Generate event ID for resume support
		const eventId = nuid.next();

		// Store in history for resume support
		addToHistory(
			event as keyof IssueEvents,
			eventId,
			data as IssueEvents[keyof IssueEvents],
		);

		// Publish with event ID embedded
		const message = { _eventId: eventId, data };
		connection.publish(subject, JSON.stringify(message));
	}

	subscribe<K extends keyof T>(
		event: K,
		options?: { signal?: AbortSignal; lastEventId?: string },
	): AsyncIterable<T[K]> {
		const subject = String(event);
		const signal = options?.signal;
		const lastEventId = options?.lastEventId;

		// Build replay queue from history if lastEventId provided
		const replayQueue: T[K][] = [];
		if (lastEventId) {
			const history = getEventHistory(event as keyof IssueEvents);
			const lastIndex = findEventIndex(event as keyof IssueEvents, lastEventId);

			if (lastIndex !== -1) {
				// Replay events after the last seen event
				for (let i = lastIndex + 1; i < history.length; i++) {
					const item = history[i];
					if (item) {
						replayQueue.push(item.data as T[K]);
					}
				}
			}
		}

		let replayIndex = 0;
		let subscription: Subscription | null = null;
		let subIterator: AsyncIterator<Msg> | null = null;
		let done = false;

		const cleanup = () => {
			done = true;
			if (subscription) {
				subscription.unsubscribe();
				subscription = null;
			}
			subIterator = null;
		};

		signal?.addEventListener("abort", cleanup, { once: true });

		return {
			[Symbol.asyncIterator](): AsyncIterator<T[K]> {
				return {
					async next(): Promise<IteratorResult<T[K]>> {
						if (done || signal?.aborted) {
							cleanup();
							return { done: true, value: undefined };
						}

						// First, serve from replay queue
						if (replayIndex < replayQueue.length) {
							const value = replayQueue[replayIndex++];
							if (value !== undefined) {
								return { done: false, value };
							}
						}

						// Then, subscribe to live events
						if (!subscription) {
							const connection = await getConnection();
							subscription = connection.subscribe(subject);
							subIterator = subscription[Symbol.asyncIterator]();
						}

						// Get next message from subscription
						while (true) {
							if (done || signal?.aborted) {
								cleanup();
								return { done: true, value: undefined };
							}

							const result = await subIterator!.next();

							if (result.done) {
								cleanup();
								return { done: true, value: undefined };
							}

							try {
								const parsed = JSON.parse(result.value.string()) as {
									_eventId: string;
									data: T[K];
								};
								// Skip events that were already replayed
								if (lastEventId && parsed._eventId === lastEventId) {
									continue;
								}
								return { done: false, value: parsed.data };
							} catch {}
						}
					},
					return(): Promise<IteratorResult<T[K], unknown>> {
						cleanup();
						return Promise.resolve({ done: true, value: undefined });
					},
					throw(err: unknown): Promise<IteratorResult<T[K], unknown>> {
						cleanup();
						return Promise.reject(err);
					},
				};
			},
		};
	}
}

export const issuePublisher = new NatsPublisher<IssueEvents>();
