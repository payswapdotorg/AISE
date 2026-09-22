/**
 * PROD-029 router tests — the pure route factory over fetch-style Request
 * objects (the solution/solution-boq/providers exemplar: no live server
 * boot; 200 happy paths, 400 malformed JSON, 422 typed codes, 405 with the
 * allow header, null for non-module paths, x-request-id on every response,
 * byte-determinism).
 */

import { describe, expect, test } from "bun:test";
import { createLogger } from "../lib/log";
import { SolutionEvalService } from "./service";
import { handleSolutionEvalRequest } from "./router";
import type { SolutionEvalRouteOptions } from "./router";
import { canonicalEvaluateBodyFor, matrixRunBody, scenarioValidateBody } from "./testkit";

const quietLogger = createLogger("error");

function routes(): SolutionEvalRouteOptions {
  return { service: new SolutionEvalService(), logger: quietLogger };
}

async function post(path: string, body: string): Promise<Response | null> {
  const request = new Request(`http://localhost${path}`, {
    method: "POST",
    body,
    headers: { "content-type": "application/json" },
  });
  const url = new URL(`http://localhost${path}`);
  return handleSolutionEvalRequest(request, url, "test-request-id", routes());
}

async function put(path: string): Promise<Response | null> {
  const request = new Request(`http://localhost${path}`, {
    method: "PUT",
    body: "{}",
    headers: { "content-type": "application/json" },
  });
  const url = new URL(`http://localhost${path}`);
  return handleSolutionEvalRequest(request, url, "test-request-id", routes());
}

interface ErrorBody {
  readonly ok: boolean;
  readonly error: string;
  readonly detail?: string;
}

async function errorBody(response: Response): Promise<ErrorBody> {
  return (await response.json()) as ErrorBody;
}

/* ------------------------------------------------------------------ */
/* Happy paths                                                          */
/* ------------------------------------------------------------------ */

describe("solution-eval router: happy paths", () => {
  test("POST /v1/solution-eval/scenario/validate answers 200 with the scenario echo", async () => {
    const body = JSON.stringify(
      scenarioValidateBody(canonicalEvaluateBodyFor("layer3-compiler-faithful-001")["scenario"]),
    );
    const response = await post("/v1/solution-eval/scenario/validate", body);
    expect(response).not.toBeNull();
    expect(response?.status).toBe(200);
    expect(response?.headers.get("x-request-id")).toBe("test-request-id");
    const payload = (await response?.json()) as { ok: boolean; valid: boolean; scenarioId: string };
    expect(payload.ok).toBe(true);
    expect(payload.valid).toBe(true);
    expect(payload.scenarioId).toBe("layer3-compiler-faithful-001");
  });

  test("POST /v1/solution-eval/substitution/evaluate answers 200 with the full evaluation", async () => {
    const body = JSON.stringify(canonicalEvaluateBodyFor("layer3-validation-divergent-001"));
    const response = await post("/v1/solution-eval/substitution/evaluate", body);
    expect(response).not.toBeNull();
    expect(response?.status).toBe(200);
    const payload = (await response?.json()) as {
      readonly ok: boolean;
      readonly evaluation: {
        readonly verdict: string;
        readonly divergence?: { readonly failureKind: string };
        readonly benchmarkRecord?: { readonly recordId: string };
      };
    };
    expect(payload.ok).toBe(true);
    expect(payload.evaluation.verdict).toBe("divergence-recorded");
    expect(payload.evaluation.divergence?.failureKind).toBe("reasoning-failure");
    expect(payload.evaluation.benchmarkRecord?.recordId).toMatch(/^[0-9a-f]{64}$/);
  });

  test("POST /v1/solution-eval/matrix/run answers 200 with the matrix totals", async () => {
    const response = await post("/v1/solution-eval/matrix/run", JSON.stringify(matrixRunBody()));
    expect(response).not.toBeNull();
    expect(response?.status).toBe(200);
    const payload = (await response?.json()) as {
      readonly ok: boolean;
      readonly totals: { readonly scenarios: number; readonly proven: number; readonly refused: number };
    };
    expect(payload.ok).toBe(true);
    expect(payload.totals.scenarios).toBe(8);
    expect(payload.totals.proven).toBe(4);
    expect(payload.totals.refused).toBe(0);
  });
});

/* ------------------------------------------------------------------ */
/* Typed failures                                                       */
/* ------------------------------------------------------------------ */

describe("solution-eval router: typed failures", () => {
  test("malformed JSON answers 400 malformed_json", async () => {
    const response = await post("/v1/solution-eval/scenario/validate", "{not json");
    expect(response?.status).toBe(400);
    const payload = await errorBody(response as Response);
    expect(payload.ok).toBe(false);
    expect(payload.error).toBe("malformed_json");
  });

  test("an invalid scenario answers 422 invalid_scenario with a machine-readable detail", async () => {
    const response = await post(
      "/v1/solution-eval/scenario/validate",
      JSON.stringify({ scenario: { kind: "wrong" } }),
    );
    expect(response?.status).toBe(422);
    const payload = await errorBody(response as Response);
    expect(payload.error).toBe("invalid_scenario");
    expect(payload.detail).toContain("layer3-substitution-scenario");
  });

  test("a missing registry log answers 422 invalid_request", async () => {
    const body = canonicalEvaluateBodyFor("layer3-boq-faithful-001");
    const withoutLog = { scenario: body["scenario"] };
    const response = await post(
      "/v1/solution-eval/substitution/evaluate",
      JSON.stringify(withoutLog),
    );
    expect(response?.status).toBe(422);
    const payload = await errorBody(response as Response);
    expect(payload.error).toBe("invalid_request");
    expect(payload.detail).toContain("registryLog");
  });

  test("a non-array registry log answers 422 invalid_registry_log", async () => {
    const scenario = canonicalEvaluateBodyFor("layer3-boq-faithful-001")["scenario"];
    const response = await post(
      "/v1/solution-eval/substitution/evaluate",
      JSON.stringify({ scenario, registryLog: 42 }),
    );
    expect(response?.status).toBe(422);
    const payload = await errorBody(response as Response);
    expect(payload.error).toBe("invalid_registry_log");
  });
});

/* ------------------------------------------------------------------ */
/* Routing discipline                                                   */
/* ------------------------------------------------------------------ */

describe("solution-eval router: routing discipline", () => {
  test("wrong methods answer 405 with the POST allow header", async () => {
    const response = await put("/v1/solution-eval/matrix/run");
    expect(response?.status).toBe(405);
    expect(response?.headers.get("allow")).toBe("POST");
  });

  test("non-module paths answer null (the server's 404 applies)", async () => {
    const request = new Request("http://localhost/v1/solutions/step", { method: "POST" });
    const url = new URL("http://localhost/v1/solutions/step");
    const response = await handleSolutionEvalRequest(request, url, "test-request-id", routes());
    expect(response).toBeNull();
  });

  test("unknown sub-paths under the module prefix answer null", async () => {
    const request = new Request("http://localhost/v1/solution-eval/unknown/action", {
      method: "POST",
    });
    const url = new URL("http://localhost/v1/solution-eval/unknown/action");
    const response = await handleSolutionEvalRequest(request, url, "test-request-id", routes());
    expect(response).toBeNull();
  });

  test("every response carries the x-request-id header", async () => {
    const response = await post(
      "/v1/solution-eval/scenario/validate",
      JSON.stringify(
        scenarioValidateBody(canonicalEvaluateBodyFor("layer3-compiler-faithful-001")["scenario"]),
      ),
    );
    expect(response?.headers.get("x-request-id")).toBe("test-request-id");
  });

  test("identical requests produce byte-identical responses (determinism)", async () => {
    const body = JSON.stringify(canonicalEvaluateBodyFor("layer3-engine-faithful-001"));
    const first = await post("/v1/solution-eval/substitution/evaluate", body);
    const second = await post("/v1/solution-eval/substitution/evaluate", body);
    expect(await first?.text()).toBe(await second?.text());
  });
});
