/**
 * PROD-022 — solution tool endpoint tests (the PURE route factory,
 * exercised directly with fetch-style Request objects — no live server
 * boot, no server.ts edit; the execution router-test discipline minus the
 * full-handler wiring, since the Tech Lead mounts the factory at the
 * integration station).
 *
 * Proves:
 *  - every endpoint's happy path (step applied + fail-closed evaluation
 *    answers, validate, inspect, quantities) over HTTP;
 *  - the stable status table: 400 malformed_json, 422 typed shape codes,
 *    200 for deterministic evaluation answers; 405 with an explicit
 *    `allow` for wrong methods;
 *  - x-request-id correlation on every response;
 *  - non-solution paths answer null (the server's default 404 applies);
 *  - identical requests produce identical response bodies (the tool
 *    surface is deterministic end to end).
 */

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createLogger } from "../lib/log";
import {
  REFERENCE_BUILDING_OPERATION_PROFILE,
  decodeEngineeringOperationIntent,
} from "@aise/solution-contract";
import { replaySolution, TableBaselineGeometryResolver } from "@aise/solution-engine";
import { SolutionService } from "./service";
import { handleSolutionRequest, type SolutionRouteOptions } from "./router";

const quietLogger = createLogger("error");

const CONTRACT_FIXTURES = join(
  import.meta.dir,
  "..",
  "..",
  "..",
  "..",
  "packages",
  "solution-contract",
  "fixtures",
);
const ENGINE_FIXTURES = join(
  import.meta.dir,
  "..",
  "..",
  "..",
  "..",
  "packages",
  "solution-engine",
  "fixtures",
);

function intentPayload(name: string): Record<string, unknown> {
  return JSON.parse(
    readFileSync(
      join(CONTRACT_FIXTURES, "operation", `EngineeringOperationIntent.${name}.json`),
      "utf8",
    ),
  ) as Record<string, unknown>;
}

/** The canonical route options: engine service over the demo baseline geometry. */
function routes(): SolutionRouteOptions {
  const geometryTable = JSON.parse(
    readFileSync(join(ENGINE_FIXTURES, "baseline-geometry.json"), "utf8"),
  ) as Record<string, { value: number; unit: string }>;
  return {
    service: new SolutionService({
      baselineGeometry: new TableBaselineGeometryResolver(geometryTable),
    }),
    logger: quietLogger,
  };
}

function post(path: string, body: string): Promise<Response | null> {
  const request = new Request(`http://localhost${path}`, {
    method: "POST",
    body,
    headers: { "content-type": "application/json" },
  });
  const url = new URL(`http://localhost${path}`);
  return handleSolutionRequest(request, url, "test-request-id", routes());
}

function get(path: string): Promise<Response | null> {
  const request = new Request(`http://localhost${path}`, { method: "GET" });
  const url = new URL(`http://localhost${path}`);
  return handleSolutionRequest(request, url, "test-request-id", routes());
}

function put(path: string): Promise<Response | null> {
  const request = new Request(`http://localhost${path}`, { method: "PUT" });
  const url = new URL(`http://localhost${path}`);
  return handleSolutionRequest(request, url, "test-request-id", routes());
}

const BASELINE = {
  contractVersion: "1.0.0",
  stateId: "state-router-test-baseline-0000000000000000000",
  solutionId: "solution-demo-001",
  versionNumber: 1,
  stateIndex: 0,
  baselineRealityVersionId: "rgv-demo-0007",
  epistemicStatus: "PROPOSED",
  appliedOperationIds: [],
  materializedAt: "2026-09-16T10:00:00.000Z",
};

function wireVersionBody(intents: readonly string[]): string {
  const decoded = intents.map((name) =>
    decodeEngineeringOperationIntent(intentPayload(name)),
  );
  const replay = replaySolution({
    solutionId: "solution-demo-001",
    projectId: "proj-demo-001",
    title: "Ground-floor wall upgrade solution",
    problemStatement: "probe",
    domain: REFERENCE_BUILDING_OPERATION_PROFILE.domains[0]!.domain,
    baselineRealityVersionId: "rgv-demo-0007",
    intents: decoded,
    capabilityProfile: REFERENCE_BUILDING_OPERATION_PROFILE,
    materializeClock: (stateIndex: number) =>
      new Date(Date.UTC(2026, 8, 16, 10, stateIndex, 0, 0)).toISOString(),
    createdAt: "2026-09-16T08:00:00.000Z",
  });
  if (replay.outcome !== "complete") {
    throw new Error("router test replay failed");
  }
  return JSON.stringify(replay.version);
}

interface ErrorBody {
  ok: boolean;
  error: string;
  detail?: string;
}

async function errorBody(response: Response): Promise<ErrorBody> {
  return (await response.json()) as ErrorBody;
}

describe("POST /v1/solutions/step", () => {
  const body = JSON.stringify({
    baseline: BASELINE,
    intent: intentPayload("valid-excavation-direct"),
    materializedAt: "2026-09-16T10:01:00.000Z",
  });

  test("an applicable intent answers 200 with the full applied result", async () => {
    const response = await post("/v1/solutions/step", body);
    expect(response).not.toBeNull();
    expect(response?.status).toBe(200);
    expect(response?.headers.get("x-request-id")).toBe("test-request-id");
    const payload = (await response?.json()) as {
      ok: boolean;
      result: { outcome: string; operation?: { operationType: string } };
    };
    expect(payload.ok).toBe(true);
    expect(payload.result.outcome).toBe("applied");
    expect(payload.result.operation?.operationType).toBe("excavation");
  });

  test("a fail-closed evaluation answer is 200 DATA (the agent consumes the reasons)", async () => {
    const response = await post(
      "/v1/solutions/step",
      JSON.stringify({
        baseline: BASELINE,
        intent: intentPayload("valid-undeclared-operation-trench-shoring"),
        materializedAt: "2026-09-16T10:01:00.000Z",
      }),
    );
    expect(response?.status).toBe(200);
    const payload = (await response?.json()) as {
      ok: boolean;
      result: { outcome: string; reasons: { code: string; detail: string }[] };
    };
    expect(payload.ok).toBe(true);
    expect(payload.result.outcome).toBe("unsupported");
    expect(payload.result.reasons[0]?.code).toBe("capability_unsupported");
    expect(payload.result.reasons[0]?.detail.length).toBeGreaterThan(0);
  });

  test("a needs-input answer carries the machine-readable missing-parameter reason", async () => {
    const response = await post(
      "/v1/solutions/step",
      JSON.stringify({
        baseline: BASELINE,
        intent: intentPayload("valid-blocked-missing-depth"),
        materializedAt: "2026-09-16T10:01:00.000Z",
      }),
    );
    expect(response?.status).toBe(200);
    const payload = (await response?.json()) as {
      result: { outcome: string; reasons: { code: string }[]; negotiation: { missingParameters: string[] } };
    };
    expect(payload.result.outcome).toBe("needs-input");
    expect(payload.result.reasons[0]?.code).toBe("missing_required_parameter");
    expect(payload.result.negotiation.missingParameters).toEqual(["depth"]);
  });

  test("malformed JSON answers 400 malformed_json", async () => {
    const response = await post("/v1/solutions/step", "{not json");
    expect(response?.status).toBe(400);
    expect((await errorBody(response as Response)).error).toBe("malformed_json");
  });

  test("an undecodable intent answers 422 invalid_intent with contract issues", async () => {
    const response = await post(
      "/v1/solutions/step",
      JSON.stringify({
        baseline: BASELINE,
        intent: { nonsense: true },
        materializedAt: "2026-09-16T10:01:00.000Z",
      }),
    );
    expect(response?.status).toBe(422);
    const bodyOut = await errorBody(response as Response);
    expect(bodyOut.error).toBe("invalid_intent");
    expect(bodyOut.detail).toContain("strict contract decoding");
  });

  test("a missing materializedAt answers 422 invalid_timestamp", async () => {
    const response = await post(
      "/v1/solutions/step",
      JSON.stringify({
        baseline: BASELINE,
        intent: intentPayload("valid-excavation-direct"),
      }),
    );
    expect(response?.status).toBe(422);
    expect((await errorBody(response as Response)).error).toBe("invalid_timestamp");
  });

  test("GET is rejected with 405 and an explicit allow", async () => {
    const response = await get("/v1/solutions/step");
    expect(response?.status).toBe(405);
    expect(response?.headers.get("allow")).toBe("POST");
  });
});

describe("POST /v1/solutions/validate", () => {
  test("a replayed version validates to a 200 snapshot with worst-of pass", async () => {
    const response = await post(
      "/v1/solutions/validate",
      JSON.stringify({
        version: JSON.parse(wireVersionBody(["valid-demolition-removal"])),
        validatedAt: "2026-09-16T10:30:00.000Z",
      }),
    );
    expect(response?.status).toBe(200);
    const payload = (await response?.json()) as {
      ok: boolean;
      snapshot: { outcome: string; checks: unknown[]; snapshotId: string };
    };
    expect(payload.ok).toBe(true);
    expect(payload.snapshot.outcome).toBe("pass");
    expect(payload.snapshot.checks).toHaveLength(7);
    expect(payload.snapshot.snapshotId).toMatch(/^[0-9a-f]{64}$/);
  });

  test("an over-limit version validates to review-needed (deterministic finding over HTTP)", async () => {
    const deepIntent = {
      ...intentPayload("valid-excavation-direct"),
      parameters: [
        { name: "depth", value: 8, unit: "m" },
        { name: "width", value: 2, unit: "m" },
        { name: "length", value: 3, unit: "m" },
      ],
    };
    const replay = replaySolution({
      solutionId: "solution-demo-001",
      projectId: "proj-demo-001",
      title: "deep dig",
      problemStatement: "probe",
      domain: REFERENCE_BUILDING_OPERATION_PROFILE.domains[0]!.domain,
      baselineRealityVersionId: "rgv-demo-0007",
      intents: [decodeEngineeringOperationIntent(deepIntent)],
      capabilityProfile: REFERENCE_BUILDING_OPERATION_PROFILE,
      materializeClock: (stateIndex: number) =>
        new Date(Date.UTC(2026, 8, 16, 10, stateIndex, 0, 0)).toISOString(),
      createdAt: "2026-09-16T08:00:00.000Z",
    });
    expect(replay.outcome).toBe("complete");
    const response = await post(
      "/v1/solutions/validate",
      JSON.stringify({
        version: replay.outcome === "complete" ? replay.version : null,
        validatedAt: "2026-09-16T10:30:00.000Z",
      }),
    );
    const payload = (await response?.json()) as { snapshot: { outcome: string } };
    expect(payload.snapshot.outcome).toBe("review-needed");
  });

  test("a non-object version answers 422 invalid_version", async () => {
    const response = await post(
      "/v1/solutions/validate",
      JSON.stringify({ version: [], validatedAt: "2026-09-16T10:30:00.000Z" }),
    );
    expect(response?.status).toBe(422);
    expect((await errorBody(response as Response)).error).toBe("invalid_version");
  });
});

describe("POST /v1/solutions/inspect", () => {
  test("inspect answers the version spine + requested layer", async () => {
    const response = await post(
      "/v1/solutions/inspect",
      JSON.stringify({ version: JSON.parse(wireVersionBody(["valid-excavation-direct"])) }),
    );
    expect(response?.status).toBe(200);
    const payload = (await response?.json()) as {
      ok: boolean;
      solutionId: string;
      versionNumber: number;
      requestedStateIndex: number;
      operations: { operationType: string; intentRef: string }[];
      states: { stateIndex: number; stateId: string }[];
    };
    expect(payload.ok).toBe(true);
    expect(payload.solutionId).toBe("solution-demo-001");
    expect(payload.versionNumber).toBe(1);
    expect(payload.requestedStateIndex).toBe(1);
    expect(payload.operations[0]?.operationType).toBe("excavation");
    expect(payload.operations[0]?.intentRef).toBe("intent-demo-0001");
    expect(payload.states).toHaveLength(2);
  });

  test("an out-of-range stateIndex answers 422 invalid_state_index", async () => {
    const response = await post(
      "/v1/solutions/inspect",
      JSON.stringify({
        version: JSON.parse(wireVersionBody(["valid-excavation-direct"])),
        stateIndex: 42,
      }),
    );
    expect(response?.status).toBe(422);
    const bodyOut = await errorBody(response as Response);
    expect(bodyOut.error).toBe("invalid_state_index");
    expect(bodyOut.detail).toContain("0..1");
  });

  test("PUT is rejected with 405", async () => {
    const response = await put("/v1/solutions/inspect");
    expect(response?.status).toBe(405);
  });
});

describe("POST /v1/solutions/quantities", () => {
  test("quantities answers the traced inventory + totals", async () => {
    const response = await post(
      "/v1/solutions/quantities",
      JSON.stringify({
        version: JSON.parse(
          wireVersionBody(["valid-demolition-removal", "valid-block-wall-placement"]),
        ),
      }),
    );
    expect(response?.status).toBe(200);
    const payload = (await response?.json()) as {
      ok: boolean;
      inventory: {
        stateIndex: number;
        perOperation: {
          operationType: string;
          value: number;
          unit: string;
          parameters: { name: string; value: number; unit?: string }[];
        }[];
        totals: { dimension: string; netValue: number }[];
      };
    };
    expect(payload.ok).toBe(true);
    expect(payload.inventory.stateIndex).toBe(2);
    expect(payload.inventory.perOperation).toHaveLength(5); // 2 + 3 quantities
    expect(
      payload.inventory.perOperation.every((entry) => entry.parameters.length > 0),
    ).toBe(true);
    expect(payload.inventory.totals.some((t) => t.dimension === "count" && t.netValue === 65)).toBe(
      true,
    );
  });

  test("an explicit intermediate stateIndex answers that layer's prefix", async () => {
    const response = await post(
      "/v1/solutions/quantities",
      JSON.stringify({
        version: JSON.parse(
          wireVersionBody(["valid-demolition-removal", "valid-block-wall-placement"]),
        ),
        stateIndex: 1,
      }),
    );
    const payload = (await response?.json()) as {
      inventory: { stateIndex: number; perOperation: unknown[] };
    };
    expect(payload.inventory.stateIndex).toBe(1);
    expect(payload.inventory.perOperation).toHaveLength(2);
  });
});

describe("route shape discipline", () => {
  test("non-solution paths answer null (the server's 404 applies)", async () => {
    const request = new Request("http://localhost/v1/executions", { method: "POST" });
    const response = await handleSolutionRequest(
      request,
      new URL("http://localhost/v1/executions"),
      "test-request-id",
      routes(),
    );
    expect(response).toBeNull();
  });

  test("unknown /v1/solutions sub-paths answer null", async () => {
    const response = await post("/v1/solutions/nonsense", "{}");
    expect(response).toBeNull();
  });

  test("identical requests produce identical response bodies (end-to-end determinism)", async () => {
    const body = JSON.stringify({
      baseline: BASELINE,
      intent: intentPayload("valid-backfill"),
      materializedAt: "2026-09-16T10:01:00.000Z",
    });
    const first = await post("/v1/solutions/step", body);
    const second = await post("/v1/solutions/step", body);
    expect(await first?.text()).toBe(await second?.text());
  });

  test("every response carries the x-request-id correlation header", async () => {
    const response = await post(
      "/v1/solutions/validate",
      JSON.stringify({
        version: JSON.parse(wireVersionBody(["valid-excavation-direct"])),
        validatedAt: "2026-09-16T10:30:00.000Z",
      }),
    );
    expect(response?.headers.get("x-request-id")).toBe("test-request-id");
    const errorResponse = await post("/v1/solutions/step", "{bad");
    expect(errorResponse?.headers.get("x-request-id")).toBe("test-request-id");
  });
});
