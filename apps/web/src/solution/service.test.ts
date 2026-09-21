/**
 * PROD-024 — the SOLUTION SERVICE SEAM tests: the local engine binding
 * (the REAL `@aise/solution-engine` outputs, verbatim) and the HTTP
 * binding's wire shapes (the fetch transport stubbed, the PROD-017
 * discipline: no network, no clock, no randomness).
 */

import { describe, expect, test } from "bun:test";
import {
  createHttpSolutionService,
  createLocalSolutionService,
  type SolutionFetchLike,
} from "./service";
import { openWorkspace } from "./operations";
import { DEMO_SOLUTION_WORLD, demoBaselineGeometry } from "./fixtures";
import { currentVersionOf } from "./model";
import {
  REFERENCE_BUILDING_OPERATION_PROFILE,
} from "../../../../packages/solution-contract/src/index";

function demoService() {
  return createLocalSolutionService({ baselineGeometry: demoBaselineGeometry() });
}

function demoState() {
  return openWorkspace({
    projectId: DEMO_SOLUTION_WORLD.projectId,
    caseId: DEMO_SOLUTION_WORLD.caseId,
    solutionId: DEMO_SOLUTION_WORLD.solutionId,
    title: DEMO_SOLUTION_WORLD.title,
    problemStatement: DEMO_SOLUTION_WORLD.problemStatement,
    baselineRealityVersionId: DEMO_SOLUTION_WORLD.baselineRealityVersionId,
    createdAt: "2026-09-16T08:00:00.000Z",
    materializedAt: "2026-09-16T10:00:00.000Z",
  });
}

describe("PROD-024 solution service seam (local engine binding)", () => {
  test("the descriptor is honest about executing the real engine", () => {
    expect(demoService().descriptor.engineKind).toBe("aise-solution-engine");
    expect(demoService().descriptor.serviceId).toBe("solution-service-local-engine");
  });

  test("inspect reads the version back with the requested engine state", async () => {
    const service = demoService();
    const state = demoState();
    const inspected = await service.inspect({
      version: currentVersionOf(state),
      stateIndex: 0,
    });
    expect(inspected.solutionId).toBe("solution-demo-001");
    expect(inspected.operationCount).toBe(0);
    expect(inspected.stateCount).toBe(1);
    expect(inspected.requestedState.stateId).toBe(
      currentVersionOf(state).states[0]!.stateId,
    );
  });

  test("inspect fails closed on an out-of-range state index", async () => {
    const service = demoService();
    const state = demoState();
    expect(service.inspect({ version: currentVersionOf(state), stateIndex: 9 })).rejects.toThrow(
      /out of range/,
    );
  });

  test("quantities answers the engine's aggregated inventory of a state", async () => {
    const service = demoService();
    const state = demoState();
    const result = await service.quantities({
      version: currentVersionOf(state),
      stateIndex: 0,
    });
    expect(result.inventory.stateIndex).toBe(0);
    expect(result.inventory.perOperation).toHaveLength(0);
    expect(result.inventory.totals).toHaveLength(0);
  });

  test("validate runs the engine's deterministic checks and answers a snapshot", async () => {
    const service = demoService();
    const state = demoState();
    const result = await service.validate({
      version: currentVersionOf(state),
      validatedAt: "2026-09-16T11:00:00.000Z",
    });
    expect(result.snapshot.outcome).toBe("pass");
    expect(result.snapshot.checks).toHaveLength(7);
    expect(result.snapshot.engine.kind).toBe("aise-solution-engine");
    expect(result.snapshot.validatedAt).toBe("2026-09-16T11:00:00.000Z");
  });

  test("an explicit capability profile is honored (the partial profile's unknown excavation negotiates to needs-input)", async () => {
    const service = demoService();
    const state = demoState();
    const { buildAgentIntent } = await import("./agent/port");
    const excavation = buildAgentIntent({
      intentId: "intent-excavation-001",
      operationType: "excavation",
      parameters: [
        { name: "depth", value: 1.5, unit: "m" },
        { name: "width", value: 2, unit: "m" },
        { name: "length", value: 3, unit: "m" },
      ],
      target: {
        contractVersion: "1.0.0",
        selectorKind: "volume",
        nodeRefs: ["node-site-001"],
        geometryRefs: [{ kind: "polygon", ref: "geo-pit-outline-001" }],
        units: { linear: "m", angular: "rad" },
        description: "the demo site volume",
      },
      commandText: "Excavate a pit 1.5 m deep, 2 m wide and 3 m long.",
      authoredAt: "2026-09-16T09:05:00.000Z",
      proposedTo: { solutionId: DEMO_SOLUTION_WORLD.solutionId, versionNumber: 1 },
    });
    // The reference profile accepts it…
    const withReference = await service.step({
      baseline: currentVersionOf(state).states[0]!,
      intent: excavation,
      materializedAt: "2026-09-16T10:01:00.000Z",
    });
    expect(withReference.result.outcome).toBe("applied");
    // …and a fresh v1 state is needed for the second call (append-only).
    const freshState = demoState();
    const partial = JSON.parse(
      JSON.stringify(REFERENCE_BUILDING_OPERATION_PROFILE),
    ) as typeof REFERENCE_BUILDING_OPERATION_PROFILE;
    const excavationEntry = partial.domains[0]?.operations.find(
      (entry) => entry.operationType === "excavation",
    );
    if (excavationEntry !== undefined) {
      excavationEntry.status = "unknown";
    }
    const withPartial = await service.step({
      baseline: currentVersionOf(freshState).states[0]!,
      intent: excavation,
      capabilityProfile: partial,
      materializedAt: "2026-09-16T10:01:00.000Z",
    });
    expect(withPartial.result.outcome).toBe("needs-input");
  });
});

describe("PROD-024 solution service seam (HTTP binding wire shapes)", () => {
  /** A stubbed fetch capturing every call (the api.test.ts discipline). */
  function capturingFetch(
    respond: (path: string, body: unknown) => unknown,
  ): { fetchImpl: SolutionFetchLike; calls: { path: string; body: unknown }[] } {
    const calls: { path: string; body: unknown }[] = [];
    const fetchImpl: SolutionFetchLike = async (path, init) => {
      const body = init?.body === undefined ? undefined : (JSON.parse(init.body) as unknown);
      calls.push({ path, body });
      const payload = respond(path, body);
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify(payload),
      };
    };
    return { fetchImpl, calls };
  }

  test("step posts the backend's exact request shape to /v1/solutions/step", async () => {
    const { fetchImpl, calls } = capturingFetch(() => ({
      result: { outcome: "applied" },
    }));
    const service = createHttpSolutionService({ fetchImpl });
    const state = demoState();
    const baseline = currentVersionOf(state).states[0]!;
    const result = await service.step({
      baseline,
      intent: { intentId: "x" } as never,
      materializedAt: "2026-09-16T10:01:00.000Z",
    });
    expect(calls[0]?.path).toBe("/v1/solutions/step");
    expect(calls[0]?.body).toEqual({
      baseline,
      intent: { intentId: "x" },
      materializedAt: "2026-09-16T10:01:00.000Z",
    });
    expect(result.result.outcome).toBe("applied");
  });

  test("a non-OK answer throws a typed transport error (never a silent fallback)", async () => {
    const fetchImpl: SolutionFetchLike = async () => ({
      ok: false,
      status: 422,
      text: async () => JSON.stringify({ ok: false, error: "invalid_intent" }),
    });
    const service = createHttpSolutionService({ fetchImpl });
    const state = demoState();
    expect(
      service.step({
        baseline: currentVersionOf(state).states[0]!,
        intent: { intentId: "x" } as never,
        materializedAt: "2026-09-16T10:01:00.000Z",
      }),
    ).rejects.toThrow(/HTTP 422/);
  });

  test("the base path is overridable for composition-time wiring", async () => {
    const { fetchImpl, calls } = capturingFetch(() => ({}));
    const service = createHttpSolutionService({ fetchImpl, basePath: "/v1/solutions-test" });
    await service.validate({
      version: currentVersionOf(demoState()),
      validatedAt: "2026-09-16T11:00:00.000Z",
    });
    expect(calls[0]?.path).toBe("/v1/solutions-test/validate");
  });
});
