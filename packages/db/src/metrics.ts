import type { Counter, Histogram, ObservableGauge } from "@opentelemetry/api";
import { metrics } from "@opentelemetry/api";
import type { Pool } from "pg";

const getMeter = () => metrics.getMeter("prism-tracker-db");

let dbQueryCount: Counter | undefined;
let dbQueryDuration: Histogram | undefined;
let dbQueryErrors: Counter | undefined;
let dbPoolTotalConnections: ObservableGauge | undefined;
let dbPoolIdleConnections: ObservableGauge | undefined;
let dbPoolWaitingRequests: ObservableGauge | undefined;

const baseDbAttributes = {
	"db.system": "postgresql",
};

const getDbQueryCount = () => {
	dbQueryCount ??= getMeter().createCounter("db.client.proxy.query.count", {
		description: "Number of database proxy queries executed by the application",
		unit: "{query}",
	});
	return dbQueryCount;
};

const getDbQueryDuration = () => {
	dbQueryDuration ??= getMeter().createHistogram(
		"db.client.proxy.query.duration",
		{
			description: "Database proxy query duration",
			unit: "ms",
		},
	);
	return dbQueryDuration;
};

const getDbQueryErrors = () => {
	dbQueryErrors ??= getMeter().createCounter("db.client.proxy.query.errors", {
		description: "Number of database proxy query errors",
		unit: "{error}",
	});
	return dbQueryErrors;
};

export const recordDbProxyQuery = (
	operation: string,
	durationMs: number,
	status: "ok" | "error",
) => {
	const attributes = {
		...baseDbAttributes,
		"db.operation.name": operation,
		"db.query.status": status,
	};

	getDbQueryCount().add(1, attributes);
	getDbQueryDuration().record(durationMs, attributes);

	if (status === "error") {
		getDbQueryErrors().add(1, attributes);
	}
};

export const observeDbPool = (pool: Pool) => {
	const attributes = {
		...baseDbAttributes,
		"db.client.connection.pool.name": "default",
	};
	const meter = getMeter();

	dbPoolTotalConnections ??= meter.createObservableGauge(
		"db.client.pool.connections.total",
		{
			description: "Total PostgreSQL pool connections",
			unit: "{connection}",
		},
	);
	dbPoolIdleConnections ??= meter.createObservableGauge(
		"db.client.pool.connections.idle",
		{
			description: "Idle PostgreSQL pool connections",
			unit: "{connection}",
		},
	);
	dbPoolWaitingRequests ??= meter.createObservableGauge(
		"db.client.pool.requests.waiting",
		{
			description: "Requests waiting for a PostgreSQL pool connection",
			unit: "{request}",
		},
	);

	meter.addBatchObservableCallback(
		(observerResult) => {
			if (
				!dbPoolTotalConnections ||
				!dbPoolIdleConnections ||
				!dbPoolWaitingRequests
			) {
				return;
			}

			observerResult.observe(
				dbPoolTotalConnections,
				pool.totalCount,
				attributes,
			);
			observerResult.observe(dbPoolIdleConnections, pool.idleCount, attributes);
			observerResult.observe(
				dbPoolWaitingRequests,
				pool.waitingCount,
				attributes,
			);
		},
		[dbPoolTotalConnections, dbPoolIdleConnections, dbPoolWaitingRequests],
	);
};
