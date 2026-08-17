import { describe, expect, test } from "bun:test";
import {
	cycleWorkerJobLogContext,
	cycleWorkerRunErrorContext,
} from "./cycles-worker";

describe("cycle worker structured logging", () => {
	test("keeps lifecycle fields bounded and excludes high-cardinality IDs", () => {
		const context = cycleWorkerJobLogContext({
			phase: "failed",
			jobId: "job-high-cardinality",
			jobType: "complete_scheduled_cycle",
			teamId: "team-high-cardinality",
			scheduledBoundary: new Date("2026-08-16T10:00:00.000Z"),
			attempt: 3,
			outcome: "x".repeat(100),
		});
		expect(context).toEqual({
			phase: "failed",
			jobType: "complete_scheduled_cycle",
			attempt: 3,
			outcome: "unknown",
		});
		expect("jobId" in context).toBe(false);
		expect("teamId" in context).toBe(false);
		expect("scheduledBoundary" in context).toBe(false);
	});

	test("replaces arbitrary run errors with a fixed summary", () => {
		const sensitive =
			"job=cjldummy team=ctdummy user=550e8400-e29b-41d4-a716-446655440000 unexpected private failure";
		const context = cycleWorkerRunErrorContext(new Error(sensitive));
		expect(context).toEqual({ error: "Cycle worker run failed" });
		expect(JSON.stringify(context)).not.toContain("cjldummy");
		expect(JSON.stringify(context)).not.toContain("ctdummy");
		expect(JSON.stringify(context)).not.toContain("550e8400");
		expect(JSON.stringify(context)).not.toContain("private failure");
	});

	test("allows fixed lifecycle outcomes without leaking arbitrary text", () => {
		expect(
			cycleWorkerJobLogContext({
				phase: "failed",
				jobId: "job-secret",
				jobType: "start_scheduled_cycle",
				teamId: "team-secret",
				scheduledBoundary: new Date(),
				attempt: 1,
				outcome: "invalid_job_identity",
			}),
		).toEqual({
			phase: "failed",
			jobType: "start_scheduled_cycle",
			attempt: 1,
			outcome: "invalid_job_identity",
		});
		expect(
			cycleWorkerJobLogContext({
				phase: "failed",
				jobId: "job-secret",
				jobType: "start_scheduled_cycle",
				teamId: "team-secret",
				scheduledBoundary: new Date(),
				attempt: 1,
				outcome: "customer-123 api_key=super-secret",
			}).outcome,
		).toBe("unknown");
	});
});
