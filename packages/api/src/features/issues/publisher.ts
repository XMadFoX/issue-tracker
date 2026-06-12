import { type Msg, nuid, type Subscription } from "@nats-io/transport-node";
import { getNatsConnection } from "../../lib/nats";
import { logger } from "../../logger";
import {
	addNatsActiveSubscription,
	recordNatsParseError,
	recordNatsPublish,
	recordNatsPublishError,
	recordNatsReceivedMessage,
} from "../../metrics";
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

// In-memory history for resume support (ring buffer)
const eventHistory = new Map<string, EventWithId<unknown>[]>();

export { checkNatsReachable, closeNatsConnection } from "../../lib/nats";

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
		const start = performance.now();
		const subject = String(event);
		const attributes = {
			"messaging.system": "nats",
			"messaging.operation.name": "publish",
			"messaging.destination.name": subject,
		};

		try {
			const connection = await getNatsConnection();
			let payloadBytes = 0;

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
			const payload = JSON.stringify(message);
			payloadBytes = Buffer.byteLength(payload);
			connection.publish(subject, payload);
			recordNatsPublish(performance.now() - start, payloadBytes, attributes);
		} catch (error) {
			recordNatsPublishError(performance.now() - start, attributes);
			throw error;
		}
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
		let activeSubscriptionRecorded = false;
		const attributes = {
			"messaging.system": "nats",
			"messaging.operation.name": "receive",
			"messaging.destination.name": subject,
		};

		const cleanup = () => {
			done = true;
			if (activeSubscriptionRecorded) {
				addNatsActiveSubscription(-1, attributes);
				activeSubscriptionRecorded = false;
			}
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
							const connection = await getNatsConnection();
							subscription = connection.subscribe(subject);
							subIterator = subscription[Symbol.asyncIterator]();
							addNatsActiveSubscription(1, attributes);
							activeSubscriptionRecorded = true;
						}

						// Get next message from subscription
						while (true) {
							if (done || signal?.aborted) {
								cleanup();
								return { done: true, value: undefined };
							}

							const iterator = subIterator;
							if (!iterator) {
								cleanup();
								return { done: true, value: undefined };
							}

							const result = await iterator.next();

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
								recordNatsReceivedMessage(attributes);
								return { done: false, value: parsed.data };
							} catch (error) {
								recordNatsParseError(attributes);
								logger.debug("Failed to parse NATS issue event: {error}", {
									error,
								});
							}
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
