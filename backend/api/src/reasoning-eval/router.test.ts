/**
 * PROD-028 — the ROUTER tests: the pure route factory exercised directly
 * with fetch-style Request objects (no live server boot, no server.ts
 * edit — the solution-boq/providers router-test discipline).
 *
 * Proves: every endpoint's happy path, the stable status table (400
 * malformed_json, 404 unknown_scenario, 422 typed codes, 200
 * deterministic answers), 405 with an explicit allow, x-request-id
 * correlation, null for non-matching paths and the driven suite's
 * determinism at the HTTP boundary.
 */

import { describe, expect, test } from "bun:test";
import { createLogger } from "../lib/log";
import { ReasoningEvalService } from "./service";
import { handleReasoningEvalRequest, type ReasoningEvalRouteOptions } from "./router";
import { REASONING_EVAL_CATALOG, registryLogForScenario } from "./testkit";

const quietLogger = createLogger("error");

function routes(service: ReasoningEvalService = new ReasoningEvalService()): ReasoningEvalRouteOptions {
  return { service, logger: quietLogger };
}

async function post(
  path: string,
  body: string,
  service?: ReasoningEvalService,
): Promise<Response | null> {
  const request = new Request(`http://localhost${path}`, {
    method: "POST",
    body,
    headers: { "content-type": "application/json" },
  });
  const url = new URL(`http://localhost${path}`);
  return handleReasoningEvalRequest(request, url, "test-request-id", routes(service));
}

async function get(path: string): Promise<Response | null> {
  const request = new Request(`http://localhost${path}`, { method: "GET" });
  const url = new URL(`http://localhost${path}`);
  return handleReasoningEvalRequest(request, url, "test-request-id", routes());
}

interface ErrorBody {
  ok: boolean;
  error: string;
  detail?: string;
}

async function errorBody(response: Response): Promise<ErrorBody> {
  return (await response.json()) as ErrorBody;
}

/* ------------------------------------------------------------------ */

describe("POST /v1/reasoning-eval/catalog/list", () => {
  test("answers 200 with the committed catalog and the correlation header", async () => {
    const response = await post("/v1/reasoning-eval/catalog/list", "{}");
    expect(response).not.toBeNull();
    expect(response?.status).toBe(200);
    expect(response?.headers.get("x-request-id")).toBe("test-request-id");
    const payload = (await response?.json()) as {
      ok: boolean;
      scenarios: { scenarioId: string; lane: string; expectedFailureKind: string }[];
    };
    expect(payload.ok).toBe(true);
    expect(payload.scenarios.length).toBe(26);
    expect(payload.scenarios.some((entry) => entry.scenarioId === "vlm-hallucination")).toBe(true);
  });

  test("the lane filter answers one lane's scenarios", async () => {
    const response = await post(
      "/v1/reasoning-eval/catalog/list",
      JSON.stringify({ lane: "retrieval" }),
    );
    const payload = (await response?.json()) as {
      scenarios: { lane: string }[];
    };
    expect(payload.scenarios.length).toBe(9);
    expect(payload.scenarios.every((entry) => entry.lane === "retrieval")).toBe(true);
  });

  test("an invalid lane answers 422 invalid_request", async () => {
    const response = await post(
      "/v1/reasoning-eval/catalog/list",
      JSON.stringify({ lane: "nope" }),
    );
    expect(response?.status).toBe(422);
    expect((await errorBody(response as Response)).error).toBe("invalid_request");
  });

  test("malformed JSON answers 400 malformed_json", async () => {
    const response = await post("/v1/reasoning-eval/catalog/list", "{not json");
    expect(response?.status).toBe(400);
    expect((await errorBody(response as Response)).error).toBe("malformed_json");
  });

  test("GET is rejected with 405 and an explicit allow", async () => {
    const response = await get("/v1/reasoning-eval/catalog/list");
    expect(response?.status).toBe(405);
    expect(response?.headers.get("allow")).toBe("POST");
  });
});

describe("POST /v1/reasoning-eval/scenario/run", () => {
  test("answers 200 with the full outcome (envelope, classification, record, manifest)", async () => {
    const response = await post(
      "/v1/reasoning-eval/scenario/run",
      JSON.stringify({ scenarioId: "doc-operation-wrong-target" }),
    );
    expect(response?.status).toBe(200);
    const payload = (await response?.json()) as {
      ok: boolean;
      outcome: {
        scenarioId: string;
        classification: string;
        envelope: { resultStatus: string; proposedOperation: { targetEvidenceId: string } | null };
        benchmarkRecord: { recordId: string };
        provenanceManifest: { manifestId: string };
      };
    };
    expect(payload.ok).toBe(true);
    expect(payload.outcome.classification).toBe("operation-semantic-failure");
    expect(payload.outcome.envelope.proposedOperation?.targetEvidenceId).toBe("S2");
    expect(payload.outcome.benchmarkRecord.recordId).toMatch(/^[0-9a-f]{64}$/);
    expect(payload.outcome.provenanceManifest.manifestId).toMatch(/^[0-9a-f]{64}$/);
  });

  test("an unknown scenario answers 404 unknown_scenario", async () => {
    const response = await post(
      "/v1/reasoning-eval/scenario/run",
      JSON.stringify({ scenarioId: "does-not-exist" }),
    );
    expect(response?.status).toBe(404);
    expect((await errorBody(response as Response)).error).toBe("unknown_scenario");
  });

  test("a missing scenarioId answers 422 invalid_request", async () => {
    const response = await post("/v1/reasoning-eval/scenario/run", "{}");
    expect(response?.status).toBe(422);
    expect((await errorBody(response as Response)).error).toBe("invalid_request");
  });
});

describe("POST /v1/reasoning-eval/scenario/evaluate (the HFX consumption path over HTTP)", () => {
  test("a submitted scenario + registry log answers 200 with the outcome", async () => {
    const scenario = REASONING_EVAL_CATALOG.find((entry) => entry.scenarioId === "retrieval-near-miss");
    if (scenario === undefined) {
      throw new Error("test setup: retrieval-near-miss missing");
    }
    const body = JSON.stringify({
      scenario,
      registryLog: registryLogForScenario(scenario),
    });
    const response = await post("/v1/reasoning-eval/scenario/evaluate", body);
    expect(response?.status).toBe(200);
    const payload = (await response?.json()) as {
      ok: boolean;
      outcome: { classification: string; expectedMatch: boolean };
    };
    expect(payload.ok).toBe(true);
    expect(payload.outcome.classification).toBe("retrieval-failure");
    expect(payload.outcome.expectedMatch).toBe(true);
  });

  test("an invalid scenario answers 422 invalid_scenario", async () => {
    const response = await post(
      "/v1/reasoning-eval/scenario/evaluate",
      JSON.stringify({ scenario: { nonsense: true }, registryLog: { profile: {}, execution: {} } }),
    );
    expect(response?.status).toBe(422);
    expect((await errorBody(response as Response)).error).toBe("invalid_scenario");
  });

  test("a missing registry log answers 422 invalid_registry_log", async () => {
    const response = await post(
      "/v1/reasoning-eval/scenario/evaluate",
      JSON.stringify({ scenario: REASONING_EVAL_CATALOG[0] }),
    );
    expect(response?.status).toBe(422);
    expect((await errorBody(response as Response)).error).toBe("invalid_registry_log");
  });
});

describe("POST /v1/reasoning-eval/suite/run", () => {
  test("answers 200 with every outcome and the discrimination coverage table", async () => {
    const response = await post("/v1/reasoning-eval/suite/run", "{}");
    expect(response?.status).toBe(200);
    const payload = (await response?.json()) as {
      ok: boolean;
      outcomes: { scenarioId: string; classification: string }[];
      summary: {
        total: number;
        classificationMatches: number;
        expectedMatches: number;
        discriminationCoverage: Record<string, string[]>;
      };
    };
    expect(payload.ok).toBe(true);
    expect(payload.summary.total).toBe(26);
    expect(payload.summary.classificationMatches).toBe(26);
    expect(payload.summary.expectedMatches).toBe(26);
    expect(payload.summary.discriminationCoverage["multimodal-reasoning"]).toContain(
      "perception-failure",
    );
    expect(payload.outcomes.length).toBe(26);
  });

  test("the suite answer is deterministic across service instances", async () => {
    const first = await post("/v1/reasoning-eval/suite/run", "{}");
    const second = await post("/v1/reasoning-eval/suite/run", "{}");
    const firstText = JSON.stringify(await first?.json());
    const secondText = JSON.stringify(await second?.json());
    expect(firstText.length).toBe(secondText.length);
    const firstRecordIds = JSON.parse(firstText).outcomes.map(
      (outcome: { benchmarkRecord: { recordId: string } }) => outcome.benchmarkRecord.recordId,
    );
    const secondRecordIds = JSON.parse(secondText).outcomes.map(
      (outcome: { benchmarkRecord: { recordId: string } }) => outcome.benchmarkRecord.recordId,
    );
    expect(secondRecordIds).toEqual(firstRecordIds);
  });
});

describe("the router boundary", () => {
  test("non-reasoning-eval paths answer null (the server's default 404 applies)", async () => {
    const response = await post("/v1/providers/registry/query", "{}");
    expect(response).toBeNull();
    const other = await post("/v1/other", "{}");
    expect(other).toBeNull();
  });

  test("unmatched reasoning-eval sub-paths answer null", async () => {
    const response = await post("/v1/reasoning-eval/unknown/route", "{}");
    expect(response).toBeNull();
  });
});
