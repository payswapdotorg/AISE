/**
 * HttpWorldSculptBackend tests (AISE-012): failure semantics with INJECTED
 * fetch stubs — NO network calls are performed. Covers the spec's failure
 * mapping (timeout/5xx → EXECUTION_FAILED; 401/403 → ACCESS_REQUIRED;
 * 404/503 → UNAVAILABLE; 4xx → INPUT_INCOMPATIBLE), credential hygiene (the
 * API key value NEVER appears in any outcome — only the env var NAME) and
 * deterministic wire serialization.
 */

import { describe, expect, test } from "bun:test";
import { Buffer } from "node:buffer";
import {
  HttpWorldSculptBackend,
  type FetchLike,
  type HttpWorldSculptBackendConfig,
  type WorldSculptInferenceRequest,
  type WorldSculptInferenceResponse,
} from "./backend";

const ENDPOINT = "https://worldsculpt.invalid/v1/reconstruct";
const API_KEY_ENV_VAR = "WORLDSCULPT_API_KEY";
const SECRET_VALUE = "sekret-key-value-012";

const CONFIG: HttpWorldSculptBackendConfig = {
  endpointUrl: ENDPOINT,
  timeoutMs: 30_000,
  apiKeyEnvVar: API_KEY_ENV_VAR,
};

const REQUEST: WorldSculptInferenceRequest = {
  captureSessionId: "session-capture-1",
  frames: [
    {
      evidenceContentId: "a".repeat(64),
      bytes: new TextEncoder().encode("frame-bytes"),
      note: null,
    },
    { evidenceContentId: "b".repeat(64), bytes: null, note: "references-only" },
  ],
  cameraIntrinsics: null,
  cameraPoses: [],
  coordinateFrame: "worldsculpt-y-up-metric",
  scaleMode: "metric-meters",
  requestedScope: ["object_candidates"],
  timeoutMs: 30_000,
  modelCheckpoint: null,
};

/** Backend with fetch + env injected; captures the last fetch init. */
function makeBackend(
  fetchImpl: FetchLike,
  env: Record<string, string> = { [API_KEY_ENV_VAR]: SECRET_VALUE },
): { backend: HttpWorldSculptBackend; seen: { url?: string; init?: Parameters<FetchLike>[1] } } {
  const seen: { url?: string; init?: Parameters<FetchLike>[1] } = {};
  const backend = new HttpWorldSculptBackend(
    CONFIG,
    (url, init) => {
      seen.url = url;
      seen.init = init;
      return fetchImpl(url, init);
    },
    (name) => env[name],
  );
  return { backend, seen };
}

const jsonResponse = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

describe("HttpWorldSculptBackend: failure semantics (injected fetch, no network)", () => {
  test("timeout → EXECUTION_FAILED with endpoint/timeout/duration diagnostics and no secret", async () => {
    const { backend } = makeBackend(async () => {
      throw new DOMException("signal timed out", "TimeoutError");
    });
    const outcome = await backend.invoke(REQUEST);
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.code).toBe("EXECUTION_FAILED");
      expect(outcome.detail).toContain("timed out after 30000ms");
      expect(outcome.diagnostics.endpointUrl).toBe(ENDPOINT);
      expect(outcome.diagnostics.timeoutMs).toBe(30_000);
      expect(outcome.diagnostics.reason).toBe("timeout");
      expect(typeof outcome.diagnostics.durationMs).toBe("number");
    }
    expect(JSON.stringify(outcome)).not.toContain(SECRET_VALUE);
  });

  test("network TypeError → EXECUTION_FAILED (network-error)", async () => {
    const { backend } = makeBackend(async () => {
      throw new TypeError("fetch failed");
    });
    const outcome = await backend.invoke(REQUEST);
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.code).toBe("EXECUTION_FAILED");
      expect(outcome.diagnostics.reason).toBe("network-error");
      expect(outcome.diagnostics.endpointUrl).toBe(ENDPOINT);
    }
    expect(JSON.stringify(outcome)).not.toContain(SECRET_VALUE);
  });

  test("403 → ACCESS_REQUIRED with endpoint and http status", async () => {
    const { backend } = makeBackend(async () => jsonResponse(403, { error: "forbidden" }));
    const outcome = await backend.invoke(REQUEST);
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.code).toBe("ACCESS_REQUIRED");
      expect(outcome.detail).toContain("HTTP 403");
      expect(outcome.diagnostics.endpointUrl).toBe(ENDPOINT);
      expect(outcome.diagnostics.httpStatus).toBe(403);
    }
  });

  test("503 → UNAVAILABLE", async () => {
    const { backend } = makeBackend(async () => new Response("overloaded", { status: 503 }));
    const outcome = await backend.invoke(REQUEST);
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.code).toBe("UNAVAILABLE");
      expect(outcome.diagnostics.httpStatus).toBe(503);
    }
  });

  test("404 → UNAVAILABLE", async () => {
    const { backend } = makeBackend(async () => jsonResponse(404, { error: "no route" }));
    const outcome = await backend.invoke(REQUEST);
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.code).toBe("UNAVAILABLE");
    }
  });

  test("400 (input rejection) → INPUT_INCOMPATIBLE", async () => {
    const { backend } = makeBackend(async () => jsonResponse(400, { error: "bad frames" }));
    const outcome = await backend.invoke(REQUEST);
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.code).toBe("INPUT_INCOMPATIBLE");
      expect(outcome.detail).toContain("HTTP 400");
    }
  });

  test("500 → EXECUTION_FAILED", async () => {
    const { backend } = makeBackend(async () => jsonResponse(500, { error: "engine crash" }));
    const outcome = await backend.invoke(REQUEST);
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.code).toBe("EXECUTION_FAILED");
      expect(outcome.diagnostics.httpStatus).toBe(500);
    }
  });

  test("200 with a typed failure body passes the failure through verbatim", async () => {
    const { backend } = makeBackend(async () =>
      jsonResponse(200, { ok: false, code: "QUALITY_INSUFFICIENT", detail: "insufficient overlap", diagnostics: {} }),
    );
    const outcome = await backend.invoke(REQUEST);
    expect(outcome).toEqual({
      ok: false,
      code: "QUALITY_INSUFFICIENT",
      detail: "insufficient overlap",
      diagnostics: {},
    });
  });

  test("200 with a non-JSON body → EXECUTION_FAILED (non-json-body)", async () => {
    const { backend } = makeBackend(async () => new Response("<html>gateway</html>", { status: 200 }));
    const outcome = await backend.invoke(REQUEST);
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.code).toBe("EXECUTION_FAILED");
      expect(outcome.diagnostics.reason).toBe("non-json-body");
    }
  });

  test("configured API key env var that is unset → ACCESS_REQUIRED naming the env var NAME only", async () => {
    let fetchCalled = false;
    const { backend } = makeBackend(
      async () => {
        fetchCalled = true;
        return jsonResponse(200, { ok: true });
      },
      {},
    );
    const outcome = await backend.invoke(REQUEST);
    expect(fetchCalled).toBe(false);
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.code).toBe("ACCESS_REQUIRED");
      expect(outcome.detail).toContain(API_KEY_ENV_VAR);
      expect(outcome.diagnostics.apiKeyEnvVar).toBe(API_KEY_ENV_VAR);
    }
    expect(JSON.stringify(outcome)).not.toContain(SECRET_VALUE);
  });
});

describe("HttpWorldSculptBackend: request invocation shape", () => {
  test("POSTs a deterministic wire body: frames as references with base64 inline bytes", async () => {
    const { backend, seen } = makeBackend(async () =>
      jsonResponse(200, { ok: true, objectCandidates: [] }),
    );
    await backend.invoke(REQUEST);
    expect(seen.url).toBe(ENDPOINT);
    expect(seen.init?.method).toBe("POST");
    expect(seen.init?.headers.authorization).toBe(`Bearer ${SECRET_VALUE}`);
    expect(seen.init?.signal).toBeInstanceOf(AbortSignal);
    const body = JSON.parse(seen.init?.body ?? "{}") as {
      frames: { evidenceContentId: string; bytesBase64: string | null; note: string | null }[];
      coordinateFrame: string;
      timeoutMs: number;
    };
    expect(body.frames[0]?.bytesBase64).toBe(Buffer.from("frame-bytes").toString("base64"));
    expect(body.frames[0]?.evidenceContentId).toBe("a".repeat(64));
    expect(body.frames[1]?.bytesBase64).toBeNull();
    expect(body.frames[1]?.note).toBe("references-only");
    expect(body.coordinateFrame).toBe("worldsculpt-y-up-metric");
    expect(body.timeoutMs).toBe(30_000);
  });

  test("a successful typed response body passes through", async () => {
    const success: WorldSculptInferenceResponse = {
      ok: true,
      modelIdentity: "ws-checkpoint-2026-01",
      checkpointId: "ckpt-77",
      objectCandidates: [],
      registrationDiagnostics: {},
      qualityMetrics: {},
      uncertainty: [],
      executionEnvironment: { backend: "http", engineId: "worldsculpt", engineVersion: "0.4.0", hardware: "gpu" },
    };
    const { backend } = makeBackend(async () => jsonResponse(200, success));
    const outcome = await backend.invoke(REQUEST);
    expect(outcome).toEqual(success);
    expect(JSON.stringify(outcome)).not.toContain(SECRET_VALUE);
  });

  test("backendId identifies the backend for execution metadata", () => {
    const { backend } = makeBackend(async () => jsonResponse(200, { ok: true }));
    expect(backend.backendId).toBe("http");
  });
});
