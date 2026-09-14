/**
 * Reconstruction orchestration HTTP surface (AISE-010) — the transport
 * adapter for the deterministic lifecycle engine (`reconstruction/
 * orchestrator.ts`) over the job/artifact stores.
 *
 * Contract (spec/work-orders.md §010; routing follows `capture/router.ts`):
 *
 *   POST /v1/reconstruction/jobs
 *       Body = a ReconstructionRequest WITHOUT taskId (the server assigns
 *       one). The response returns the job AFTER the submit-time pipeline
 *       (characterization + provider selection) — the record carries the
 *       selection trace, or an explicit INPUT_INCOMPATIBLE / UNAVAILABLE
 *       failure state. Insufficient input is answered 200 with the FAILED
 *       JOB: job creation succeeded and the failure is the job's explicit
 *       state, not the HTTP request's. Malformed JSON, an unexpected taskId,
 *       an invalid request shape or an invalid job id → 400.
 *
 *   GET  /v1/reconstruction/jobs        → job list (createdAt, jobId order)
 *   GET  /v1/reconstruction/jobs/:id    → full job record incl. event journal
 *   POST /v1/reconstruction/jobs/:id/run
 *       Drives `runToCompletion` SYNCHRONOUSLY for demo/test operation so
 *       the lifecycle is exercisable end-to-end. Real deployments drive
 *       providers via workers calling the same engine; on a COMPLETED job
 *       this starts a new run cycle (append-only artifact versioning), on a
 *       failed/cancelled job it is a no-op returning the terminal record.
 *
 *   GET  /v1/reconstruction/artifacts/:id → artifact with full provenance
 *
 * HTTP STATUS MAPPING — the single authoritative place for this translation
 * (do not duplicate elsewhere): decode failures → 400 (plain error envelope
 * with `issues`); unknown job/artifact → 404; wrong methods → 405 with an
 * explicit `allow`; paths that match no reconstruction route return null so
 * the server's default 404 applies. Every response carries the
 * `x-request-id` header.
 */

import { jsonResponse, methodNotAllowed } from "../lib/http";
import type { Logger } from "../lib/log";
import { OrchestratorError, type ReconstructionOrchestrator } from "./orchestrator";
import { decodeReconstructionRequest } from "./contract";

export interface ReconstructionRouteOptions {
  /** The orchestration engine (stores, providers, clock, ids all injected). */
  readonly orchestrator: ReconstructionOrchestrator;
  /** Structured logger for domain-level request events. */
  readonly logger: Logger;
  /** Assigns task ids for requests that omit one (server-assigned identity).
   *  Defaults to a random UUID — deterministic tests inject a factory. */
  readonly taskIdFactory?: () => string;
}

function pathSegments(url: URL): string[] {
  return url.pathname.split("/").filter((segment) => segment !== "");
}

function decodeSegment(segment: string | undefined): string | null {
  if (segment === undefined) {
    return null;
  }
  try {
    return decodeURIComponent(segment);
  } catch {
    return null;
  }
}

export async function handleReconstructionRequest(
  request: Request,
  url: URL,
  requestId: string,
  options: ReconstructionRouteOptions,
): Promise<Response | null> {
  const segments = pathSegments(url);
  if (segments[0] !== "v1" || segments[1] !== "reconstruction") {
    return null;
  }
  const { orchestrator, logger } = options;
  const taskIdFactory = options.taskIdFactory ?? ((): string => crypto.randomUUID());

  /* POST+GET /v1/reconstruction/jobs ----------------------------------- */

  if (segments.length === 3 && segments[2] === "jobs") {
    if (request.method === "GET") {
      const jobs = await orchestrator.listJobs();
      logger.info("reconstruction_job_list", { requestId, count: jobs.length });
      return jsonResponse(200, { ok: true, jobs }, requestId);
    }
    if (request.method !== "POST") {
      return methodNotAllowed(requestId, "GET, POST");
    }

    let body: unknown;
    try {
      body = JSON.parse(await request.text());
    } catch {
      return jsonResponse(400, { ok: false, error: "malformed_json" }, requestId);
    }
    if (typeof body === "object" && body !== null && !Array.isArray(body) && "taskId" in body) {
      return jsonResponse(
        400,
        { ok: false, error: "unexpected_task_id", detail: "taskId must not be provided — the server assigns it" },
        requestId,
      );
    }
    const decoded = decodeReconstructionRequest({ ...(body as Record<string, unknown>), taskId: taskIdFactory() });
    if (!decoded.ok) {
      logger.warn("reconstruction_job_rejected", { requestId, issues: decoded.issues });
      return jsonResponse(400, { ok: false, error: "invalid_request", issues: decoded.issues }, requestId);
    }
    const record = await orchestrator.submit(decoded.request);
    logger.info("reconstruction_job_created", {
      requestId,
      jobId: record.jobId,
      taskId: record.taskId,
      state: record.state,
    });
    return jsonResponse(200, { ok: true, job: record }, requestId);
  }

  /* GET+POST /v1/reconstruction/jobs/:jobId ---------------------------- */

  if (segments.length === 4 && segments[2] === "jobs") {
    const jobId = decodeSegment(segments[3]);
    if (jobId === null || jobId.length === 0) {
      return jsonResponse(400, { ok: false, error: "invalid_job_id" }, requestId);
    }
    if (request.method === "GET") {
      const record = await orchestrator.getJob(jobId);
      if (record === null) {
        return jsonResponse(404, { ok: false, error: "job_not_found" }, requestId);
      }
      logger.info("reconstruction_job_read", { requestId, jobId, state: record.state });
      return jsonResponse(200, { ok: true, job: record }, requestId);
    }
    // POST on the job itself is not a route — running lives at .../run.
    return methodNotAllowed(requestId, "GET");
  }

  /* POST /v1/reconstruction/jobs/:jobId/run ---------------------------- */

  if (segments.length === 5 && segments[2] === "jobs" && segments[4] === "run") {
    if (request.method !== "POST") {
      return methodNotAllowed(requestId, "POST");
    }
    const jobId = decodeSegment(segments[3]);
    if (jobId === null || jobId.length === 0) {
      return jsonResponse(400, { ok: false, error: "invalid_job_id" }, requestId);
    }
    try {
      const record = await orchestrator.runToCompletion(jobId);
      logger.info("reconstruction_job_run", { requestId, jobId, state: record.state });
      return jsonResponse(200, { ok: true, job: record }, requestId);
    } catch (error) {
      if (error instanceof OrchestratorError && error.code === "job_not_found") {
        return jsonResponse(404, { ok: false, error: "job_not_found" }, requestId);
      }
      throw error;
    }
  }

  /* GET /v1/reconstruction/artifacts/:artifactId ----------------------- */

  if (segments.length === 4 && segments[2] === "artifacts") {
    if (request.method !== "GET") {
      return methodNotAllowed(requestId, "GET");
    }
    const artifactId = decodeSegment(segments[3]);
    if (artifactId === null || artifactId.length === 0) {
      return jsonResponse(400, { ok: false, error: "invalid_artifact_id" }, requestId);
    }
    const artifact = await orchestrator.getArtifact(artifactId);
    if (artifact === null) {
      return jsonResponse(404, { ok: false, error: "artifact_not_found" }, requestId);
    }
    logger.info("reconstruction_artifact_read", { requestId, artifactId, jobId: artifact.jobId });
    return jsonResponse(200, { ok: true, artifact }, requestId);
  }

  // A /v1/reconstruction/... path with no matching route shape falls through
  // to the server-wide 404.
  return null;
}
