/**
 * Runtime entry R2 artifact wiring tests — PROD-006 (offline, deterministic).
 *
 * The wiring contract (runtime/entry.ts, additive):
 *  - R2_* env group COMPLETE → the R2 adapter serves /v1/artifacts (status
 *    reports the r2 backend; construction performs NO network I/O) and
 *    /readyz reports `artifacts: {backend: "r2", status: "available"}`;
 *  - group ABSENT → the honest local-fs twin under the data dir, readiness
 *    says `artifacts: {backend: "local-fs", status: "available"}`;
 *  - group PARTIAL → the loud unavailable wiring: artifact routes answer
 *    503 with the stable envelope and readiness reports
 *    `artifacts: {backend: "r2", status: "unavailable"}` — never a silent
 *    fallback (the boot itself stays honest: /healthz still answers).
 *
 * No test touches the network: the R2 adapter's status/readiness surfaces
 * perform no I/O, and the partial-group upload is rejected by the injected
 * unavailable stores before any fetch.
 */

import { describe, expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { EnvRecord, EnvSource } from "../lib/config";
import { createRuntimeHandler } from "./entry";

const COMPLETE_R2: EnvRecord = {
  R2_ACCOUNT_ID: "test-account",
  R2_BUCKET: "test-bucket",
  R2_ACCESS_KEY_ID: "test-access-key",
  R2_SECRET_ACCESS_KEY: "test-secret",
};

function envWith(overrides: EnvRecord): EnvSource {
  // ONE data dir per handler (envSource is called several times per boot —
  // each call must see the SAME record, never a fresh temp dir).
  const dataDir = mkdtempSync(join(tmpdir(), "aise-entry-artifacts-"));
  const env: EnvRecord = { AISE_DATA_DIR: dataDir, ...overrides };
  return () => env;
}

function get(handler: (request: Request) => Promise<Response>, path: string): Promise<Response> {
  return handler(new Request(`http://localhost${path}`, { method: "GET" }));
}

async function postArtifact(
  handler: (request: Request) => Promise<Response>,
): Promise<Response> {
  return handler(
    new Request("http://localhost/v1/artifacts", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-aise-project-id": "proj-a",
        "x-aise-kind": "boq",
      },
      body: "x",
    }),
  );
}

describe("runtime entry artifact wiring (PROD-006)", () => {
  test("R2 group complete → /v1/artifacts/status reports the r2 backend; /readyz says r2 available", async () => {
    const handler = createRuntimeHandler({ envSource: envWith(COMPLETE_R2) });

    const status = await get(handler, "/v1/artifacts/status");
    expect(status.status).toBe(200);
    const body = (await status.json()) as {
      backend: { kind: string; bucket: string; endpoint: string };
    };
    expect(body.backend).toEqual({
      kind: "r2",
      bucket: "test-bucket",
      endpoint: "https://test-account.r2.cloudflarestorage.com",
    });
    // Credentials never surface in any status body.
    expect(JSON.stringify(body)).not.toContain("test-access-key");
    expect(JSON.stringify(body)).not.toContain("test-secret");

    const ready = await get(handler, "/readyz");
    expect(ready.status).toBe(200);
    const readyBody = (await ready.json()) as {
      artifacts: { backend: string; status: string };
      providers: Record<string, string>;
    };
    expect(readyBody.artifacts).toEqual({ backend: "r2", status: "available" });
  });

  test("R2 group absent → the local-fs twin serves artifacts; /readyz honestly says local-fs", async () => {
    const handler = createRuntimeHandler({ envSource: envWith({}) });

    const status = await get(handler, "/v1/artifacts/status");
    expect(status.status).toBe(200);
    const body = (await status.json()) as { backend: { kind: string } };
    expect(body.backend.kind).toBe("local-fs");

    const upload = await postArtifact(handler);
    expect(upload.status).toBe(201);

    const ready = await get(handler, "/readyz");
    const readyBody = (await ready.json()) as { artifacts: { backend: string; status: string } };
    expect(readyBody.artifacts).toEqual({ backend: "local-fs", status: "available" });
  });

  test("R2 group partial → artifact routes fail loudly 503; readiness reports unavailable; /healthz stays honest", async () => {
    const handler = createRuntimeHandler({
      envSource: envWith({ R2_ACCOUNT_ID: "test-account", R2_BUCKET: "test-bucket" }),
    });

    const upload = await postArtifact(handler);
    expect(upload.status).toBe(503);
    // Through the runtime pipeline the internal shape is re-enveloped as the
    // documented deployment error envelope (error.code carries the stable
    // snake_case code).
    expect(await upload.json()).toMatchObject({ error: { code: "storage_unavailable" } });

    const status = await get(handler, "/v1/artifacts/status");
    const statusBody = (await status.json()) as {
      backend: { kind: string; reason: string };
    };
    expect(statusBody.backend.kind).toBe("unavailable");
    expect(statusBody.backend.reason).toContain("R2_SECRET_ACCESS_KEY");
    expect(statusBody.backend.reason).toContain("R2_ACCESS_KEY_ID");

    const ready = await get(handler, "/readyz");
    const readyBody = (await ready.json()) as { artifacts: { backend: string; status: string } };
    expect(readyBody.artifacts).toEqual({ backend: "r2", status: "unavailable" });

    const health = await get(handler, "/healthz");
    expect(health.status).toBe(200);
  });

  test("AISE_ARTIFACT_MAX_BYTES reaches the runtime wiring (status reports the configured cap)", async () => {
    const handler = createRuntimeHandler({
      envSource: envWith({ AISE_ARTIFACT_MAX_BYTES: "4096" }),
    });
    const status = await get(handler, "/v1/artifacts/status");
    const body = (await status.json()) as { limits: { maxBytes: number } };
    expect(body.limits).toEqual({ maxBytes: 4096 });

    // And the cap is enforced through the full runtime pipeline.
    const over = await handler(
      new Request("http://localhost/v1/artifacts", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-aise-project-id": "proj-a",
          "x-aise-kind": "boq",
        },
        body: "y".repeat(4097),
      }),
    );
    expect(over.status).toBe(413);
    expect(await over.json()).toMatchObject({ error: { code: "payload_too_large" } });
  });
});
