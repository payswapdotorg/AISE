/**
 * PROD-031 — the BASELINE + REVISION route legs of the solution tool
 * surface (the additive legs the browser workspace mount executes the
 * engine through; the pure route-factory discipline of router.test.ts —
 * fetch-style Request objects directly, no live server boot).
 *
 * Proves:
 *  - POST /v1/solutions/baseline materializes the solution-creation
 *    baseline overlay (layer 0) — the engine's own `materializeBaselineState`
 *    output VERBATIM over HTTP (byte-deterministic: the same request bytes
 *    answer the same response bytes; the state identity matches the
 *    in-process engine call exactly — the transport adds nothing);
 *  - POST /v1/solutions/revise executes the engine's revision (undo) leg
 *    over the SERIALIZABLE stepped-clock wire spec — the new version and
 *    its states match the in-process `reviseVersion` call exactly (the
 *    engine's own `steppedMaterializeClock` builds the function
 *    server-side; never a second clock semantics), and a bad revert target
 *    is a DETERMINISTIC 200 answer (the engine's typed refusal), never a
 *    transport error;
 *  - the stable status table carries over: 400 malformed_json, 422 typed
 *    shape codes, 405 with an explicit allow for wrong methods;
 *  - non-solution paths still answer null (the server's default 404).
 */

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createLogger } from "../lib/log";
import {
  REFERENCE_BUILDING_OPERATION_PROFILE,
  decodeEngineeringOperationIntent,
  type SolutionVersion,
} from "@aise/solution-contract";
import {
  materializeBaselineState,
  replaySolution,
  reviseVersion,
  steppedMaterializeClock,
  TableBaselineGeometryResolver,
} from "@aise/solution-engine";
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

function wrongMethod(path: string, method: string): Promise<Response | null> {
  const request = new Request(`http://localhost${path}`, { method });
  const url = new URL(`http://localhost${path}`);
  return handleSolutionRequest(request, url, "test-request-id", routes());
}

/** A one-operation version 1 (the demolition fixture) over the demo world. */
function demoVersion(): SolutionVersion {
  const replay = replaySolution({
    solutionId: "solution-demo-001",
    projectId: "proj-demo-001",
    title: "Ground-floor wall upgrade solution",
    problemStatement: "probe",
    domain: REFERENCE_BUILDING_OPERATION_PROFILE.domains[0]!.domain,
    baselineRealityVersionId: "rgv-demo-0007",
    intents: [decodeEngineeringOperationIntent(intentPayload("valid-demolition-removal"))],
    capabilityProfile: REFERENCE_BUILDING_OPERATION_PROFILE,
    materializeClock: (stateIndex: number) =>
      new Date(Date.UTC(2026, 8, 16, 10, stateIndex, 0, 0)).toISOString(),
    createdAt: "2026-09-16T08:00:00.000Z",
  });
  if (replay.outcome !== "complete") {
    throw new Error("route test replay failed");
  }
  return replay.version;
}

const BASELINE_REQUEST = JSON.stringify({
  solutionId: "solution-demo-001",
  versionNumber: 1,
  baselineRealityVersionId: "rgv-demo-0007",
  materializedAt: "2026-09-16T10:00:00.000Z",
});

describe("POST /v1/solutions/baseline (PROD-031)", () => {
  test("materializes the engine's layer-0 state verbatim (identical to the in-process engine call)", async () => {
    const response = await post("/v1/solutions/baseline", BASELINE_REQUEST);
    expect(response).not.toBeNull();
    expect(response?.status).toBe(200);
    expect(response?.headers.get("x-request-id")).toBe("test-request-id");
    const payload = (await response?.json()) as {
      ok: boolean;
      state: {
        stateId: string;
        solutionId: string;
        versionNumber: number;
        stateIndex: number;
        baselineRealityVersionId: string;
        epistemicStatus: string;
        appliedOperationIds: string[];
      };
    };
    expect(payload.ok).toBe(true);
    expect(payload.state.solutionId).toBe("solution-demo-001");
    expect(payload.state.versionNumber).toBe(1);
    expect(payload.state.stateIndex).toBe(0);
    expect(payload.state.baselineRealityVersionId).toBe("rgv-demo-0007");
    expect(payload.state.epistemicStatus).toBe("PROPOSED");
    expect(payload.state.appliedOperationIds).toEqual([]);
    // The engine's OWN output, byte-identical over the wire (the transport
    // adds nothing — the browser mount renders exactly what the local
    // binding would).
    const inProcess = materializeBaselineState({
      solutionId: "solution-demo-001",
      versionNumber: 1,
      baselineRealityVersionId: "rgv-demo-0007",
      materializedAt: "2026-09-16T10:00:00.000Z",
    });
    expect(payload.state).toEqual(inProcess);
  });

  test("is deterministic end to end (the same request bytes answer the same response bytes)", async () => {
    const first = await post("/v1/solutions/baseline", BASELINE_REQUEST);
    const second = await post("/v1/solutions/baseline", BASELINE_REQUEST);
    expect(await first?.text()).toBe(await second?.text());
  });

  test("fails closed with 422 typed codes on shape violations", async () => {
    const missingSolutionId = await post(
      "/v1/solutions/baseline",
      JSON.stringify({
        versionNumber: 1,
        baselineRealityVersionId: "rgv-demo-0007",
        materializedAt: "2026-09-16T10:00:00.000Z",
      }),
    );
    expect(missingSolutionId?.status).toBe(422);
    expect(await errorBodyOf(missingSolutionId)).toMatchObject({ error: "invalid_request" });

    const badVersionNumber = await post(
      "/v1/solutions/baseline",
      JSON.stringify({
        solutionId: "solution-demo-001",
        versionNumber: 0,
        baselineRealityVersionId: "rgv-demo-0007",
        materializedAt: "2026-09-16T10:00:00.000Z",
      }),
    );
    expect(badVersionNumber?.status).toBe(422);

    const badTimestamp = await post(
      "/v1/solutions/baseline",
      JSON.stringify({
        solutionId: "solution-demo-001",
        versionNumber: 1,
        baselineRealityVersionId: "rgv-demo-0007",
        materializedAt: "not-an-instant",
      }),
    );
    expect(badTimestamp?.status).toBe(422);
    expect(await errorBodyOf(badTimestamp)).toMatchObject({ error: "invalid_timestamp" });
  });

  test("rejects a non-JSON body with 400 malformed_json", async () => {
    const response = await post("/v1/solutions/baseline", "{not json");
    expect(response?.status).toBe(400);
    expect(await errorBodyOf(response)).toMatchObject({ error: "malformed_json" });
  });

  test("answers 405 with an explicit allow for wrong methods", async () => {
    const response = await wrongMethod("/v1/solutions/baseline", "GET");
    expect(response?.status).toBe(405);
    expect(response?.headers.get("allow")).toBe("POST");
  });
});

describe("POST /v1/solutions/revise (PROD-031)", () => {
  const version = demoVersion();
  const revertOperationId = version.operations[0]!.operationId;
  const reviseRequest = JSON.stringify({
    version,
    revertOperationId,
    createdAt: "2026-09-16T10:05:00.000Z",
    materializeClock: { base: "2026-09-16T10:00:00.000Z", stepMs: 60_000 },
    revisionProvenance: {
      authoredBy: "user-demo-engineer",
      reason: "undo the demolition through the browser workspace timeline",
      authoredAt: "2026-09-16T10:05:00.000Z",
    },
  });

  test("executes the engine's revision leg — identical to the in-process engine call", async () => {
    const response = await post("/v1/solutions/revise", reviseRequest);
    expect(response).not.toBeNull();
    expect(response?.status).toBe(200);
    const payload = (await response?.json()) as {
      ok: boolean;
      result: {
        outcome: string;
        newVersion?: SolutionVersion;
        revision?: {
          kind: string;
          parentVersionNumber: number;
          newVersionNumber: number;
          revertedOperationId: string;
        };
      };
    };
    expect(payload.ok).toBe(true);
    expect(payload.result.outcome).toBe("revised");
    expect(payload.result.newVersion?.versionNumber).toBe(2);
    expect(payload.result.revision?.kind).toBe("undo");
    expect(payload.result.revision?.parentVersionNumber).toBe(1);
    expect(payload.result.revision?.revertedOperationId).toBe(revertOperationId);
    // The engine's OWN output over the SERIALIZABLE clock spec — identical
    // to the in-process call (steppedMaterializeClock builds the same
    // function server-side; never a second clock semantics).
    const inProcess = reviseVersion({
      version,
      revertOperationId,
      capabilityProfile: REFERENCE_BUILDING_OPERATION_PROFILE,
      createdAt: "2026-09-16T10:05:00.000Z",
      materializeClock: steppedMaterializeClock(
        Date.parse("2026-09-16T10:00:00.000Z"),
        60_000,
      ),
      revisionProvenance: {
        authoredBy: "user-demo-engineer",
        reason: "undo the demolition through the browser workspace timeline",
        authoredAt: "2026-09-16T10:05:00.000Z",
      },
    });
    expect(inProcess.outcome).toBe("revised");
    expect(payload.result).toEqual(inProcess);
  });

  test("is deterministic end to end (the same request bytes answer the same response bytes)", async () => {
    const first = await post("/v1/solutions/revise", reviseRequest);
    const second = await post("/v1/solutions/revise", reviseRequest);
    expect(await first?.text()).toBe(await second?.text());
  });

  test("an unknown revert target is a DETERMINISTIC 200 refusal (the engine's typed answer)", async () => {
    const response = await post(
      "/v1/solutions/revise",
      JSON.stringify({
        version,
        revertOperationId: "op-does-not-exist",
        createdAt: "2026-09-16T10:05:00.000Z",
        materializeClock: { base: "2026-09-16T10:00:00.000Z", stepMs: 60_000 },
        revisionProvenance: {
          authoredBy: "user-demo-engineer",
          reason: "probe",
          authoredAt: "2026-09-16T10:05:00.000Z",
        },
      }),
    );
    expect(response?.status).toBe(200);
    const payload = (await response?.json()) as {
      ok: boolean;
      result: { outcome: string; reasons: { code: string; detail: string }[] };
    };
    expect(payload.ok).toBe(true);
    expect(payload.result.outcome).toBe("invalid");
    expect(payload.result.reasons.length).toBeGreaterThan(0);
  });

  test("fails closed with 422 typed codes on shape violations", async () => {
    const garbageVersion = await post(
      "/v1/solutions/revise",
      JSON.stringify({
        version: { nonsense: true },
        revertOperationId,
        createdAt: "2026-09-16T10:05:00.000Z",
        materializeClock: { base: "2026-09-16T10:00:00.000Z", stepMs: 60_000 },
        revisionProvenance: {
          authoredBy: "user-demo-engineer",
          reason: "probe",
          authoredAt: "2026-09-16T10:05:00.000Z",
        },
      }),
    );
    expect(garbageVersion?.status).toBe(422);
    expect(await errorBodyOf(garbageVersion)).toMatchObject({ error: "invalid_version" });

    const missingProvenance = await post(
      "/v1/solutions/revise",
      JSON.stringify({
        version,
        revertOperationId,
        createdAt: "2026-09-16T10:05:00.000Z",
        materializeClock: { base: "2026-09-16T10:00:00.000Z", stepMs: 60_000 },
      }),
    );
    expect(missingProvenance?.status).toBe(422);
    expect(await errorBodyOf(missingProvenance)).toMatchObject({ error: "invalid_request" });

    const badClock = await post(
      "/v1/solutions/revise",
      JSON.stringify({
        version,
        revertOperationId,
        createdAt: "2026-09-16T10:05:00.000Z",
        materializeClock: { base: "not-an-instant", stepMs: 60_000 },
        revisionProvenance: {
          authoredBy: "user-demo-engineer",
          reason: "probe",
          authoredAt: "2026-09-16T10:05:00.000Z",
        },
      }),
    );
    expect(badClock?.status).toBe(422);
    expect(await errorBodyOf(badClock)).toMatchObject({ error: "invalid_request" });
  });

  test("answers 405 with an explicit allow for wrong methods", async () => {
    const response = await wrongMethod("/v1/solutions/revise", "PUT");
    expect(response?.status).toBe(405);
    expect(response?.headers.get("allow")).toBe("POST");
  });
});

describe("the PROD-031 legs keep the factory's null-path discipline", () => {
  test("a non-solution path still answers null (the server's default 404 applies)", async () => {
    const request = new Request("http://localhost/v1/other", { method: "POST" });
    const response = await handleSolutionRequest(
      request,
      new URL("http://localhost/v1/other"),
      "test-request-id",
      routes(),
    );
    expect(response).toBeNull();
  });
});

async function errorBodyOf(response: Response | null): Promise<{ error: string }> {
  return (await response?.json()) as { error: string };
}
