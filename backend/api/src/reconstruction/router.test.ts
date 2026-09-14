/**
 * Reconstruction HTTP surface tests (AISE-010): submit/list/get/run/get-
 * artifact happy paths, explicit insufficient-input responses, 400/404/405
 * mapping, x-request-id correlation and the default (provider-less) wiring.
 */

import { describe, expect, test } from "bun:test";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import pkg from "../../package.json" with { type: "json" };
import { createLogger } from "../lib/log";
import type { EnvRecord } from "../lib/config";
import { createCaptureGateway } from "../capture/gateway";
import { InMemoryCaptureStore } from "../capture/store";
import { createRequestHandler } from "../server";
import { createReconstructionOrchestrator, type ReconstructionOrchestrator } from "./orchestrator";
import { InMemoryArtifactStore, InMemoryJobStore, FsArtifactStore, FsJobStore } from "./store";
import {
  FakeMeshProvider,
  contentIdOf,
  evSummary,
  fixedClock,
  makeRequest,
  readerOver,
  sequencedIdFactory,
  withTempDir,
} from "./testkit";

const quietLogger = createLogger("error");

const validEnv: EnvRecord = {
  HOST: "127.0.0.1",
  PORT: "8080",
  LOG_LEVEL: "info",
};

/** Handler backed by an injected orchestrator with deterministic ids. */
function handlerWith(orchestrator: ReconstructionOrchestrator): (request: Request) => Promise<Response> {
  return createRequestHandler({
    envSource: (): EnvRecord => validEnv,
    version: pkg.version,
    logger: quietLogger,
    capture: createCaptureGateway({ store: new InMemoryCaptureStore(), clock: fixedClock }),
    reconstruction: { orchestrator, logger: quietLogger, taskIdFactory: () => "task-server-assigned" },
  });
}

/** Fresh in-memory orchestrator over the happy-path provider. */
function makeOrchestrator(): ReconstructionOrchestrator {
  return createReconstructionOrchestrator({
    providers: [new FakeMeshProvider()],
    jobStore: new InMemoryJobStore(),
    artifactStore: new InMemoryArtifactStore(),
    clock: fixedClock,
    idFactory: sequencedIdFactory("id"),
    logger: quietLogger,
  });
}

function postJson(path: string, body: string, headers?: Record<string, string>): Request {
  return new Request(`http://localhost${path}`, {
    method: "POST",
    body,
    headers: { "content-type": "application/json", ...headers },
  });
}

function get(path: string, headers?: Record<string, string>): Request {
  return new Request(`http://localhost${path}`, { method: "GET", headers });
}

function request(method: string, path: string): Request {
  return new Request(`http://localhost${path}`, { method });
}

interface JobBody {
  ok: boolean;
  job: {
    jobId: string;
    taskId: string;
    state: string;
    failure: { code: string; missingEvidenceIds?: string[] } | null;
    selection: { selectedProviderId: string | null } | null;
    events: { type: string }[];
    artifactIds: string[];
  };
}

/** Valid POST /v1/reconstruction/jobs body (taskId omitted — server assigns). */
function jobBody(overrides?: Record<string, unknown>): string {
  return JSON.stringify({
    evidenceContentIds: [contentIdOf("frame-001"), contentIdOf("frame-002")],
    requestedRepresentations: ["mesh"],
    policyConstraints: { timeoutMs: 30_000, maxRetries: 0 },
    ...overrides,
  });
}

/* ------------------------------------------------------------------ */
/* Job creation                                                         */
/* ------------------------------------------------------------------ */

describe("reconstruction HTTP surface: job creation", () => {
  test("creates a job with the server-assigned taskId and the selection trace", async () => {
    const handler = handlerWith(makeOrchestrator());
    const response = await handler(
      postJson("/v1/reconstruction/jobs", jobBody(), { "x-request-id": "corr-recon-1" }),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("x-request-id")).toBe("corr-recon-1");
    const body = (await response.json()) as JobBody;
    expect(body.ok).toBe(true);
    expect(body.job.taskId).toBe("task-server-assigned");
    expect(body.job.state).toBe("dispatching");
    expect(body.job.selection?.selectedProviderId).toBe("fake-mesh");
    expect(body.job.events.map((event) => event.type)).toEqual([
      "submitted",
      "characterized",
      "provider_selected",
    ]);
  });

  test("insufficient input answers 200 with the explicitly failed job", async () => {
    const missing = contentIdOf("router-missing");
    const orchestrator = createReconstructionOrchestrator({
      providers: [new FakeMeshProvider()],
      jobStore: new InMemoryJobStore(),
      artifactStore: new InMemoryArtifactStore(),
      clock: fixedClock,
      idFactory: sequencedIdFactory("id"),
      evidenceReader: readerOver({ [contentIdOf("frame-001")]: evSummary("STILL_IMAGERY") }),
      logger: quietLogger,
    });
    const handler = handlerWith(orchestrator);
    const response = await handler(
      postJson("/v1/reconstruction/jobs", jobBody({ evidenceContentIds: [contentIdOf("frame-001"), missing] })),
    );
    // Job creation SUCCEEDED; the failure is the job's explicit state.
    expect(response.status).toBe(200);
    const body = (await response.json()) as JobBody;
    expect(body.job.state).toBe("failed");
    expect(body.job.failure?.code).toBe("INPUT_INCOMPATIBLE");
    expect(body.job.failure?.missingEvidenceIds).toEqual([missing]);
  });

  test("rejects malformed JSON, unexpected taskId and invalid shapes with 400", async () => {
    const handler = handlerWith(makeOrchestrator());

    const malformed = await handler(
      postJson("/v1/reconstruction/jobs", "{not json"),
    );
    expect(malformed.status).toBe(400);
    expect(((await malformed.json()) as { error: string }).error).toBe("malformed_json");

    const withTaskId = await handler(postJson("/v1/reconstruction/jobs", jobBody({ taskId: "client-1" })));
    expect(withTaskId.status).toBe(400);
    expect(((await withTaskId.json()) as { error: string }).error).toBe("unexpected_task_id");

    const invalid = await handler(
      postJson("/v1/reconstruction/jobs", jobBody({ evidenceContentIds: [] })),
    );
    expect(invalid.status).toBe(400);
    const invalidBody = (await invalid.json()) as { error: string; issues: string[] };
    expect(invalidBody.error).toBe("invalid_request");
    expect(invalidBody.issues.join(" ")).toContain("evidenceContentIds");

    const badRepresentation = await handler(
      postJson("/v1/reconstruction/jobs", jobBody({ requestedRepresentations: ["hologram"] })),
    );
    expect(badRepresentation.status).toBe(400);
    expect(((await badRepresentation.json()) as { issues: string[] }).issues.join(" ")).toContain("hologram");
  });

  test("405 with allow on wrong methods; unmatched reconstruction paths 404", async () => {
    const handler = handlerWith(makeOrchestrator());
    const put = await handler(request("PUT", "/v1/reconstruction/jobs"));
    expect(put.status).toBe(405);
    expect(put.headers.get("allow")).toBe("GET, POST");

    const deleteArtifact = await handler(request("DELETE", "/v1/reconstruction/artifacts/xyz"));
    expect(deleteArtifact.status).toBe(405);
    expect(deleteArtifact.headers.get("allow")).toBe("GET");

    const unknown = await handler(get("/v1/reconstruction/nonsense"));
    expect(unknown.status).toBe(404);
    expect(((await unknown.json()) as { error: string }).error).toBe("not_found");
  });
});

/* ------------------------------------------------------------------ */
/* Job list, read, run                                                  */
/* ------------------------------------------------------------------ */

describe("reconstruction HTTP surface: list/get/run", () => {
  test("lists jobs, reads a job with its journal, and 404s unknown ids", async () => {
    const orchestrator = makeOrchestrator();
    const handler = handlerWith(orchestrator);
    const created = (await (await handler(postJson("/v1/reconstruction/jobs", jobBody()))).json()) as JobBody;
    const jobId = created.job.jobId;

    const list = await handler(get("/v1/reconstruction/jobs"));
    expect(list.status).toBe(200);
    const listBody = (await list.json()) as { ok: boolean; jobs: { jobId: string }[] };
    expect(listBody.ok).toBe(true);
    expect(listBody.jobs.map((job) => job.jobId)).toEqual([jobId]);

    const read = await handler(get(`/v1/reconstruction/jobs/${jobId}`));
    expect(read.status).toBe(200);
    const readBody = (await read.json()) as JobBody;
    expect(readBody.job.events.map((event) => event.type)).toEqual([
      "submitted",
      "characterized",
      "provider_selected",
    ]);

    const missing = await handler(get("/v1/reconstruction/jobs/never-created"));
    expect(missing.status).toBe(404);
    expect(((await missing.json()) as { error: string }).error).toBe("job_not_found");
  });

  test("run drives the lifecycle synchronously and exposes artifacts", async () => {
    const orchestrator = makeOrchestrator();
    const handler = handlerWith(orchestrator);
    const created = (await (await handler(postJson("/v1/reconstruction/jobs", jobBody()))).json()) as JobBody;
    const jobId = created.job.jobId;

    const run = await handler(postJson(`/v1/reconstruction/jobs/${jobId}/run`, "{}"));
    expect(run.status).toBe(200);
    const runBody = (await run.json()) as JobBody;
    expect(runBody.job.state).toBe("succeeded");
    expect(runBody.job.artifactIds.length).toBe(1);
    // Running a completed job starts a new cycle (append-only versioning).
    const rerun = await handler(postJson(`/v1/reconstruction/jobs/${jobId}/run`, "{}"));
    const rerunBody = (await rerun.json()) as JobBody;
    expect(rerunBody.job.artifactIds.length).toBe(2);

    const artifactId = rerunBody.job.artifactIds[1] ?? "";
    const artifact = await handler(get(`/v1/reconstruction/artifacts/${artifactId}`));
    expect(artifact.status).toBe(200);
    const artifactBody = (await artifact.json()) as {
      ok: boolean;
      artifact: { artifactId: string; jobId: string; providerId: string; version: number; regions: unknown[] };
    };
    expect(artifactBody.ok).toBe(true);
    expect(artifactBody.artifact.artifactId).toBe(artifactId);
    expect(artifactBody.artifact.jobId).toBe(jobId);
    expect(artifactBody.artifact.providerId).toBe("fake-mesh");
    expect(artifactBody.artifact.version).toBe(2);
    expect(artifactBody.artifact.regions.length).toBe(2);

    const unknownRun = await handler(postJson("/v1/reconstruction/jobs/never-created/run", "{}"));
    expect(unknownRun.status).toBe(404);
    const unknownArtifact = await handler(get("/v1/reconstruction/artifacts/never-stored"));
    expect(unknownArtifact.status).toBe(404);
    expect(((await unknownArtifact.json()) as { error: string }).error).toBe("artifact_not_found");
  });
});

/* ------------------------------------------------------------------ */
/* Default server wiring                                                */
/* ------------------------------------------------------------------ */

describe("reconstruction HTTP surface: default server wiring", () => {
  test("serves reconstruction routes without injection; empty providers fail UNAVAILABLE explicitly", async () => {
    await withTempDir(async (root) => {
      const handler = createRequestHandler({
        envSource: (): EnvRecord => ({ ...validEnv, AISE_DATA_DIR: join(root, "wired-data") }),
        version: pkg.version,
        logger: quietLogger,
        capture: createCaptureGateway({ store: new InMemoryCaptureStore(), clock: fixedClock }),
      });
      // Health traffic never constructs the default reconstruction stores.
      const health = await handler(get("/healthz"));
      expect(health.status).toBe(200);

      const response = await handler(
        postJson("/v1/reconstruction/jobs", jobBody(), { "x-request-id": "corr-default-recon" }),
      );
      expect(response.status).toBe(200);
      expect(response.headers.get("x-request-id")).toBe("corr-default-recon");
      const body = (await response.json()) as JobBody;
      // Reconstruction is a documented no-op without providers: the job
      // exists and fails UNAVAILABLE with a remediation note.
      expect(body.job.state).toBe("failed");
      expect(body.job.failure?.code).toBe("UNAVAILABLE");
    });
  });

  test("default wiring persists job records under AISE_DATA_DIR/reconstruction", async () => {
    await withTempDir(async (root) => {
      const dataDir = join(root, "wired-data-2");
      const handler = createRequestHandler({
        envSource: (): EnvRecord => ({ ...validEnv, AISE_DATA_DIR: dataDir }),
        version: pkg.version,
        logger: quietLogger,
        capture: createCaptureGateway({ store: new InMemoryCaptureStore(), clock: fixedClock }),
      });
      await handler(postJson("/v1/reconstruction/jobs", jobBody()));
      const jobsDir = join(dataDir, "reconstruction", "jobs");
      const files = readdirSync(jobsDir).filter((file) => file.endsWith(".json"));
      expect(files.length).toBe(1);
      // The injected wiring path (fs stores) round-trips through the same code.
      const orchestrator = createReconstructionOrchestrator({
        providers: [new FakeMeshProvider()],
        jobStore: new FsJobStore(dataDir),
        artifactStore: new FsArtifactStore(dataDir),
        clock: fixedClock,
        idFactory: sequencedIdFactory("id"),
        logger: quietLogger,
      });
      const record = await orchestrator.submit(makeRequest({ evidenceSeeds: ["fs-wiring"] }));
      expect(record.state).toBe("dispatching");
    });
  });
});
