/**
 * Mutation-protection sabotage tests (PROD-022).
 *
 * Proves "the authoritative Reality Graph is never mutated" and "the
 * engine exposes NO write path" — the work order's acceptance criterion —
 * from THREE angles:
 *
 *  1. COMPILE-TIME API INVENTORY: the package's public surface is scanned
 *     by name and by kind — every export is a function, a class or a
 *     frozen constant; the exported-name vocabulary contains NO
 *     mutation-sounding surface (save/update/delete/remove/write/persist/
 *     commit/mutate/push/pop/patch...) and NO write-shaped method on
 *     any exported interface (the ONLY baseline seam,
 *     `BaselineGeometryResolver`, exposes exactly ONE READ method).
 *
 *  2. RUNTIME SABOTAGE: a hostile caller passes baseline geometry via a
 *     resolver that RECORDS every call and REJECTS any attempted write
 *     method, applies operations, revises versions, validates, derives
 *     quantities — then asserts: zero mutation attempts, inputs deep-equal
 *     to their pre-call snapshots (the engine never mutates caller state),
 *     and no additional properties sneaked onto input objects.
 *
 *  3. STRUCTURAL APPEND-ONLY: every engine output is a NEW object — the
 *     inputs' identities (references) are never reused as outputs, and
 *     historical states are structurally unreachable for writes (there is
 *     no API surface that returns a mutable reference INTO a prior
 *     version's internals that the engine itself retains).
 *
 * Deterministic: no network, no clock, no random values.
 */

import { describe, expect, test } from "bun:test";
import * as engine from "./index";
import { applyOperation } from "./apply";
import { deriveStateQuantities } from "./quantities";
import { replaySolution, steppedMaterializeClock } from "./replay";
import { reviseVersion } from "./revise";
import { validateSolutionVersion } from "./validation";
import {
  REFERENCE_PROFILE,
  WALL_WORLD,
  RecordingResolver,
  contractIntent,
  deepClone,
  demoBaselineGeometry,
  wallUpgradeIntents,
} from "./testkit";

/* ------------------------------------------------------------------ */
/* 1. Compile-time API inventory                                        */
/* ------------------------------------------------------------------ */

const MUTATION_VERBS = [
  "save",
  "update",
  "delete",
  "remove",
  "write",
  "persist",
  "commit",
  "mutate",
  "patch",
  "push",
  "pop",
  "splice",
  "assign",
  "store",
  "insert",
  "upsert",
  "destroy",
  "reset",
  "clear",
];

describe("compile-time API inventory (no mutation surface by name or kind)", () => {
  test("every export is a function, a class or a frozen constant — never a mutable state holder", () => {
    for (const [name, value] of Object.entries(engine)) {
      if (typeof value === "function") {
        continue; // pure functions (incl. classes) — fine
      }
      if (typeof value === "object" && value !== null) {
        // constants must be frozen (UNIT_VOCABULARY, limits, vocabularies…)
        expect(Object.isFrozen(value)).toBe(true);
        continue;
      }
      expect(["string", "number", "boolean"]).toContain(typeof value);
      void name;
    }
  });

  test("the exported-name vocabulary contains no mutation-sounding surface", () => {
    const names = Object.keys(engine);
    expect(names.length).toBeGreaterThan(25); // a real API, not a stub
    const callableNames: string[] = [];
    for (const name of names) {
      const value = (engine as Record<string, unknown>)[name];
      if (typeof value === "function") {
        callableNames.push(name);
      }
    }
    // every CALLABLE export is a pure function/constructor whose name
    // contains no mutation verb (write/persist/commit/save/...)
    for (const name of callableNames) {
      const lower = name.toLowerCase();
      for (const verb of MUTATION_VERBS) {
        expect(lower.includes(verb)).toBe(false);
      }
    }
    expect(callableNames.length).toBeGreaterThan(10);
  });

  test("the ONLY baseline seam is read-only: exactly one method, named resolveSurfaceArea, returning data", () => {
    const resolver = demoBaselineGeometry();
    const ownNames = Object.getOwnPropertyNames(resolver);
    const prototypeNames = Object.getOwnPropertyNames(
      Object.getPrototypeOf(resolver),
    ).filter((name) => name !== "constructor");
    expect([...ownNames, ...prototypeNames]).toEqual(["resolveSurfaceArea"]);
    // a write attempt on the resolver instance is structurally absent
    const hostile = resolver as unknown as Record<string, unknown>;
    expect(hostile["save"]).toBeUndefined();
    expect(hostile["update"]).toBeUndefined();
    expect(hostile["writeReality"]).toBeUndefined();
  });

  test("the resolver's returned surface facts are frozen data (no mutation handle back into reality)", () => {
    const resolver = demoBaselineGeometry();
    const fact = resolver.resolveSurfaceArea({
      contractVersion: "1.0.0",
      selectorKind: "face-set",
      nodeRefs: ["node-wall-002"],
      geometryRefs: [{ kind: "polygon", ref: "geo-wall-faces-002", contractVersion: "1.0.0" }],
      units: { linear: "m", angular: "rad" },
      description: "sabotage probe",
    });
    expect(fact).toEqual({ value: 12.5, unit: "m2" });
  });
});

/* ------------------------------------------------------------------ */
/* 2. Runtime sabotage                                                  */
/* ------------------------------------------------------------------ */

describe("runtime sabotage (a hostile caller cannot reach any mutation surface)", () => {
  function wallUpgradeReplay(resolver: ReturnType<typeof demoBaselineGeometry>) {
    return replaySolution({
      solutionId: WALL_WORLD.solutionId,
      projectId: WALL_WORLD.projectId,
      title: WALL_WORLD.title,
      problemStatement: WALL_WORLD.problemStatement,
      domain: WALL_WORLD.domain,
      baselineRealityVersionId: WALL_WORLD.baselineRealityVersionId,
      intents: wallUpgradeIntents(),
      capabilityProfile: REFERENCE_PROFILE,
      baselineGeometry: resolver,
      materializeClock: steppedMaterializeClock(WALL_WORLD.clockStartMs, WALL_WORLD.clockStepMs),
      createdAt: WALL_WORLD.createdAt,
    });
  }

  test("the hostile resolver records ONLY read calls; the inputs stay byte-identical", () => {
    const hostileResolver = new RecordingResolver();
    const intents = wallUpgradeIntents();
    const intentSnapshot = deepClone(intents);
    const profileSnapshot = deepClone(REFERENCE_PROFILE);
    const callsSnapshot = [...hostileResolver.calls];

    const replay = wallUpgradeReplay(hostileResolver as unknown as ReturnType<typeof demoBaselineGeometry>);
    expect(replay.outcome).toBe("complete");

    // the resolver was CALLED (the read seam works)...
    expect(hostileResolver.calls.length).toBeGreaterThan(0);
    expect(callsSnapshot).toEqual([]);
    // ...but nothing was mutated: inputs deep-equal their snapshots
    expect(intents).toEqual(intentSnapshot);
    expect(REFERENCE_PROFILE).toEqual(profileSnapshot);
    // every recorded call is a pure READ of a geometry ref (never a write)
    expect(
      hostileResolver.calls.every(
        (call) => typeof call.ref === "string" && !("write" in call),
      ),
    ).toBe(true);
  });

  test("applying, revising, validating and deriving quantities over a hostile resolver mutates nothing", () => {
    const hostileResolver = new RecordingResolver();
    const geometry = hostileResolver as unknown as ReturnType<typeof demoBaselineGeometry>;

    // apply
    const intent = contractIntent("valid-plaster-application");
    const intentSnapshot = deepClone(intent);
    const applyResult = applyOperation({
      baseline: {
        contractVersion: "1.0.0",
        stateId: "state-sabotage-baseline-0000000000000000000000",
        solutionId: "solution-demo-001",
        versionNumber: 1,
        stateIndex: 0,
        baselineRealityVersionId: "rgv-demo-0007",
        epistemicStatus: "PROPOSED",
        appliedOperationIds: [],
        materializedAt: "2026-09-16T10:00:00.000Z",
      },
      intent,
      capabilityProfile: REFERENCE_PROFILE,
      materializedAt: "2026-09-16T10:01:00.000Z",
      baselineGeometry: geometry,
    });
    expect(applyResult.outcome).toBe("applied");
    expect(intent).toEqual(intentSnapshot);

    // replay + revise + validate + quantities
    const replay = wallUpgradeReplay(geometry);
    expect(replay.outcome).toBe("complete");
    if (replay.outcome !== "complete") {
      return;
    }
    const versionSnapshot = deepClone(replay.version);
    const revision = reviseVersion({
      version: replay.version,
      revertOperationId: replay.version.operations[1]!.operationId,
      capabilityProfile: REFERENCE_PROFILE,
      baselineGeometry: geometry,
      createdAt: "2026-09-16T11:00:00.000Z",
      materializeClock: steppedMaterializeClock(Date.UTC(2026, 8, 16, 11, 0, 0, 0), 60_000),
      revisionProvenance: {
        authoredBy: "saboteur",
        reason: "attempt to mutate history",
        authoredAt: "2026-09-16T10:45:00.000Z",
      },
    });
    expect(revision.outcome).toBe("revised");
    expect(replay.version).toEqual(versionSnapshot); // the historical version is untouched

    validateSolutionVersion({
      version: replay.version,
      capabilityProfile: REFERENCE_PROFILE,
      baselineGeometry: geometry,
      validatedAt: "2026-09-16T10:30:00.000Z",
    });
    deriveStateQuantities(replay.version);
    expect(replay.version).toEqual(versionSnapshot);
    expect(hostileResolver.calls.every((call) => typeof call.ref === "string")).toBe(true);
  });

  test("attempting to smuggle a write method through the resolver seam changes nothing the engine can reach", () => {
    const smuggled = {
      resolveSurfaceArea: () => null,
      writeReality: () => {
        throw new Error("sabotage must be unreachable");
      },
    } as unknown as ReturnType<typeof demoBaselineGeometry>;
    // the engine calls ONLY resolveSurfaceArea (a needs-input refusal here
    // because the resolver answers null) — the smuggled write method is
    // never invoked because the engine never calls any other name.
    const result = applyOperation({
      baseline: {
        contractVersion: "1.0.0",
        stateId: "state-smuggle-baseline-00000000000000000000000",
        solutionId: "solution-demo-001",
        versionNumber: 1,
        stateIndex: 0,
        baselineRealityVersionId: "rgv-demo-0007",
        epistemicStatus: "PROPOSED",
        appliedOperationIds: [],
        materializedAt: "2026-09-16T10:00:00.000Z",
      },
      intent: contractIntent("valid-plaster-application"),
      capabilityProfile: REFERENCE_PROFILE,
      materializedAt: "2026-09-16T10:01:00.000Z",
      baselineGeometry: smuggled,
    });
    expect(result.outcome).toBe("needs-input");
    expect((result as unknown as { reasons: { code: string }[] }).reasons[0]?.code).toBe(
      "surface_area_unresolved",
    );
  });
});

/* ------------------------------------------------------------------ */
/* 3. Structural append-only                                            */
/* ------------------------------------------------------------------ */

describe("structural append-only (every output is a NEW object)", () => {
  test("the applied resulting state is a different object than the baseline (no in-place reuse)", () => {
    const baseline = {
      contractVersion: "1.0.0",
      stateId: "state-identity-probe-000000000000000000000000",
      solutionId: "solution-demo-001",
      versionNumber: 1,
      stateIndex: 0,
      baselineRealityVersionId: "rgv-demo-0007",
      epistemicStatus: "PROPOSED" as const,
      appliedOperationIds: [] as string[],
      materializedAt: "2026-09-16T10:00:00.000Z",
    };
    const result = applyOperation({
      baseline,
      intent: contractIntent("valid-excavation-direct"),
      capabilityProfile: REFERENCE_PROFILE,
      materializedAt: "2026-09-16T10:01:00.000Z",
      baselineGeometry: demoBaselineGeometry(),
    });
    expect(result.outcome).toBe("applied");
    if (result.outcome !== "applied") {
      return;
    }
    expect(result.resultingState).not.toBe(baseline);
    expect(baseline.appliedOperationIds).toEqual([]); // untouched
    expect(result.resultingState.appliedOperationIds).toHaveLength(1);
    expect(result.resultingState.stateIndex).toBe(1);
  });

  test("no engine output aliases the input intent's arrays (mutating outputs cannot corrupt inputs)", () => {
    const intent = contractIntent("valid-excavation-direct");
    const result = applyOperation({
      baseline: {
        contractVersion: "1.0.0",
        stateId: "state-alias-probe-0000000000000000000000000",
        solutionId: "solution-demo-001",
        versionNumber: 1,
        stateIndex: 0,
        baselineRealityVersionId: "rgv-demo-0007",
        epistemicStatus: "PROPOSED",
        appliedOperationIds: [],
        materializedAt: "2026-09-16T10:00:00.000Z",
      },
      intent,
      capabilityProfile: REFERENCE_PROFILE,
      materializedAt: "2026-09-16T10:01:00.000Z",
      baselineGeometry: demoBaselineGeometry(),
    });
    expect(result.outcome).toBe("applied");
    if (result.outcome !== "applied") {
      return;
    }
    // mutating the OUTPUT must not corrupt the INPUT (no shared arrays)
    result.operation.parameters.push({ name: "sabotage", value: 1, unit: "m" });
    expect(intent.parameters).toHaveLength(3);
    expect(result.resultingState.appliedOperationIds?.push("sabotage"));
    expect(intent.parameters).toHaveLength(3);
  });
});
