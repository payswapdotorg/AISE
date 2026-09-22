/**
 * PROD-027 — the Layer-1 evaluation endpoint tests (the PURE route
 * factory, exercised directly with fetch-style Request objects — no live
 * server boot, no server.ts edit; the providers router-test discipline).
 *
 * Proves:
 *  - every endpoint's happy path over HTTP, including the FULL evaluation
 *    lifecycle driven through the router (register → evaluation/start →
 *    scenario/evaluate with the record + manifest in the response body);
 *  - the stable status table: 400 malformed_json, 404 unknown_provider,
 *    422 the typed shape/gate codes (invalid_scenario,
 *    capability_lane_unavailable, normalization_refused, …), 200
 *    deterministic answers, 405 with an explicit allow for wrong methods;
 *  - x-request-id correlation on every response;
 *  - non-reality-eval paths answer null (the server's default 404);
 *  - the driven lifecycle's determinism at the HTTP boundary.
 */

import { describe, expect, test } from "bun:test";
import { createLogger } from "../lib/log";
import { RealityEvalService } from "./service";
import { handleRealityEvalRequest, type RealityEvalRouteOptions } from "./router";
import {
  DEPTH_PROVIDER_ID,
  RECONSTRUCTION_TECHNOLOGY_VERSION_V2,
  executeFixtureProvider,
  fixtureDepthProfileV1,
  fixtureReconstructionProfileV1,
  fixtureReconstructionProfileV2,
  realityEvalScenarioSet,
} from "./testkit";
import { completeScenario } from "./model";
import type { RealityEvalScenario } from "./model";

const quietLogger = createLogger("error");
const SET = realityEvalScenarioSet();

function routes(service: RealityEvalService = new RealityEvalService()): RealityEvalRouteOptions {
  return { service, logger: quietLogger };
}

async function post(
  path: string,
  body: string,
  service?: RealityEvalService,
): Promise<Response | null> {
  const request = new Request(`http://localhost${path}`, {
    method: "POST",
    body,
    headers: { "content-type": "application/json" },
  });
  const url = new URL(`http://localhost${path}`);
  return handleRealityEvalRequest(request, url, "test-request-id", routes(service));
}

async function get(path: string, service?: RealityEvalService): Promise<Response | null> {
  const request = new Request(`http://localhost${path}`, { method: "GET" });
  const url = new URL(`http://localhost${path}`);
  return handleRealityEvalRequest(request, url, "test-request-id", routes(service));
}

function completedScenario(scenarioId: string): RealityEvalScenario {
  const descriptor = SET.scenarios.find((entry) => entry.scenarioId === scenarioId)!;
  const profile =
    descriptor.providerReference.providerId === DEPTH_PROVIDER_ID
      ? fixtureDepthProfileV1()
      : descriptor.providerReference.technologyVersion === RECONSTRUCTION_TECHNOLOGY_VERSION_V2
        ? fixtureReconstructionProfileV2()
        : fixtureReconstructionProfileV1();
  return completeScenario(descriptor, executeFixtureProvider(profile, descriptor.input));
}

/** A service with the fixture providers registered + evaluation-started. */
function startedService(): RealityEvalService {
  const service = new RealityEvalService();
  for (const profile of [
    fixtureReconstructionProfileV1(),
    fixtureReconstructionProfileV2(),
    fixtureDepthProfileV1(),
  ]) {
    service.register({ profile });
    service.startEvaluation({
      providerId: profile.providerId,
      technologyVersion: profile.technologyVersion,
    });
  }
  return service;
}

describe("PROD-027 router: the happy paths over HTTP", () => {
  test("profile/register answers the entry summary", async () => {
    const response = (await post(
      "/v1/reality-eval/profile/register",
      JSON.stringify({ profile: fixtureReconstructionProfileV1() }),
    ))!;
    expect(response.status).toBe(200);
    expect(response.headers.get("x-request-id")).toBe("test-request-id");
    const body = (await response.json()) as Record<string, unknown>;
    expect(body["ok"]).toBe(true);
    const entry = body["entry"] as Record<string, unknown>;
    expect(entry["state"]).toBe("registered");
    expect(entry["capabilities"]).toEqual(["reconstruction"]);
  });

  test("evaluation/start transitions the entry over HTTP", async () => {
    const service = new RealityEvalService();
    service.register({ profile: fixtureReconstructionProfileV1() });
    const response = (await post(
      "/v1/reality-eval/evaluation/start",
      JSON.stringify({
        providerId: "fixture-reconstruction-provider",
        technologyVersion: "1.0.0-fixture-v1",
      }),
      service,
    ))!;
    expect(response.status).toBe(200);
    const body = (await response.json()) as Record<string, unknown>;
    expect((body["entry"] as Record<string, unknown>)["state"]).toBe("evaluation");
  });

  test("scenario/evaluate answers the verdict, the record AND the manifest over HTTP", async () => {
    const response = (await post(
      "/v1/reality-eval/scenario/evaluate",
      JSON.stringify({ scenario: completedScenario("recon-flagship-positive-001") }),
      startedService(),
    ))!;
    expect(response.status).toBe(200);
    const body = (await response.json()) as Record<string, unknown>;
    expect(body["ok"]).toBe(true);
    expect(body["verdict"]).toBe("pass");
    expect(body["discriminationCaught"]).toBe(false);
    const record = body["record"] as Record<string, unknown>;
    expect(record["recordId"]).toMatch(/^[0-9a-f]{64}$/);
    expect(record["benchmarkId"]).toBe("reality-eval-reconstruction/1");
    const manifest = body["manifest"] as Record<string, unknown>;
    expect(manifest["manifestId"]).toMatch(/^[0-9a-f]{64}$/);
    expect(manifest["benchmarkRecordReferences"]).toEqual([record["recordId"]]);
  });

  test("a discrimination scenario over HTTP answers fail + the recorded observations", async () => {
    const response = (await post(
      "/v1/reality-eval/scenario/evaluate",
      JSON.stringify({ scenario: completedScenario("recon-flagship-discrimination-003") }),
      startedService(),
    ))!;
    expect(response.status).toBe(200);
    const body = (await response.json()) as Record<string, unknown>;
    expect(body["verdict"]).toBe("fail");
    expect(body["discriminationCaught"]).toBe(true);
    const observations = body["failureObservations"] as { kind: string }[];
    expect(observations.length).toBeGreaterThan(0);
    expect(observations.every((observation) => observation.kind === "perception-failure")).toBe(
      true,
    );
  });

  test("registry/query answers the derived entry over HTTP", async () => {
    const response = (await post(
      "/v1/reality-eval/registry/query",
      JSON.stringify({ providerId: DEPTH_PROVIDER_ID, technologyVersion: "1.0.0-fixture-v1" }),
      startedService(),
    ))!;
    expect(response.status).toBe(200);
    const body = (await response.json()) as Record<string, unknown>;
    const entries = body["entries"] as Record<string, unknown>[];
    expect(entries[0]!["state"]).toBe("evaluation");
  });

  test("two identical HTTP lifecycles produce identical response bodies (determinism)", async () => {
    const scenario = JSON.stringify({ scenario: completedScenario("depth-wall-positive-005") });
    const first = (await post("/v1/reality-eval/scenario/evaluate", scenario, startedService()))!;
    const second = (await post("/v1/reality-eval/scenario/evaluate", scenario, startedService()))!;
    const firstBody = await first.json();
    const secondBody = await second.json();
    expect(JSON.stringify(secondBody)).toBe(JSON.stringify(firstBody));
  });
});

describe("PROD-027 router: the stable status table", () => {
  test("malformed JSON answers 400 malformed_json", async () => {
    const response = (await post(
      "/v1/reality-eval/scenario/evaluate",
      "{not json",
      startedService(),
    ))!;
    expect(response.status).toBe(400);
    const body = (await response.json()) as Record<string, unknown>;
    expect(body["error"]).toBe("malformed_json");
  });

  test("an unknown provider answers 404 unknown_provider", async () => {
    const response = (await post(
      "/v1/reality-eval/scenario/evaluate",
      JSON.stringify({ scenario: completedScenario("recon-flagship-positive-001") }),
      new RealityEvalService(),
    ))!;
    expect(response.status).toBe(404);
    const body = (await response.json()) as Record<string, unknown>;
    expect(body["error"]).toBe("unknown_provider");
  });

  test("a malformed scenario answers 422 invalid_scenario", async () => {
    const response = (await post(
      "/v1/reality-eval/scenario/evaluate",
      JSON.stringify({ scenario: { scenarioId: "broken" } }),
      startedService(),
    ))!;
    expect(response.status).toBe(422);
    const body = (await response.json()) as Record<string, unknown>;
    expect(body["error"]).toBe("invalid_scenario");
  });

  test("the honest lane refusal answers 422 capability_lane_unavailable", async () => {
    const scenario = completedScenario("recon-flagship-positive-001");
    const gapScenario = JSON.stringify({
      scenario: {
        ...scenario,
        scenarioId: "gap-001",
        capability: "retrieval",
        benchmarkId: "reality-eval-retrieval/1",
        input: { ...scenario.input, capability: "retrieval" },
        expected: { kind: "explicit-refusal" },
        criteria: { thresholds: [], expectedFailureKinds: ["retrieval-failure"] },
      },
    });
    const response = (await post(
      "/v1/reality-eval/scenario/evaluate",
      gapScenario,
      startedService(),
    ))!;
    expect(response.status).toBe(422);
    const body = (await response.json()) as Record<string, unknown>;
    expect(body["error"]).toBe("capability_lane_unavailable");
  });

  test("a provider-specific output type answers 422 normalization_refused (the boundary guard over HTTP)", async () => {
    const scenario = completedScenario("recon-flagship-positive-001");
    const outputs = scenario.declaredExecution.outputs as Record<string, unknown>;
    const response = (await post(
      "/v1/reality-eval/scenario/evaluate",
      JSON.stringify({
        scenario: {
          ...scenario,
          declaredExecution: {
            ...scenario.declaredExecution,
            outputs: { ...outputs, providerSpecificMesh: { vertices: 999 } },
          },
        },
      }),
      startedService(),
    ))!;
    expect(response.status).toBe(422);
    const body = (await response.json()) as Record<string, unknown>;
    expect(body["error"]).toBe("normalization_refused");
  });

  test("an invalid profile answers 422 invalid_profile", async () => {
    const broken = fixtureReconstructionProfileV1() as unknown as Record<string, unknown>;
    delete broken["supportedModalities"];
    const response = (await post(
      "/v1/reality-eval/profile/register",
      JSON.stringify({ profile: broken }),
    ))!;
    expect(response.status).toBe(422);
    const body = (await response.json()) as Record<string, unknown>;
    expect(body["error"]).toBe("invalid_profile");
  });

  test("wrong methods answer 405 with an explicit allow", async () => {
    const response = (await get("/v1/reality-eval/scenario/evaluate"))!;
    expect(response.status).toBe(405);
    expect(response.headers.get("allow")).toBe("POST");
    const body = (await response.json()) as Record<string, unknown>;
    expect(body["error"]).toBe("method_not_allowed");
  });

  test("non-reality-eval paths answer null (the server's default 404 applies)", async () => {
    const request = new Request("http://localhost/v1/providers/registry/query", { method: "POST" });
    const url = new URL("http://localhost/v1/providers/registry/query");
    const answer = await handleRealityEvalRequest(request, url, "test-request-id", routes());
    expect(answer).toBeNull();
    const requestRoot = new Request("http://localhost/healthz", { method: "GET" });
    const urlRoot = new URL("http://localhost/healthz");
    expect(await handleRealityEvalRequest(requestRoot, urlRoot, "test-request-id", routes())).toBeNull();
  });

  test("an unmatched reality-eval sub-path answers null (the server's 404 applies)", async () => {
    const request = new Request("http://localhost/v1/reality-eval/nonsense", { method: "POST" });
    const url = new URL("http://localhost/v1/reality-eval/nonsense");
    expect(await handleRealityEvalRequest(request, url, "test-request-id", routes())).toBeNull();
  });
});
