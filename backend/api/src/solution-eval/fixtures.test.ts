/**
 * PROD-029 fixture tests — the committed reference data is PROVEN against
 * the canonical components: every inline golden equals the LIVE engine /
 * validator / BOQ-deriver / compiler output AND the packages' committed
 * golden fixtures (drift fails the root verify gate).
 */

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  decodeEngineeringOperationIntent,
  REFERENCE_BUILDING_DOMAIN,
  REFERENCE_BUILDING_OPERATION_PROFILE,
} from "@aise/solution-contract";
import type { EngineeringOperationIntent } from "@aise/solution-contract";
import {
  replaySolution,
  TableBaselineGeometryResolver,
  validateSolutionVersion,
} from "@aise/solution-engine";
import { deriveSolutionBoq } from "@aise/solution-boq";
import {
  validateProviderProfile,
  replayRegistry,
} from "@aise/provider-registry";
import { createSolutionCommandCompiler } from "../reasoning/solution/compiler";
import { demoSessionContext } from "../reasoning/solution/testkit";
import {
  CANONICAL_BASELINE_STATE_DIGEST,
  CANONICAL_BOQ_LINES,
  CANONICAL_COMPILER_SEMANTICS,
  CANONICAL_ENGINE_STEPS,
  CANONICAL_VALIDATION,
  COMPILER_CORPUS_SLICE,
  COMPILER_DEMO_SESSION,
  committedScenarioMatrix,
  canonicalRegistryLog,
  SUBSTITUTE_PROFILES,
  WALL_UPGRADE_INTENT_PAYLOADS,
  WALL_UPGRADE_WORLD,
} from "./fixtures";
import { parseSubstitutionScenario } from "./model";

const REPO_ROOT = join(import.meta.dir, "..", "..", "..", "..");
const CONTRACT_FIXTURES = join(REPO_ROOT, "packages", "solution-contract", "fixtures");
const ENGINE_FIXTURES = join(REPO_ROOT, "packages", "solution-engine", "fixtures");
const BOQ_FIXTURES = join(REPO_ROOT, "packages", "solution-boq", "fixtures");

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, "utf8")) as unknown;
}

/** The LIVE wall-upgrade journey through the real engine (the canonical components). */
function liveWallUpgrade() {
  const intents: EngineeringOperationIntent[] = WALL_UPGRADE_INTENT_PAYLOADS.map(
    (payload) => decodeEngineeringOperationIntent(payload),
  );
  const replay = replaySolution({
    solutionId: WALL_UPGRADE_WORLD.solutionId,
    projectId: WALL_UPGRADE_WORLD.projectId,
    title: WALL_UPGRADE_WORLD.title,
    problemStatement: WALL_UPGRADE_WORLD.problemStatement,
    domain: REFERENCE_BUILDING_DOMAIN,
    baselineRealityVersionId: WALL_UPGRADE_WORLD.baselineRealityVersionId,
    intents,
    capabilityProfile: REFERENCE_BUILDING_OPERATION_PROFILE,
    baselineGeometry: new TableBaselineGeometryResolver(WALL_UPGRADE_WORLD.baselineGeometry),
    materializeClock: (stateIndex: number) => WALL_UPGRADE_WORLD.materializeClock(stateIndex),
    createdAt: WALL_UPGRADE_WORLD.createdAt,
  });
  if (replay.outcome !== "complete") {
    throw new Error("fixtures test: the live wall-upgrade replay failed");
  }
  const snapshot = validateSolutionVersion({
    version: replay.version,
    capabilityProfile: REFERENCE_BUILDING_OPERATION_PROFILE,
    validatedAt: WALL_UPGRADE_WORLD.validatedAt,
  });
  return { replay, snapshot };
}

/* ------------------------------------------------------------------ */
/* The committed intent payloads equal the contract's fixtures           */
/* ------------------------------------------------------------------ */

describe("solution-eval fixtures: committed contract fixtures", () => {
  test("the wall-upgrade intent payloads are byte-identical to the contract corpus", () => {
    const names = [
      "valid-demolition-removal",
      "valid-block-wall-placement",
      "valid-plaster-application",
    ];
    for (const [index, name] of names.entries()) {
      const payload = WALL_UPGRADE_INTENT_PAYLOADS[index] ?? null;
      const committed = readJson(
        join(CONTRACT_FIXTURES, "operation", `EngineeringOperationIntent.${name}.json`),
      );
      expect(payload).not.toBeNull();
      expect(JSON.parse(JSON.stringify(payload))).toEqual(committed);
    }
  });

  test("the baseline geometry table equals the engine's committed fixture", () => {
    const committed = readJson(join(ENGINE_FIXTURES, "baseline-geometry.json"));
    expect(
      JSON.parse(JSON.stringify(WALL_UPGRADE_WORLD.baselineGeometry)),
    ).toEqual(committed);
  });
});

/* ------------------------------------------------------------------ */
/* The engine seam's golden equals the live canonical engine            */
/* ------------------------------------------------------------------ */

describe("solution-eval fixtures: the engine golden chain", () => {
  test("the committed engine steps equal the engine's wall-upgrade golden byte-for-byte", () => {
    const golden = readJson(join(ENGINE_FIXTURES, "wall-upgrade-expected.json")) as {
      readonly replay: {
        readonly states: readonly {
          readonly stateIndex: number;
          readonly stateId: string;
          readonly contentDigest: string;
        }[];
        readonly steps: readonly {
          readonly stepIndex: number;
          readonly intentId: string;
          readonly quantities: readonly {
            readonly label: string;
            readonly dimension: string;
            readonly value: number;
            readonly unit: string;
            readonly direction: string;
            readonly calculationRef: string;
          }[];
        }[];
      };
    };
    for (const step of CANONICAL_ENGINE_STEPS) {
      const goldenState = golden.replay.states[step.stepIndex];
      const goldenStep = golden.replay.steps[step.stepIndex - 1];
      if (goldenState === undefined || goldenStep === undefined) {
        throw new Error("fixtures test: the engine golden is missing a state or step");
      }
      expect(step.resultingStateId).toBe(goldenState.stateId);
      expect(step.stateContentDigest).toBe(goldenState.contentDigest);
      expect(step.intentRef).toBe(goldenStep.intentId);
      expect(JSON.parse(JSON.stringify(step.quantities))).toEqual(
        goldenStep.quantities.map((quantity) => ({
          label: quantity.label,
          dimension: quantity.dimension,
          value: quantity.value,
          unit: quantity.unit,
          direction: quantity.direction,
          calculationRef: quantity.calculationRef,
        })),
      );
    }
  });

  test("the committed engine steps equal the LIVE engine replay", () => {
    const { replay } = liveWallUpgrade();
    for (const step of CANONICAL_ENGINE_STEPS) {
      const state = replay.version.states[step.stepIndex];
      const applied = replay.steps[step.stepIndex - 1]?.applied;
      if (state === undefined || applied === undefined || applied.outcome !== "applied") {
        throw new Error("fixtures test: the live replay is missing a state or applied step");
      }
      expect(step.resultingStateId).toBe(state.stateId);
      expect(state.contentDigest).toBeDefined();
      expect(step.stateContentDigest).toBe(state.contentDigest as string);
      expect(step.operationType as string).toBe(applied.operation.operationType as string);
      expect(JSON.parse(JSON.stringify(step.quantities))).toEqual(
        applied.quantities.map((quantity) => ({
          label: quantity.label,
          dimension: quantity.dimension,
          value: quantity.value,
          unit: quantity.unit,
          direction: quantity.direction,
          calculationRef: quantity.calculationRef,
        })),
      );
    }
  });

  test("the baseline state digest equals the engine golden's state 0 digest", () => {
    const { replay } = liveWallUpgrade();
    const stateZero = replay.version.states[0];
    if (stateZero === undefined) {
      throw new Error("fixtures test: the live replay has no baseline state");
    }
    expect(stateZero.contentDigest).toBe(CANONICAL_BASELINE_STATE_DIGEST);
  });
});

/* ------------------------------------------------------------------ */
/* The validation seam's golden equals the live canonical validator      */
/* ------------------------------------------------------------------ */

describe("solution-eval fixtures: the validation golden", () => {
  test("the committed validation projection equals the LIVE deterministic validator", () => {
    const { snapshot } = liveWallUpgrade();
    expect(CANONICAL_VALIDATION.outcome as string).toBe(snapshot.outcome as string);
    expect(CANONICAL_VALIDATION.outcome).toBe("pass");
    expect(JSON.parse(JSON.stringify(CANONICAL_VALIDATION.checks))).toEqual(
      snapshot.checks.map((check) => ({
        checkId: check.checkId,
        result: check.result,
        ...(check.detail === undefined ? {} : { detail: check.detail }),
      })),
    );
    expect(CANONICAL_VALIDATION.checks).toHaveLength(7);
  });
});

/* ------------------------------------------------------------------ */
/* The BOQ seam's golden equals the live canonical derivation           */
/* ------------------------------------------------------------------ */

describe("solution-eval fixtures: the BOQ golden", () => {
  test("the committed BOQ lines equal the LIVE canonical derivation (7 lines)", () => {
    const { replay, snapshot } = liveWallUpgrade();
    const boq = deriveSolutionBoq({ version: replay.version, snapshot });
    expect(boq.lines).toHaveLength(7);
    const liveLines = boq.lines.map((line) => ({
      activity: line.activity,
      direction: line.direction,
      dimension: line.quantity.dimension,
      unit: line.quantity.unit,
      value: line.quantity.value,
      ...(line.material === undefined ? {} : { material: line.material }),
      calculationRef: line.quantity.calculationRef,
    }));
    expect(JSON.parse(JSON.stringify(CANONICAL_BOQ_LINES))).toEqual(liveLines);
  });

  test("the committed BOQ lines equal the BOQ package's committed golden", () => {
    const golden = readJson(join(BOQ_FIXTURES, "wall-upgrade-boq-expected.json")) as {
      readonly lines: readonly {
        readonly activity: string;
        readonly direction: string;
        readonly material?: string;
        readonly quantity: {
          readonly dimension: string;
          readonly unit: string;
          readonly value: number;
          readonly calculationRef: string;
        };
      }[];
    };
    expect(JSON.parse(JSON.stringify(CANONICAL_BOQ_LINES))).toEqual(
      golden.lines.map((line) => ({
        activity: line.activity,
        direction: line.direction,
        dimension: line.quantity.dimension,
        unit: line.quantity.unit,
        value: line.quantity.value,
        ...(line.material === undefined ? {} : { material: line.material }),
        calculationRef: line.quantity.calculationRef,
      })),
    );
  });
});

/* ------------------------------------------------------------------ */
/* The compiler seam's golden equals the live canonical compiler         */
/* ------------------------------------------------------------------ */

describe("solution-eval fixtures: the compiler golden", () => {
  test("the inlined demo session equals the PROD-023 committed demo session", () => {
    expect(COMPILER_DEMO_SESSION).toEqual(demoSessionContext());
  });

  test("the committed compiler semantics equal the LIVE canonical compiler output", async () => {
    const compiler = createSolutionCommandCompiler({
      clock: () => "2026-09-16T09:05:00.000Z",
    });
    for (const entry of COMPILER_CORPUS_SLICE) {
      const compiled = await compiler.compile({
        utterance: entry.utterance,
        session: COMPILER_DEMO_SESSION,
      });
      expect(compiled.kind).toBe("operation-intent");
      if (compiled.kind !== "operation-intent") {
        continue;
      }
      const intent = compiled.intent;
      const projection = {
        operationType: intent.operationType,
        vertical: intent.domain.vertical,
        parameters: intent.parameters.map((parameter) => ({
          name: parameter.name,
          value: parameter.value,
          ...(parameter.unit === undefined ? {} : { unit: parameter.unit }),
        })),
        target: {
          selectorKind: intent.target.selectorKind,
          nodeRefs: intent.target.nodeRefs,
          geometryRefs: intent.target.geometryRefs.map((ref) => ({
            kind: ref.kind,
            ref: ref.ref,
          })),
          units: { linear: intent.target.units.linear, angular: intent.target.units.angular },
        },
        dependsOn: intent.dependsOn.map((dependency) => ({
          operationRef: dependency.operationRef,
          dependencyKind: dependency.dependencyKind,
        })),
      };
      const committedSemantics = CANONICAL_COMPILER_SEMANTICS[entry.entryId] ?? null;
      expect(committedSemantics).not.toBeNull();
      expect(committedSemantics).toEqual(projection);
    }
  });

  test("the corpus slice utterances equal the committed PROD-023 corpus entries", async () => {
    const { COMMAND_CORPUS } = await import("../reasoning/solution/corpus");
    for (const entry of COMPILER_CORPUS_SLICE) {
      const corpusEntry = COMMAND_CORPUS.find((candidate) => candidate.id === entry.entryId);
      if (corpusEntry === undefined) {
        throw new Error(`fixtures test: corpus entry ${entry.entryId} is missing`);
      }
      expect(entry.utterance).toBe(corpusEntry.utterance);
      expect(corpusEntry.sessionKind).toBe("demo");
    }
  });
});

/* ------------------------------------------------------------------ */
/* The substitute profiles + the canonical registry log                  */
/* ------------------------------------------------------------------ */

describe("solution-eval fixtures: the substitute catalog", () => {
  test("all eight substitute profiles are control-plane-valid (15/15 fields)", () => {
    expect(SUBSTITUTE_PROFILES).toHaveLength(8);
    for (const profile of SUBSTITUTE_PROFILES) {
      const validation = validateProviderProfile(profile);
      expect(validation.ok).toBe(true);
      if (validation.ok) {
        expect(validation.profileDigest).toHaveLength(64);
      }
      expect(profile.capabilities).toHaveLength(1);
      expect(profile.license.evaluationOnly).toBe(false);
    }
  });

  test("the profiles cover 4 seams × {faithful, divergent} with the seam capabilities", () => {
    const expected = [
      ["fixture-compiler-provider", "layer3-operation-compiler"],
      ["fixture-engine-provider", "layer3-engine-execution"],
      ["fixture-validation-provider", "layer3-validation"],
      ["fixture-boq-provider", "layer3-boq-derivation"],
    ];
    for (const [providerId, capability] of expected) {
      const versions = SUBSTITUTE_PROFILES.filter(
        (profile) => profile.providerId === providerId,
      );
      expect(versions).toHaveLength(2);
      expect(
        versions.every((profile) => profile.capabilities[0] === capability),
      ).toBe(true);
    }
  });

  test("the divergent profiles honestly declare their defect mode (closed vocabulary)", () => {
    const divergent = SUBSTITUTE_PROFILES.filter(
      (profile) => profile.technologyVersion === "1.1.0-fixture-divergent",
    );
    expect(divergent).toHaveLength(4);
    for (const profile of divergent) {
      expect(profile.failureModes.length).toBe(2);
    }
    const validationDefect = divergent.find(
      (profile) => profile.providerId === "fixture-validation-provider",
    );
    expect(
      validationDefect?.failureModes.some((mode) => mode.kind === "reasoning-failure"),
    ).toBe(true);
  });

  test("the canonical registry log replays lawfully with all eight substitutes in evaluation", () => {
    const replayed = replayRegistry(canonicalRegistryLog());
    expect(replayed.ok).toBe(true);
    if (replayed.ok) {
      expect(replayed.registry.events).toHaveLength(16);
      for (const profile of SUBSTITUTE_PROFILES) {
        const entry = replayed.registry.entryOf(
          profile.providerId,
          profile.technologyVersion,
        );
        expect(entry).toBeDefined();
        expect(entry?.state).toBe("evaluation");
      }
    }
  });
});

/* ------------------------------------------------------------------ */
/* The committed scenario matrix                                        */
/* ------------------------------------------------------------------ */

describe("solution-eval fixtures: the committed scenario matrix", () => {
  test("the matrix is 4 seams × {equal, divergent} = 8 scenarios, all parseable", () => {
    const matrix = committedScenarioMatrix();
    expect(matrix).toHaveLength(8);
    for (const scenario of matrix) {
      expect(() => parseSubstitutionScenario(JSON.parse(JSON.stringify(scenario)))).not.toThrow();
    }
    const seams = new Set(matrix.map((scenario) => scenario.seam));
    expect(seams.size).toBe(4);
    for (const seam of seams) {
      const seamScenarios = matrix.filter((scenario) => scenario.seam === seam);
      expect(
        seamScenarios.filter((s) => s.expectation === "canonical-equality"),
      ).toHaveLength(1);
      expect(
        seamScenarios.filter((s) => s.expectation === "declared-divergence"),
      ).toHaveLength(1);
    }
  });

  test("the committed matrix is deterministic (two constructions are deep-equal)", () => {
    expect(committedScenarioMatrix()).toEqual(committedScenarioMatrix());
  });
});
