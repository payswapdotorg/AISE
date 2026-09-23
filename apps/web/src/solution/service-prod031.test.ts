/**
 * PROD-031 — the SOLUTION SERVICE SEAM's new legs: the baseline
 * materialization through the port and the revision leg's SERIALIZABLE
 * stepped-clock wire spec (the two legs the browser mount executes the
 * engine through over the mounted routes).
 *
 * Proves:
 *  - the HTTP binding posts POST /v1/solutions/baseline with the port's
 *    exact body shape and renders the engine's layer-0 state verbatim;
 *  - the HTTP binding's revise leg carries the stepped-clock SPEC
 *    { base, stepMs } — a JSON round-trip of the request body contains NO
 *    function and NO dropped field (a function clock would be silently
 *    dropped by JSON.stringify — the defect this spec closes);
 *  - the LOCAL binding's baseline is the engine's own
 *    materializeBaselineState output (one semantics, in-process);
 *  - the LOCAL binding's revise over the spec is IDENTICAL to calling the
 *    engine's reviseVersion directly with the equivalent function clock
 *    (the engine's steppedMaterializeClock arithmetic — never a second
 *    clock semantics);
 *  - `openWorkspaceThroughService` (the browser mount's opening path)
 *    over a service that answers the engine's baseline produces EXACTLY
 *    the workspace state `openWorkspace` produces over an injected
 *    engine-computed baseline (the two rungs open the same world).
 *
 * Deterministic: the committed demo world, stubbed fetch transports (no
 * network), fixed instants. No clock, no randomness.
 */

import { describe, expect, test } from "bun:test";
import { createHttpSolutionService, createLocalSolutionService } from "./service";
import type { SolutionFetchLike } from "./service";
import { openWorkspaceThroughService, steppedWorkspaceClock } from "./operations-core";
import { openWorkspace } from "./operations";
import { DEMO_SOLUTION_WORLD, demoBaselineGeometry } from "./fixtures";
import { currentVersionOf } from "./model";
import {
  materializeBaselineState,
  reviseVersion,
  steppedMaterializeClock,
} from "../../../../packages/solution-engine/src/index";

const OPEN_INPUT = {
  projectId: DEMO_SOLUTION_WORLD.projectId,
  caseId: DEMO_SOLUTION_WORLD.caseId,
  solutionId: DEMO_SOLUTION_WORLD.solutionId,
  title: DEMO_SOLUTION_WORLD.title,
  problemStatement: DEMO_SOLUTION_WORLD.problemStatement,
  baselineRealityVersionId: DEMO_SOLUTION_WORLD.baselineRealityVersionId,
  createdAt: "2026-09-16T08:00:00.000Z",
  materializedAt: "2026-09-16T10:00:00.000Z",
} as const;

const BASELINE_INPUT = {
  solutionId: DEMO_SOLUTION_WORLD.solutionId,
  versionNumber: 1,
  baselineRealityVersionId: DEMO_SOLUTION_WORLD.baselineRealityVersionId,
  materializedAt: "2026-09-16T10:00:00.000Z",
} as const;

describe("PROD-031 the service seam's baseline leg", () => {
  test("the HTTP binding posts /v1/solutions/baseline with the port's exact body", async () => {
    const calls: { path: string; body: unknown }[] = [];
    const fetchImpl: SolutionFetchLike = async (path, init) => {
      calls.push({ path, body: JSON.parse(init?.body ?? "{}") as unknown });
      return {
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({
            ok: true,
            state: materializeBaselineState(BASELINE_INPUT),
          }),
      };
    };
    const service = createHttpSolutionService({ fetchImpl });
    const result = await service.baseline(BASELINE_INPUT);
    expect(calls).toEqual([{ path: "/v1/solutions/baseline", body: BASELINE_INPUT }]);
    expect(result.state).toEqual(materializeBaselineState(BASELINE_INPUT));
  });

  test("the HTTP binding surfaces a non-OK answer as an honest transport error", async () => {
    const fetchImpl: SolutionFetchLike = async () => ({
      ok: false,
      status: 404,
      text: async () => '{"error":"not_found"}',
    });
    const service = createHttpSolutionService({ fetchImpl });
    await expect(service.baseline(BASELINE_INPUT)).rejects.toThrow(
      /solution service \/v1\/solutions\/baseline answered HTTP 404/,
    );
  });

  test("the local binding materializes the engine's own layer-0 state (one semantics, in-process)", async () => {
    const service = createLocalSolutionService({ baselineGeometry: demoBaselineGeometry() });
    const result = await service.baseline(BASELINE_INPUT);
    expect(result.state).toEqual(materializeBaselineState(BASELINE_INPUT));
  });

  test("openWorkspaceThroughService produces EXACTLY openWorkspace's state over the engine baseline (the two rungs open the same world)", async () => {
    const service = createLocalSolutionService({ baselineGeometry: demoBaselineGeometry() });
    const throughService = await openWorkspaceThroughService(OPEN_INPUT, { service });
    const direct = openWorkspace({
      ...OPEN_INPUT,
      baselineState: materializeBaselineState(BASELINE_INPUT),
    });
    expect(throughService).toEqual(direct);
    expect(currentVersionOf(throughService).states[0]!.stateId).toBe(
      currentVersionOf(direct).states[0]!.stateId,
    );
  });
});

describe("PROD-031 the revision leg's SERIALIZABLE stepped-clock wire spec", () => {
  test("the HTTP binding's revise body JSON-round-trips with the clock spec intact (no functions on the wire)", async () => {
    const service = createLocalSolutionService({ baselineGeometry: demoBaselineGeometry() });
    const opened = await openWorkspaceThroughService(OPEN_INPUT, { service });
    const version = currentVersionOf(opened);
    const clock = steppedWorkspaceClock("2026-09-16T10:00:00.000Z", 60_000);
    const reviseInput = {
      version,
      revertOperationId: "op-probe-0000000000000000000000000000",
      createdAt: clock.now(),
      materializeClock: clock.spec,
      revisionProvenance: {
        authoredBy: DEMO_SOLUTION_WORLD.userId,
        reason: "probe the wire shape",
        authoredAt: clock.now(),
      },
    };
    // A JSON round-trip of the HTTP binding's body (exactly what the
    // transport does) must keep every field — a FUNCTION clock would be
    // silently dropped here (the defect this spec closes).
    const roundTripped = JSON.parse(JSON.stringify(reviseInput)) as typeof reviseInput;
    expect(roundTripped.materializeClock).toEqual({ base: "2026-09-16T10:00:00.000Z", stepMs: 60_000 });

    const calls: { path: string; body: unknown }[] = [];
    const fetchImpl: SolutionFetchLike = async (path, init) => {
      calls.push({ path, body: JSON.parse(init?.body ?? "{}") as unknown });
      return { ok: true, status: 200, text: async () => JSON.stringify({ ok: true, result: { outcome: "invalid", reasons: [] } }) };
    };
    const http = createHttpSolutionService({ fetchImpl });
    await http.revise(roundTripped);
    expect(calls[0]?.path).toBe("/v1/solutions/revise");
    expect((calls[0]?.body as { materializeClock: unknown }).materializeClock).toEqual({
      base: "2026-09-16T10:00:00.000Z",
      stepMs: 60_000,
    });
  });

  test("the local binding's revise over the spec is IDENTICAL to the engine's reviseVersion (never a second clock semantics)", async () => {
    const service = createLocalSolutionService({ baselineGeometry: demoBaselineGeometry() });
    const opened = await openWorkspaceThroughService(OPEN_INPUT, { service });
    // Author one operation (the demolition over the wall faces) so the
    // revision has a recorded target to revert.
    const { buildDirectManipulationIntent, submitIntent } = await import("./operations-core");
    const scene = (await import("./fixtures")).demoObservedScene();
    const wallFaces = scene.elements.find(
      (element) => element.elementId === "node-wall-002",
    );
    if (wallFaces === undefined) {
      throw new Error("the demo wall-faces element is missing");
    }
    const deps = {
      service,
      clock: steppedWorkspaceClock("2026-09-16T10:00:00.000Z", 60_000),
      authoredBy: DEMO_SOLUTION_WORLD.userId,
    };
    const intent = buildDirectManipulationIntent(
      {
        elementId: wallFaces.elementId,
        operationType: "demolition-removal",
        parameterValues: { length: 5, height: 2.4, thickness: 0.1 },
        intentId: "intent-revise-probe-001",
      },
      wallFaces,
      opened,
      deps.clock.now(),
      deps.authoredBy,
    );
    const authored = await submitIntent(opened, intent, deps);
    const version = currentVersionOf(authored);
    const revertOperationId = version.operations[0]!.operationId;

    const viaPort = await service.revise({
      version,
      revertOperationId,
      createdAt: "2026-09-16T10:05:00.000Z",
      materializeClock: { base: "2026-09-16T10:00:00.000Z", stepMs: 60_000 },
      revisionProvenance: {
        authoredBy: DEMO_SOLUTION_WORLD.userId,
        reason: "probe the equivalence",
        authoredAt: "2026-09-16T10:05:00.000Z",
      },
    });
    const direct = reviseVersion({
      version,
      revertOperationId,
      capabilityProfile: (await import("../../../../packages/solution-contract/src/index"))
        .REFERENCE_BUILDING_OPERATION_PROFILE,
      createdAt: "2026-09-16T10:05:00.000Z",
      materializeClock: steppedMaterializeClock(
        Date.parse("2026-09-16T10:00:00.000Z"),
        60_000,
      ),
      revisionProvenance: {
        authoredBy: DEMO_SOLUTION_WORLD.userId,
        reason: "probe the equivalence",
        authoredAt: "2026-09-16T10:05:00.000Z",
      },
      baselineGeometry: demoBaselineGeometry(),
    });
    expect(viaPort).toEqual(direct);
    expect(viaPort.outcome).toBe("revised");
  });
});
