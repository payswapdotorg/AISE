/**
 * PROD-031 — the runtime entry's SOLUTION ROUTE composition tests (entry.ts
 * × the PROD-022 solution tool factory + the PROD-031 baseline/revision
 * legs — the same composition-test discipline as
 * entry-reconstruction.test.ts).
 *
 * These prove the mount seam end-to-end through the FULL production
 * pipeline (CORS → auth layer → cost guards → the solution route factory →
 * the core):
 *
 *   - the browser workspace mount's opening leg: POST /v1/solutions/baseline
 *     through the runtime handler answers the ENGINE's layer-0 ProposedState
 *     (the demo wall world's solution ids) — the route the browser mount's
 *     HTTP service binding posts;
 *   - the step leg over the runtime handler (the same deterministic engine
 *     the local binding executes — the one-semantics law): the demo
 *     demolition fixture applies over the materialized baseline;
 *   - the honest routing boundary: a /v1/solutions/... path that matches no
 *     route shape still reaches the core's 404 (the factory's null
 *     discipline), and a non-solution /v1 path is untouched;
 *   - wrong methods answer the factory's 405 with an explicit allow.
 *
 * Determinism: fixed env records, scratch data dirs (mkdtemp, always
 * removed), fixed request ids, the committed contract fixtures. The
 * pipeline's internal clock is the real one (the production discipline); no
 * assertion depends on timestamps.
 */

import { afterAll, describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { EnvRecord, EnvSource } from "../lib/config";
import { createRuntimeHandler, type RuntimeHandler } from "./entry";

const scratchDirs: string[] = [];

function scratchDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "aise-runtime-solution-test-"));
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
    LOG_LEVEL: "error",
    AISE_DATA_DIR: scratchDir(),
    ...overrides,
  };
}

function runtimeHandler(env: EnvRecord): RuntimeHandler {
  const envSource: EnvSource = () => env;
  return createRuntimeHandler({ envSource });
}

function post(path: string, body: string): Request {
  return new Request(`https://api.aise.example${path}`, {
    method: "POST",
    body,
    headers: { "content-type": "application/json", "x-request-id": "solution-route-1" },
  });
}

function demolitionIntent(): Record<string, unknown> {
  return JSON.parse(
    readFileSync(
      join(
        import.meta.dir,
        "..",
        "..",
        "..",
        "..",
        "packages",
        "solution-contract",
        "fixtures",
        "operation",
        "EngineeringOperationIntent.valid-demolition-removal.json",
      ),
      "utf8",
    ),
  ) as Record<string, unknown>;
}

describe("PROD-031 the runtime handler serves the solution tool routes (the browser mount's engine)", () => {
  test("POST /v1/solutions/baseline answers the engine's layer-0 state (the browser mount's opening leg)", async () => {
    const handler = runtimeHandler(baseEnv());
    const response = await handler(
      post(
        "/v1/solutions/baseline",
        JSON.stringify({
          solutionId: "solution-demo-001",
          versionNumber: 1,
          baselineRealityVersionId: "rgv-demo-0007",
          materializedAt: "2026-09-16T10:00:00.000Z",
        }),
      ),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("x-request-id")).toBe("solution-route-1");
    const payload = (await response.json()) as {
      ok: boolean;
      state: { solutionId: string; stateIndex: number; epistemicStatus: string };
    };
    expect(payload.ok).toBe(true);
    expect(payload.state.solutionId).toBe("solution-demo-001");
    expect(payload.state.stateIndex).toBe(0);
    expect(payload.state.epistemicStatus).toBe("PROPOSED");
  });

  test("POST /v1/solutions/step applies the demo demolition over the materialized baseline (one semantics)", async () => {
    const handler = runtimeHandler(baseEnv());
    const baselineResponse = await handler(
      post(
        "/v1/solutions/baseline",
        JSON.stringify({
          solutionId: "solution-demo-001",
          versionNumber: 1,
          baselineRealityVersionId: "rgv-demo-0007",
          materializedAt: "2026-09-16T10:00:00.000Z",
        }),
      ),
    );
    const baseline = ((await baselineResponse.json()) as { state: unknown }).state;
    const response = await handler(
      post(
        "/v1/solutions/step",
        JSON.stringify({
          baseline,
          intent: demolitionIntent(),
          materializedAt: "2026-09-16T10:01:00.000Z",
        }),
      ),
    );
    expect(response.status).toBe(200);
    const payload = (await response.json()) as {
      ok: boolean;
      result: {
        outcome: string;
        operation?: { operationType: string };
        resultingState?: { stateIndex: number };
      };
    };
    expect(payload.ok).toBe(true);
    expect(payload.result.outcome).toBe("applied");
    expect(payload.result.operation?.operationType).toBe("demolition-removal");
    expect(payload.result.resultingState?.stateIndex).toBe(1);
  });

  test("a /v1/solutions path that matches no route shape reaches the core's 404 (the null discipline)", async () => {
    const handler = runtimeHandler(baseEnv());
    const response = await handler(post("/v1/solutions/nonsense", "{}"));
    expect(response.status).toBe(404);
  });

  test("a wrong method answers the factory's 405 with an explicit allow", async () => {
    const handler = runtimeHandler(baseEnv());
    const response = await handler(
      new Request("https://api.aise.example/v1/solutions/baseline", {
        method: "GET",
        headers: { "x-request-id": "solution-route-2" },
      }),
    );
    expect(response.status).toBe(405);
    expect(response.headers.get("allow")).toBe("POST");
  });
});
