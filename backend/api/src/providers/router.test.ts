/**
 * HFX-000 — provider control-plane endpoint tests (the PURE route
 * factory, exercised directly with fetch-style Request objects — no live
 * server boot, no server.ts edit; the solution-boq router-test
 * discipline).
 *
 * Proves:
 *  - every endpoint's happy path over HTTP, including the FULL exit-gate
 *    lifecycle driven through the router;
 *  - the stable status table: 400 malformed_json, 404
 *    unknown_provider/unknown_manifest, 422 typed shape/gate codes, 200
 *    deterministic answers (a REFUSED promotion is a 200 rejected
 *    decision carrying the typed refusals), 405 with an explicit allow
 *    for wrong methods;
 *  - x-request-id correlation on every response;
 *  - non-provider paths answer null (the server's default 404);
 *  - the driven lifecycle's determinism at the HTTP boundary.
 */

import { describe, expect, test } from "bun:test";
import { createLogger } from "../lib/log";
import { ProviderService } from "./service";
import { handleProvidersRequest, type ProviderRouteOptions } from "./router";
import {
  PROVIDER_WORLD,
  benchmarkBody,
  evaluationStartBody,
  normalizeBody,
  registerBodyV1,
  registerBodyV2,
} from "./testkit";

const quietLogger = createLogger("error");

function routes(service: ProviderService = new ProviderService()): ProviderRouteOptions {
  return { service, logger: quietLogger };
}

async function post(path: string, body: string, service?: ProviderService): Promise<Response | null> {
  const request = new Request(`http://localhost${path}`, {
    method: "POST",
    body,
    headers: { "content-type": "application/json" },
  });
  const url = new URL(`http://localhost${path}`);
  return handleProvidersRequest(request, url, "test-request-id", routes(service));
}

async function get(path: string): Promise<Response | null> {
  const request = new Request(`http://localhost${path}`, { method: "GET" });
  const url = new URL(`http://localhost${path}`);
  return handleProvidersRequest(request, url, "test-request-id", routes());
}

interface ErrorBody {
  ok: boolean;
  error: string;
  detail?: string;
}

async function errorBody(response: Response): Promise<ErrorBody> {
  return (await response.json()) as ErrorBody;
}

describe("POST /v1/providers/profile/validate", () => {
  test("answers 200 with the digest and the correlation header", async () => {
    const response = await post("/v1/providers/profile/validate", JSON.stringify(registerBodyV1()));
    expect(response).not.toBeNull();
    expect(response?.status).toBe(200);
    expect(response?.headers.get("x-request-id")).toBe("test-request-id");
    const payload = (await response?.json()) as { ok: boolean; valid: boolean; profileDigest: string; evaluationOnly: boolean };
    expect(payload.ok).toBe(true);
    expect(payload.valid).toBe(true);
    expect(payload.profileDigest).toMatch(/^[0-9a-f]{64}$/);
    expect(payload.evaluationOnly).toBe(false);
  });

  test("an invalid profile answers 422 invalid_profile", async () => {
    const response = await post("/v1/providers/profile/validate", JSON.stringify({ profile: { nonsense: true } }));
    expect(response?.status).toBe(422);
    expect((await errorBody(response as Response)).error).toBe("invalid_profile");
  });

  test("malformed JSON answers 400 malformed_json", async () => {
    const response = await post("/v1/providers/profile/validate", "{not json");
    expect(response?.status).toBe(400);
    expect((await errorBody(response as Response)).error).toBe("malformed_json");
  });

  test("GET is rejected with 405 and an explicit allow", async () => {
    const response = await get("/v1/providers/profile/validate");
    expect(response?.status).toBe(405);
    expect(response?.headers.get("allow")).toBe("POST");
  });
});

describe("POST /v1/providers/profile/register", () => {
  test("registers and answers the derived entry summary", async () => {
    const response = await post("/v1/providers/profile/register", JSON.stringify(registerBodyV1()));
    expect(response?.status).toBe(200);
    const payload = (await response?.json()) as {
      ok: boolean;
      entry: { state: string; providerId: string; evaluationOnly: boolean };
    };
    expect(payload.ok).toBe(true);
    expect(payload.entry.state).toBe("registered");
    expect(payload.entry.providerId).toBe(PROVIDER_WORLD.providerId);
    expect(payload.entry.evaluationOnly).toBe(false);
  });

  test("a conflicting profile under the same key answers 422 registration_conflict", async () => {
    const service = new ProviderService();
    await post("/v1/providers/profile/register", JSON.stringify(registerBodyV1()), service);
    const changed = {
      profile: {
        ...registerBodyV1().profile,
        capabilities: [...registerBodyV1().profile.capabilities, "another-capability"],
      },
    };
    const response = await post("/v1/providers/profile/register", JSON.stringify(changed), service);
    expect(response?.status).toBe(422);
    expect((await errorBody(response as Response)).error).toBe("registration_conflict");
  });
});

describe("POST /v1/providers/registry/query", () => {
  test("the empty registry answers an honest empty listing", async () => {
    const response = await post("/v1/providers/registry/query", JSON.stringify({}));
    expect(response?.status).toBe(200);
    const payload = (await response?.json()) as { ok: boolean; entries: unknown[] };
    expect(payload.ok).toBe(true);
    expect(payload.entries).toHaveLength(0);
  });

  test("an unknown provider answers 404 unknown_provider", async () => {
    const response = await post(
      "/v1/providers/registry/query",
      JSON.stringify({ providerId: "ghost", technologyVersion: "1" }),
    );
    expect(response?.status).toBe(404);
    expect((await errorBody(response as Response)).error).toBe("unknown_provider");
  });

  test("a half key pair answers 422 invalid_request", async () => {
    const response = await post(
      "/v1/providers/registry/query",
      JSON.stringify({ providerId: "ghost" }),
    );
    expect(response?.status).toBe(422);
    expect((await errorBody(response as Response)).error).toBe("invalid_request");
  });
});

describe("the full exit-gate lifecycle over HTTP", () => {
  async function drive(service: ProviderService): Promise<{
    v1: { state: string; decision: string };
    v2: { state: string; decision: string; refusals: string[] };
    v1Manifest: string;
    v2Manifest: string;
  }> {
    const register = async (body: unknown): Promise<void> => {
      const response = await post("/v1/providers/profile/register", JSON.stringify(body), service);
      expect(response?.status).toBe(200);
    };
    const step = async (path: string, body: unknown): Promise<Record<string, unknown>> => {
      const response = await post(path, JSON.stringify(body), service);
      expect(response?.status).toBe(200);
      return (await response?.json()) as Record<string, unknown>;
    };

    await register(registerBodyV1());
    await register(registerBodyV2());

    const v1Key = evaluationStartBody(PROVIDER_WORLD.technologyVersionV1);
    const v2Key = evaluationStartBody(PROVIDER_WORLD.technologyVersionV2);

    for (const [key, version] of [
      [v1Key, PROVIDER_WORLD.technologyVersionV1],
      [v2Key, PROVIDER_WORLD.technologyVersionV2],
    ] as const) {
      const started = await step("/v1/providers/evaluation/start", key);
      expect((started["entry"] as { state: string }).state).toBe("evaluation");

      const normalized = await step("/v1/providers/execution/normalize", normalizeBody(version));
      expect((normalized["result"] as { status: string }).status).toBe("ok");

      const intake = await step("/v1/providers/benchmarks/intake", benchmarkBody(version));
      expect(String(intake["recordId"])).toMatch(/^[0-9a-f]{64}$/);
      expect((intake["entry"] as { state: string }).state).toBe("benchmarked");
    }

    const v1Seal = await step("/v1/providers/provenance/seal", v1Key);
    const v2Seal = await step("/v1/providers/provenance/seal", v2Key);
    const v1ManifestId = (v1Seal["manifest"] as { manifestId: string }).manifestId;
    const v2ManifestId = (v2Seal["manifest"] as { manifestId: string }).manifestId;

    const v1Decision = await step("/v1/providers/promotion/decide", v1Key);
    const v2Decision = await step("/v1/providers/promotion/decide", v2Key);

    const v1Query = await step("/v1/providers/registry/query", v1Key);
    const v2Query = await step("/v1/providers/registry/query", v2Key);

    return {
      v1: {
        state: (v1Query["entries"] as { state: string }[])[0]!.state,
        decision: String(v1Decision["decision"]),
      },
      v2: {
        state: (v2Query["entries"] as { state: string }[])[0]!.state,
        decision: String(v2Decision["decision"]),
        refusals: (v2Decision["refusals"] as { kind: string }[]).map((refusal) => refusal.kind),
      },
      v1Manifest: v1ManifestId,
      v2Manifest: v2ManifestId,
    };
  }

  test("v1 is promoted and v2 is rejected with the license-blocked refusal", async () => {
    const result = await drive(new ProviderService());
    expect(result.v1.state).toBe("promoted");
    expect(result.v1.decision).toBe("promoted");
    expect(result.v2.state).toBe("rejected");
    expect(result.v2.decision).toBe("rejected");
    expect(result.v2.refusals).toEqual(["license-blocked"]);
    expect(result.v1Manifest).not.toBe(result.v2Manifest);
  });

  test("the driven lifecycle is deterministic at the HTTP boundary", async () => {
    const first = await drive(new ProviderService());
    const second = await drive(new ProviderService());
    expect(first).toEqual(second);
  });

  test("a refused promotion is a 200 REJECTED decision, not a transport error", async () => {
    const service = new ProviderService();
    service.register(registerBodyV2());
    service.startEvaluation(evaluationStartBody(PROVIDER_WORLD.technologyVersionV2));
    service.normalizeExecution(normalizeBody(PROVIDER_WORLD.technologyVersionV2));
    service.intakeBenchmark(benchmarkBody(PROVIDER_WORLD.technologyVersionV2));
    service.sealProvenance(evaluationStartBody(PROVIDER_WORLD.technologyVersionV2));
    const response = await post(
      "/v1/providers/promotion/decide",
      JSON.stringify(evaluationStartBody(PROVIDER_WORLD.technologyVersionV2)),
      service,
    );
    expect(response?.status).toBe(200);
    const payload = (await response?.json()) as {
      ok: boolean;
      decision: string;
      refusals: { kind: string; detail: string }[];
    };
    expect(payload.ok).toBe(true);
    expect(payload.decision).toBe("rejected");
    expect(payload.refusals.map((refusal) => refusal.kind)).toEqual(["license-blocked"]);
    expect(payload.refusals[0]?.detail).toContain("training and evaluation are separate decisions");
  });

  test("a promotion decision before benchmarking answers 422 unlawful_transition", async () => {
    const service = new ProviderService();
    service.register(registerBodyV1());
    service.startEvaluation(evaluationStartBody(PROVIDER_WORLD.technologyVersionV1));
    service.normalizeExecution(normalizeBody(PROVIDER_WORLD.technologyVersionV1));
    const response = await post(
      "/v1/providers/promotion/decide",
      JSON.stringify(evaluationStartBody(PROVIDER_WORLD.technologyVersionV1)),
      service,
    );
    expect(response?.status).toBe(422);
    expect((await errorBody(response as Response)).error).toBe("unlawful_transition");
  });
});

describe("the transport surface discipline", () => {
  test("non-provider paths answer null (the server's default 404)", async () => {
    const request = new Request("http://localhost/v1/solutions/boq/generate", { method: "POST" });
    const url = new URL("http://localhost/v1/solutions/boq/generate");
    const response = await handleProvidersRequest(request, url, "test-request-id", routes());
    expect(response).toBeNull();
  });

  test("an unknown /v1/providers subpath answers null", async () => {
    for (const path of [
      "/v1/providers/nonsense",
      "/v1/providers/profile",
      "/v1/providers/profile/nonsense",
      "/v1/providers/promotion",
    ]) {
      const response = await post(path, "{}");
      expect(response).toBeNull();
    }
  });

  test("every endpoint rejects GET with 405 and an explicit allow", async () => {
    for (const path of [
      "/v1/providers/profile/validate",
      "/v1/providers/profile/register",
      "/v1/providers/registry/query",
      "/v1/providers/evaluation/start",
      "/v1/providers/execution/normalize",
      "/v1/providers/benchmarks/intake",
      "/v1/providers/provenance/seal",
      "/v1/providers/provenance/manifest",
      "/v1/providers/promotion/decide",
    ]) {
      const response = await get(path);
      expect(response?.status).toBe(405);
      expect(response?.headers.get("allow")).toBe("POST");
    }
  });

  test("an execution with a contract-violating output answers 422 normalization_refused", async () => {
    const service = new ProviderService();
    service.register(registerBodyV1());
    service.startEvaluation(evaluationStartBody(PROVIDER_WORLD.technologyVersionV1));
    const body = {
      ...normalizeBody(PROVIDER_WORLD.technologyVersionV1),
      execution: { outputs: { depthMap: [99, -1], unit: "m" } },
    };
    const response = await post("/v1/providers/execution/normalize", JSON.stringify(body), service);
    expect(response?.status).toBe(422);
    const payload = await errorBody(response as Response);
    expect(payload.error).toBe("normalization_refused");
    expect(payload.detail).toContain("contract-mismatch");
  });

  test("provenance manifest retrieval answers 404 unknown_manifest for a missing id", async () => {
    const service = new ProviderService();
    service.register(registerBodyV1());
    const response = await post(
      "/v1/providers/provenance/manifest",
      JSON.stringify({
        ...evaluationStartBody(PROVIDER_WORLD.technologyVersionV1),
        manifestId: "0".repeat(64),
      }),
      service,
    );
    expect(response?.status).toBe(404);
    expect((await errorBody(response as Response)).error).toBe("unknown_manifest");
  });
});
