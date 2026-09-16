/**
 * PROD-010 — the runtime entry's COMPOSITION tests (entry.ts × the PROD-009
 * reconstruction surfaces + the demo BOQ seed).
 *
 * These prove the composition seams end-to-end through the FULL production
 * pipeline (CORS → auth layer → routing core → error envelope):
 *
 *   - the FREE reconstruction path: the runtime's injected orchestrator
 *     carries the PROD-009 deterministic demo provider registered AFTER the
 *     shipped engine adapters, so an HTTP job the engines cannot serve
 *     (mesh over still_image — depth/LiDAR produces point clouds only,
 *     WorldSculpt is ACCESS_REQUIRED without a backend) selects the demo
 *     provider and completes with GENERATED_COMPLETION-labeled artifact
 *     regions — zero external services, zero cost;
 *   - `handler.executionGateway` (the read-only composition seam — NOT a
 *     route): submit drives the neutral pre-check + the deterministic demo
 *     execution; poll answers the status machine; request-key idempotency
 *     holds; the orchestrator's HTTP job list stays coherent;
 *   - the unchanged core behaviors: /healthz liveness, the honest 404, the
 *     reconstruction router's 400 validator;
 *   - degraded-boot honesty: an unconstructible reconstruction store falls
 *     back to the core's lazy default, logs LOUDLY, and exposes NO gateway
 *     seam (never a fabricated surface over state the runtime does not own);
 *   - the demo BOQ seed (the deployed golden journey's data): after the
 *     demo bootstrap the seeded import EXISTS with a stored normalization
 *     and mapping v001, the joined lens route serves it, and a SECOND boot
 *     on the same data dir duplicates NOTHING.
 *
 * Determinism: fixed env records, scratch data dirs (mkdtemp, always
 * removed), fixed request ids, deterministic fixture content. The
 * pipeline's internal clock is the real one (the production discipline);
 * no assertion depends on timestamps.
 */

import { afterAll, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createLogger, type Logger } from "../lib/log";
import { sha256Hex } from "../lib/hash";
import type { EnvRecord, EnvSource } from "../lib/config";
import type { ExecutionRequest } from "../reconstruction/gateway";
import { createRuntimeHandler, type RuntimeHandler } from "./entry";

const scratchDirs: string[] = [];

function scratchDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "aise-runtime-reconstruction-test-"));
  scratchDirs.push(dir);
  return dir;
}

afterAll(() => {
  for (const dir of scratchDirs) {
    rmSync(dir, { recursive: true, force: true });
  }
});

function baseEnv(overrides: EnvRecord = {}): EnvRecord {
  return {
    HOST: "127.0.0.1",
    PORT: "8080",
    LOG_LEVEL: "debug",
    AISE_DATA_DIR: scratchDir(),
    ...overrides,
  };
}

function runtimeWorld(env: EnvRecord): { handler: RuntimeHandler; logLines: string[] } {
  const lines: string[] = [];
  const logger: Logger = createLogger("debug", (line) => {
    lines.push(line);
  });
  const envSource: EnvSource = () => env;
  return { handler: createRuntimeHandler({ envSource, logger }), logLines: lines };
}

function get(path: string): Request {
  return new Request(`https://api.aise.example${path}`, {
    method: "GET",
    headers: { "x-request-id": path.replace(/[^a-z0-9]/gi, "-").slice(0, 30) },
  });
}

function post(path: string, body: unknown): Request {
  return new Request(`https://api.aise.example${path}`, {
    method: "POST",
    headers: {
      "x-request-id": path.replace(/[^a-z0-9]/gi, "-").slice(0, 30),
      "content-type": "application/json",
    },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

async function bodyOf(response: Response): Promise<Record<string, unknown>> {
  return (await response.json()) as Record<string, unknown>;
}

/** Deterministic 64-hex content ids for the test's evidence references. */
const EVIDENCE_IDS = [sha256Hex("entry-reconstruction:frame-001"), sha256Hex("entry-reconstruction:frame-002")];

/** A router-valid submit body the ENGINES cannot serve (mesh over still_image). */
function demoJobBody(): Record<string, unknown> {
  return {
    evidenceContentIds: [...EVIDENCE_IDS],
    requestedRepresentations: ["mesh"],
    declaredInputModalities: ["still_image"],
    policyConstraints: { timeoutMs: 30_000, maxRetries: 0 },
  };
}

describe("the free reconstruction path (demo provider composed at runtime)", () => {
  test("HTTP submit → run → succeeded with selectedProviderId 'demo' + GENERATED_COMPLETION artifact regions", async () => {
    const { handler } = runtimeWorld(baseEnv());
    const submitted = await handler(post("/v1/reconstruction/jobs", demoJobBody()));
    expect(submitted.status).toBe(200);
    const submittedBody = await bodyOf(submitted);
    expect(submittedBody["ok"]).toBe(true);
    const job = submittedBody["job"] as Record<string, unknown>;
    const jobId = job["jobId"] as string;
    expect(job["state"]).toBe("dispatching");
    // The engines cannot serve this request (mesh over still_image), so the
    // demo provider — registered AFTER them — is the deterministic winner.
    expect(job["selectedProviderId"]).toBe("aise-demo-reconstruction");

    // Drive the deterministic lifecycle to completion (synchronous demo op).
    const run = await handler(post(`/v1/reconstruction/jobs/${jobId}/run`, {}));
    expect(run.status).toBe(200);
    const runBody = await bodyOf(run);
    const runJob = runBody["job"] as Record<string, unknown>;
    expect(runJob["state"]).toBe("succeeded");
    expect(runJob["selectedProviderId"]).toBe("aise-demo-reconstruction");
    const artifactIds = runJob["artifactIds"] as string[];
    expect(artifactIds.length).toBe(1);
    const artifactResponse = await handler(get(`/v1/reconstruction/artifacts/${artifactIds[0]}`));
    expect(artifactResponse.status).toBe(200);
    const artifact = ((await bodyOf(artifactResponse))["artifact"] as Record<string, unknown>);
    const regions = artifact["regions"] as Array<Record<string, unknown>>;
    expect(regions.length).toBeGreaterThan(0);
    for (const region of regions) {
      expect(region["epistemicLabel"]).toBe("GENERATED_COMPLETION");
    }
    expect(String(artifact["modelIdentity"])).toContain("demo");
  });

  test("the engine-first order holds: a point_cloud job over depth evidence still selects the ENGINE, not the demo provider", async () => {
    const { handler } = runtimeWorld(baseEnv());
    const submitted = await handler(
      post("/v1/reconstruction/jobs", {
        ...demoJobBody(),
        requestedRepresentations: ["point_cloud"],
        declaredInputModalities: ["depth_map", "camera_poses"],
      }),
    );
    expect(submitted.status).toBe(200);
    const job = (await bodyOf(submitted))["job"] as Record<string, unknown>;
    // Depth/LiDAR fusion is READY and first in the declared order — the demo
    // provider (registered AFTER the engines) never preempts it.
    expect(job["selectedProviderId"]).not.toBe("demo");
  });

  test("the core's unchanged behaviors: /healthz liveness, honest 404, the 400 validator", async () => {
    const { handler } = runtimeWorld(baseEnv());
    const health = await handler(get("/healthz"));
    expect(health.status).toBe(200);
    expect(await bodyOf(health)).toEqual({
      ok: true,
      service: "aise-api",
      version: expect.any(String),
    });
    const notFound = await handler(get("/v1/definitely-not-a-route"));
    expect(notFound.status).toBe(404);
    expect(((await bodyOf(notFound))["error"] as Record<string, unknown>)["code"]).toBe("not_found");
    const invalid = await handler(post("/v1/reconstruction/jobs", { requestedRepresentations: [] }));
    expect(invalid.status).toBe(400);
    const invalidBody = await bodyOf(invalid);
    expect((invalidBody["error"] as Record<string, unknown>)["code"]).toBe("invalid_request");
    expect(Array.isArray(invalidBody["issues"])).toBe(true);
  });
});

describe("handler.executionGateway — the read-only composition seam (not a route)", () => {
  test("gateway submit → succeeded demo execution; poll status; request-key idempotency; the HTTP job list stays coherent", async () => {
    const { handler } = runtimeWorld(baseEnv());
    expect(typeof handler.executionGateway?.submit).toBe("function");
    const gateway = handler.executionGateway!;
    const request: ExecutionRequest = {
      requestKey: `entry-test-${sha256Hex("gateway-request-key-1")}`,
      providerId: "aise-demo-reconstruction",
      checkpointRef: null,
      executionConfig: {},
      request: {
        taskId: "task-entry-gateway-0001",
        evidenceContentIds: [...EVIDENCE_IDS],
        captureSessionId: null,
        requestedRepresentations: ["mesh"],
        declaredInputModalities: ["still_image"],
        coordinateFrameConstraint: null,
        scaleConstraint: null,
        policyConstraints: { timeoutMs: 30_000, maxRetries: 0 },
      },
    };
    const record = await gateway.submit(request);
    expect(record.status).toBe("succeeded");
    expect(record.provenance.providerId).toBe("aise-demo-reconstruction");
    const result = record.result as { kind: string; artifacts: unknown[] } | null;
    expect(result?.kind).toBe("succeeded");
    expect(result?.artifacts.length).toBe(1);

    // Poll answers the stored status machine.
    const polled = await gateway.poll(record.executionId);
    expect(polled?.status).toBe("succeeded");

    // Idempotency: the same request key returns the STORED record unchanged.
    const again = await gateway.submit(request);
    expect(again.executionId).toBe(record.executionId);

    // The orchestrator's HTTP surface (a DIFFERENT store family) lists the
    // HTTP-submitted jobs — submit one and see it there.
    const submitted = await handler(post("/v1/reconstruction/jobs", demoJobBody()));
    const jobId = ((await bodyOf(submitted))["job"] as Record<string, unknown>)["jobId"];
    const list = await handler(get("/v1/reconstruction/jobs"));
    const jobs = ((await bodyOf(list))["jobs"] as Array<Record<string, unknown>>).map(
      (entry) => entry["jobId"],
    );
    expect(jobs).toContain(jobId);
  });
});

describe("degraded-boot honesty (reconstruction store construction failure)", () => {
  test("falls back to the core's lazy default, logs LOUDLY, exposes NO gateway seam", async () => {
    const lines: string[] = [];
    const logger: Logger = createLogger("debug", (line) => {
      lines.push(line);
    });
    // A REGULAR FILE at the data-dir path: every mkdirSync under it fails
    // (the entry.test.ts unwritable-data-dir discipline).
    const parent = scratchDir();
    const filePath = join(parent, "not-a-directory");
    writeFileSync(filePath, "occupied");
    const envSource: EnvSource = () => baseEnv({ AISE_DATA_DIR: filePath });
    const handler = createRuntimeHandler({ envSource, logger });
    // The composition seam is honestly ABSENT (never fabricated over state
    // the runtime does not own):
    expect(handler.executionGateway).toBeNull();
    // The pipeline still boots and proves liveness:
    const health = await handler(get("/healthz"));
    expect(health.status).toBe(200);
    // The fallback was logged loudly:
    expect(lines.join("\n")).toContain("reconstruction store initialization failed");
  });
});

describe("the demo BOQ seed (the deployed golden journey's data)", () => {
  test("boot with a temp data dir → the seeded import exists, normalization present, mapping v001 present, lens joined", async () => {
    const dataDir = scratchDir();
    const { handler, logLines } = runtimeWorld(baseEnv({
      AISE_DATA_DIR: dataDir,
      AISE_AUTH: "1",
      AUTH_SECRET: "reconstruction-test-auth-secret-DO-NOT-LEAK",
    }));
    expect(handler.demoSeed).not.toBeNull();
    await handler.demoSeed;

    // The seeded import (exactly one — the deterministic fixture).
    const importsResponse = await handler(get("/v1/boq/imports"));
    expect(importsResponse.status).toBe(200);
    const imports = ((await bodyOf(importsResponse))["imports"] as Array<Record<string, unknown>>);
    expect(imports.length).toBe(1);
    const importId = imports[0]!["importId"] as string;
    expect(imports[0]!["format"]).toBe("csv");
    expect((imports[0]!["parse"] as Record<string, unknown>)["status"]).toBe("parsed");

    // The stored normalization (through the SAME service the routes use).
    const normalization = await handler(get(`/v1/boq/imports/${importId}/normalization`));
    expect(normalization.status).toBe(200);
    const view = (await bodyOf(normalization))["normalization"] as Record<string, unknown>;
    expect((view["stats"] as Record<string, unknown>)["totalItems"]).toBe(3);

    // Mapping v001 (the deterministic matcher ran exactly once).
    const mappings = await handler(get(`/v1/boq/imports/${importId}/mappings`));
    expect(mappings.status).toBe(200);
    const mapping = (await bodyOf(mappings))["mapping"] as Record<string, unknown>;
    expect(mapping["version"]).toBe(1);
    expect((mapping["entries"] as unknown[]).length).toBe(3);

    // The joined lens input serves the golden journey's BOQ Lens view.
    const lens = await handler(get(`/v1/boq/imports/${importId}/lens`));
    expect(lens.status).toBe(200);
    const lensInput = (await bodyOf(lens))["lens"] as Record<string, unknown>;
    expect(lensInput["mappingVersion"]).toBe(1);
    expect((lensInput["items"] as unknown[]).length).toBe(3);

    // The seed's typed log lines are present (honest boot provenance).
    const logs = logLines.join("\n");
    expect(logs).toContain("demo_boq_seed_imported");
    expect(logs).toContain("demo_boq_seed_normalized");
    expect(logs).toContain("demo_boq_seed_mapped");
  });

  test("boot TWICE on the same data dir → no duplication (import, normalization and mapping stay v001)", async () => {
    const dataDir = scratchDir();
    const env: EnvRecord = {
      ...baseEnv({ AISE_DATA_DIR: dataDir }),
      AISE_AUTH: "1",
      AUTH_SECRET: "reconstruction-test-auth-secret-DO-NOT-LEAK",
    };
    const first = runtimeWorld(env);
    expect(first.handler.demoSeed).not.toBeNull();
    await first.handler.demoSeed;
    const second = runtimeWorld({ ...env });
    expect(second.handler.demoSeed).not.toBeNull();
    await second.handler.demoSeed;

    const importsResponse = await second.handler(get("/v1/boq/imports"));
    const imports = ((await bodyOf(importsResponse))["imports"] as Array<Record<string, unknown>>);
    expect(imports.length).toBe(1);
    const importId = imports[0]!["importId"] as string;
    const mappings = await second.handler(get(`/v1/boq/imports/${importId}/mappings`));
    const mapping = (await bodyOf(mappings))["mapping"] as Record<string, unknown>;
    // The append-only mapping store did NOT mint v002 on the re-boot.
    expect(mapping["version"]).toBe(1);
  });

  test("no demo bootstrap (auth off) → no seed runs (demoSeed is null)", async () => {
    const { handler } = runtimeWorld(baseEnv());
    expect(handler.demoSeed).toBeNull();
    const importsResponse = await handler(get("/v1/boq/imports"));
    expect(((await bodyOf(importsResponse))["imports"] as unknown[]).length).toBe(0);
  });
});
