/**
 * PROD-029 — the Layer-3 SUBSTITUTION-EVALUATION HARNESS.
 *
 * `evaluateSubstitution(scenario, registryLog)` — the provider-neutral
 * evaluation entry point for Layer 3 (the HFX-301/302/303 consumers call
 * THIS):
 *
 *   1. BASELINE PATH — the canonical components are imported and CALLED
 *      (never re-implemented): the real PROD-023 command compiler compiles
 *      the corpus-slice utterances; the real PROD-022 solution engine
 *      replays the committed wall-upgrade journey, validates it; the real
 *      PROD-025 derivation derives the BOQ. The baseline is the canonical
 *      components' LIVE behavior over the committed fixtures.
 *   2. SUBSTITUTED PATH — the substitute's DECLARED raw executions flow
 *      through the provider-registry CONTROL PLANE's normalized I/O
 *      (`validateProviderInput` → `normalizeResult`), then through the
 *      harness's STRICT canonical projections (model.ts — the D26
 *      boundary guard: provider-specific types are refused, never
 *      coerced).
 *   3. COMPARISON — canonical outputs are compared point by point
 *      (operation identities, state digests, quantity values, validation
 *      verdicts, BOQ lines). Equal → substitution PROVEN; different → the
 *      difference is RECORDED as evidence with the right
 *      closed-vocabulary failure kind (operation-semantic-failure for
 *      identity/state/quantity divergence; reasoning-failure for verdict
 *      divergence; contract-mismatch for shape divergence) — never hidden.
 *   4. EMISSION — a control-plane `BenchmarkRecord` (content-addressed,
 *      failure observations from the CLOSED vocabulary) + a portable
 *      `ProvenanceManifest` (digest-verifiable) + the lawful registry
 *      events to append (execution-normalized per input,
 *      benchmark-recorded, provenance-sealed).
 *
 * PURE DETERMINISTIC COMPUTATION: no network, no clock reads (every instant
 * is a declared fixture constant), no randomness, no filesystem. Identical
 * scenario + registry log → byte-identical evaluation (proven by the
 * committed goldens and the determinism tests).
 */

import { createHash } from "node:crypto";
import {
  decodeEngineeringOperationIntent,
  deriveEngineeringOperationId,
  REFERENCE_BUILDING_DOMAIN,
  REFERENCE_BUILDING_OPERATION_PROFILE,
  operationSemanticIdentityOfIntent,
} from "@aise/solution-contract";
import type { EngineeringOperationIntent, OperationSemanticIdentity, SolutionVersion } from "@aise/solution-contract";
import {
  replaySolution,
  TableBaselineGeometryResolver,
  validateSolutionVersion,
} from "@aise/solution-engine";
import type { EngineQuantity } from "@aise/solution-engine";
import { deriveSolutionBoq } from "@aise/solution-boq";
import {
  applyRegistryEvent,
  normalizeResult,
  providerResultDigestOf,
  replayRegistry,
  sealProvenanceManifest,
  validateBenchmarkRecord,
  validateProviderInput,
} from "@aise/provider-registry";
import type {
  BenchmarkRecord,
  FailureKind,
  ProviderInput,
  ProviderProfile,
  ProviderRegistryEvent,
  ProviderResult,
  ProvenanceManifest,
} from "@aise/provider-registry";
import { createSolutionCommandCompiler } from "../reasoning/solution/compiler";
import type { SolutionValidationSnapshot } from "@aise/solution-contract";
import {
  DIVERGENCE_KIND_BY_POINT,
  SEAM_CAPABILITIES,
  SEAM_BASELINE_PAIRING,
  projectCanonicalBoqLines,
  projectCanonicalDigest,
  projectCanonicalIntentSemantics,
  projectCanonicalQuantities,
  projectCanonicalValidationChecks,
  projectCanonicalVerdict,
} from "./model";
import type {
  CanonicalBoqLine,
  CanonicalIntentSemantics,
  CanonicalQuantity,
  CanonicalValidationCheck,
  ComparisonPointResult,
  SubstitutionDivergence,
  SubstitutionExpectation,
  SubstitutionRefusal,
  SubstitutionScenario,
  SubstitutionSeam,
  SubstitutionVerdict,
  SubstituteReference,
} from "./model";
import {
  canonicalJsonText,
  COMPILER_CORPUS_SLICE,
  COMPILER_DEMO_SESSION,
  COMPILER_WORLD,
  SOLUTION_EVAL_ENVIRONMENT,
  WALL_UPGRADE_INTENT_PAYLOADS,
  WALL_UPGRADE_WORLD,
} from "./fixtures";

/* ------------------------------------------------------------------ */
/* The evaluation result                                                */
/* ------------------------------------------------------------------ */

/** The full outcome of one substitution evaluation. */
export interface SubstitutionEvaluation {
  readonly scenarioId: string;
  readonly seam: SubstitutionSeam;
  readonly substitute: SubstituteReference;
  readonly expectation: SubstitutionExpectation;
  readonly verdict: SubstitutionVerdict;
  /** Whether the harness's verdict matches the scenario's declared expectation. */
  readonly expectationSatisfied: boolean;
  readonly comparisonPoints: readonly ComparisonPointResult[];
  /** Present iff the verdict is divergence-recorded. */
  readonly divergence?: SubstitutionDivergence;
  /** Present iff the verdict is substitution-refused (typed, machine-readable). */
  readonly refusal?: SubstitutionRefusal;
  /** Present iff a comparison ran: the emitted control-plane record. */
  readonly benchmarkRecord?: BenchmarkRecord;
  /** Present iff a comparison ran: the sealed portable provenance manifest. */
  readonly provenanceManifest?: ProvenanceManifest;
  /** The registry events this evaluation appends (empty for refusals). */
  readonly registryEvents: readonly ProviderRegistryEvent[];
}

/* ------------------------------------------------------------------ */
/* Internal plumbing                                                    */
/* ------------------------------------------------------------------ */

const BENCHMARK_ID = "layer3-substitution-eval/1" as const;
const HARNESS_CODE_VERSION = "solution-eval/1" as const;

function sha256Hex(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

/** The deterministic digest pinning the evaluated scenario (the reproduction input). */
function scenarioInputsDigest(scenario: SubstitutionScenario): string {
  return sha256Hex(canonicalJsonText(scenario));
}

/** One canonical seam input the harness drives through the substitute. */
interface SeamInput {
  readonly inputKey: string;
  readonly providerInput: ProviderInput;
}

/** The substituted outcome of one input: normalized + canonically projected, or shape-refused. */
type SubstitutedOutcome =
  | { readonly ok: true; readonly result: ProviderResult; readonly inputDigest: string }
  | { readonly ok: false; readonly shapeRefusal: string };

// (RefusedOutcome + refusal() declared below, before first use.)

/** The scenario-less part of a refused evaluation (composed by refusedEvaluation). */
interface RefusedOutcome {
  readonly verdict: "substitution-refused";
  readonly expectationSatisfied: false;
  readonly comparisonPoints: readonly never[];
  readonly registryEvents: readonly never[];
  readonly refusal: SubstitutionRefusal;
}

function refusal(kind: SubstitutionRefusal["kind"], detail: string): RefusedOutcome {
  return {
    verdict: "substitution-refused",
    expectationSatisfied: false,
    comparisonPoints: [],
    registryEvents: [],
    refusal: { kind, detail },
  };
}

/** Wraps the refusal with the scenario echo (the returned evaluation shape). */
function refusedEvaluation(
  scenario: SubstitutionScenario,
  kind: SubstitutionRefusal["kind"],
  detail: string,
): SubstitutionEvaluation {
  const outcome = refusal(kind, detail);
  return {
    scenarioId: scenario.scenarioId,
    seam: scenario.seam,
    substitute: scenario.substitute,
    expectation: scenario.expectation,
    verdict: outcome.verdict,
    expectationSatisfied: outcome.expectationSatisfied,
    comparisonPoints: outcome.comparisonPoints,
    registryEvents: outcome.registryEvents,
    refusal: outcome.refusal,
  };
}

/* ------------------------------------------------------------------ */
/* The baseline worlds (computed LIVE through the canonical components)  */
/* ------------------------------------------------------------------ */

/** Decodes the committed wall-upgrade intent payloads through the contract codec. */
function wallUpgradeIntents(): readonly EngineeringOperationIntent[] {
  return WALL_UPGRADE_INTENT_PAYLOADS.map((payload) =>
    decodeEngineeringOperationIntent(payload),
  );
}

interface WallUpgradeBaseline {
  readonly version: SolutionVersion;
  readonly snapshot: SolutionValidationSnapshot;
}

let wallUpgradeBaselineCache: WallUpgradeBaseline | undefined;

/**
 * Replays + validates the wall-upgrade journey through the REAL engine
 * (the canonical components' live behavior over the committed fixtures —
 * the committed goldens of the engine and BOQ packages pin the same
 * outputs; fixtures.test.ts proves the equality). Deterministic and
 * memoized: the baseline is reference data within one process.
 */
function wallUpgradeBaseline(): WallUpgradeBaseline {
  if (wallUpgradeBaselineCache !== undefined) {
    return wallUpgradeBaselineCache;
  }
  const replay = replaySolution({
    solutionId: WALL_UPGRADE_WORLD.solutionId,
    projectId: WALL_UPGRADE_WORLD.projectId,
    title: WALL_UPGRADE_WORLD.title,
    problemStatement: WALL_UPGRADE_WORLD.problemStatement,
    domain: REFERENCE_BUILDING_DOMAIN,
    baselineRealityVersionId: WALL_UPGRADE_WORLD.baselineRealityVersionId,
    intents: wallUpgradeIntents(),
    capabilityProfile: REFERENCE_BUILDING_OPERATION_PROFILE,
    baselineGeometry: new TableBaselineGeometryResolver(WALL_UPGRADE_WORLD.baselineGeometry),
    materializeClock: (stateIndex: number) => WALL_UPGRADE_WORLD.materializeClock(stateIndex),
    createdAt: WALL_UPGRADE_WORLD.createdAt,
  });
  if (replay.outcome !== "complete") {
    throw new Error(
      "solution-eval harness: the committed wall-upgrade baseline replay failed — an internal invariant is broken",
    );
  }
  const snapshot = validateSolutionVersion({
    version: replay.version,
    capabilityProfile: REFERENCE_BUILDING_OPERATION_PROFILE,
    validatedAt: WALL_UPGRADE_WORLD.validatedAt,
  });
  wallUpgradeBaselineCache = { version: replay.version, snapshot };
  return wallUpgradeBaselineCache;
}

/** A structural view of an intent OR a recorded operation (the identity-hashed fields). */
interface SemanticCarrier {
  readonly operationType: string;
  readonly domain: { readonly vertical: string };
  readonly parameters: readonly { name: string; value: number | string | boolean; unit?: string }[];
  readonly target: {
    readonly selectorKind: string;
    readonly nodeRefs: readonly string[];
    readonly geometryRefs: readonly { kind: string; ref: string }[];
    readonly units: { linear: string; angular: string };
  };
  readonly dependsOn: readonly { operationRef: string; dependencyKind: string }[];
}

/** The reduced semantic projection of an intent/operation (the identity-hashed fields). */
function intentSemanticProjectionOf(intent: SemanticCarrier): CanonicalIntentSemantics {
  return {
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
      geometryRefs: intent.target.geometryRefs.map((ref) => ({ kind: ref.kind, ref: ref.ref })),
      units: { linear: intent.target.units.linear, angular: intent.target.units.angular },
    },
    dependsOn: intent.dependsOn.map((dependency) => ({
      operationRef: dependency.operationRef,
      dependencyKind: dependency.dependencyKind,
    })),
  };
}

/**
 * Derives the canonical operation id of a PROJECTED semantic shape through
 * the CONTRACT's own derivation (comparison-only: the id is EVIDENCE, never
 * authority — nothing canonical is written from a provider output). The
 * non-hashed target/dependency fields are fixed fillers; the projected
 * (runtime-validated) vocabulary values are cast to the contract's inferred
 * schema types — the contract's derivation only hashes the reduced fields.
 */
function operationIdOfProjection(
  semantics: CanonicalIntentSemantics,
  context: { readonly solutionId: string; readonly versionNumber: number; readonly operationIndex: number },
): string {
  const identity = {
    solutionId: context.solutionId,
    versionNumber: context.versionNumber,
    operationIndex: context.operationIndex,
    operationType: semantics.operationType,
    vertical: semantics.vertical,
    parameters: semantics.parameters.map((parameter) => ({
      name: parameter.name,
      value: parameter.value,
      ...(parameter.unit === undefined ? {} : { unit: parameter.unit }),
    })),
    target: {
      contractVersion: "1.0.0",
      selectorKind: semantics.target.selectorKind,
      nodeRefs: [...semantics.target.nodeRefs],
      geometryRefs: semantics.target.geometryRefs.map((ref) => ({ kind: ref.kind, ref: ref.ref })),
      units: { linear: semantics.target.units.linear, angular: semantics.target.units.angular },
      description: "substitution comparison projection (not hashed into identity)",
    },
    dependsOn: semantics.dependsOn.map((dependency) => ({
      contractVersion: "1.0.0",
      operationRef: dependency.operationRef,
      dependencyKind: dependency.dependencyKind,
    })),
  } as unknown as OperationSemanticIdentity;
  return deriveEngineeringOperationId(identity);
}

/** The EngineQuantity → canonical quantity row projection (verbatim values). */
function canonicalQuantityOf(quantity: EngineQuantity): CanonicalQuantity {
  return {
    label: quantity.label,
    dimension: quantity.dimension,
    value: quantity.value,
    unit: quantity.unit,
    direction: quantity.direction,
    calculationRef: quantity.calculationRef,
  };
}

/* ------------------------------------------------------------------ */
/* The seam drivers (baseline inputs + comparison semantics)             */
/* ------------------------------------------------------------------ */

/** The per-seam baseline facts the substituted run is compared against. */
interface SeamBaseline {
  readonly inputs: readonly SeamInput[];
  readonly compare: (
    substituted: ReadonlyMap<string, SubstitutedOutcome>,
  ) => readonly ComparisonPointResult[];
}

/* --- operation-compiler seam ---------------------------------------- */

async function compilerBaseline(): Promise<SeamBaseline> {
  const compiler = createSolutionCommandCompiler({
    clock: () => COMPILER_WORLD.compiledAt,
  });
  const inputs: SeamInput[] = [];
  const baselineIds = new Map<string, { readonly operationId: string; readonly position: number }>();

  for (const [index, entry] of COMPILER_CORPUS_SLICE.entries()) {
    const position = index + 1;
    const compiled = await compiler.compile({
      utterance: entry.utterance,
      session: COMPILER_DEMO_SESSION,
    });
    if (compiled.kind !== "operation-intent") {
      throw new Error(
        `solution-eval harness: corpus entry ${entry.entryId} did not compile to an operation intent — an internal invariant is broken`,
      );
    }
    const context = {
      solutionId: COMPILER_WORLD.solutionId,
      versionNumber: COMPILER_WORLD.versionNumber,
      operationIndex: position,
    };
    const operationId = deriveEngineeringOperationId(
      operationSemanticIdentityOfIntent(compiled.intent, context),
    );
    baselineIds.set(entry.entryId, { operationId, position });
    inputs.push({
      inputKey: entry.entryId,
      providerInput: {
        kind: "provider-input",
        capability: SEAM_CAPABILITIES["operation-compiler"],
        payload: { utteranceId: entry.entryId, utterance: entry.utterance },
      },
    });
  }

  const compare = (substituted: ReadonlyMap<string, SubstitutedOutcome>): readonly ComparisonPointResult[] => {
    const points: ComparisonPointResult[] = [];
    for (const entry of COMPILER_CORPUS_SLICE) {
      const baseline = baselineIds.get(entry.entryId);
      const baselineOperationId = baseline?.operationId ?? "(missing-baseline)";
      const position = baseline?.position ?? 0;
      const outcome = substituted.get(entry.entryId);
      if (outcome === undefined) {
        continue; // handled by the missing-execution refusal before comparison
      }
      if (!outcome.ok) {
        points.push({
          pointKind: "operation-identity",
          subjectId: entry.entryId,
          baselineValue: baselineOperationId,
          substitutedValue: `(shape-refused)`,
          equal: false,
          divergenceKind: "contract-mismatch",
          detail:
            `utterance '${entry.entryId}': the substitute's output could not be projected onto the canonical ` +
            `semantic shape — ${outcome.shapeRefusal}`,
        });
        continue;
      }
      const outputs = outcome.result.outputs ?? {};
      const projection = projectCanonicalIntentSemantics(outputs["intentSemanticsJson"]);
      if (!projection.ok) {
        points.push({
          pointKind: "operation-identity",
          subjectId: entry.entryId,
          baselineValue: baselineOperationId,
          substitutedValue: "(shape-refused)",
          equal: false,
          divergenceKind: "contract-mismatch",
          detail:
            `utterance '${entry.entryId}': the substitute's intent semantics were refused at the canonical ` +
            `boundary — ${projection.refusal.detail}`,
        });
        continue;
      }
      const substitutedOperationId = operationIdOfProjection(projection.projected, {
        solutionId: COMPILER_WORLD.solutionId,
        versionNumber: COMPILER_WORLD.versionNumber,
        operationIndex: position,
      });
      const equal = substitutedOperationId === baselineOperationId;
      points.push({
        pointKind: "operation-identity",
        subjectId: entry.entryId,
        baselineValue: baselineOperationId,
        substitutedValue: substitutedOperationId,
        equal,
        ...(equal ? {} : { divergenceKind: DIVERGENCE_KIND_BY_POINT["operation-identity"] }),
        detail: equal
          ? `utterance '${entry.entryId}': the substitute's compiled semantics derive the SAME canonical operation identity as the canonical compiler`
          : `utterance '${entry.entryId}': the substitute's compiled semantics derive a DIFFERENT canonical operation identity — the operation semantics diverged`,
      });
    }
    return points;
  };

  return { inputs, compare };
}

/* --- engine-execution seam ------------------------------------------ */

function engineBaseline(): SeamBaseline {
  const { version } = wallUpgradeBaseline();
  const inputs: SeamInput[] = [];
  const baselineDigests = new Map<string, string>();
  const baselineQuantities = new Map<string, readonly CanonicalQuantity[]>();

  const replaySteps = wallUpgradeReplaySteps();
  for (const [index, step] of replaySteps.entries()) {
    const position = index + 1;
    const state = version.states[position];
    const parentState = version.states[position - 1];
    if (state === undefined || parentState === undefined) {
      throw new Error("solution-eval harness: the wall-upgrade state chain is short — an internal invariant is broken");
    }
    baselineDigests.set(`step-${position}`, state.contentDigest ?? "(missing-digest)");
    baselineQuantities.set(`step-${position}`, step.applied.quantities.map(canonicalQuantityOf));

    const intent = step.applied.operation;
    inputs.push({
      inputKey: `step-${position}`,
      providerInput: {
        kind: "provider-input",
        capability: SEAM_CAPABILITIES["engine-execution"],
        payload: {
          solutionId: WALL_UPGRADE_WORLD.solutionId,
          versionNumber: version.versionNumber,
          operationIndex: position,
          intentRef: intent.intentRef ?? step.intentId,
          operationType: intent.operationType,
          operationSemanticsJson: canonicalJsonText(intentSemanticProjectionOf(intent)),
          parentStateContentDigest: parentState.contentDigest ?? "",
        },
      },
    });
  }

  const compare = (substituted: ReadonlyMap<string, SubstitutedOutcome>): readonly ComparisonPointResult[] => {
    const points: ComparisonPointResult[] = [];
    for (const [index, step] of replaySteps.entries()) {
      const position = index + 1;
      const inputKey = `step-${position}`;
      const baselineDigest = baselineDigests.get(inputKey) ?? "(missing-baseline)";
      const baselineStepQuantities = baselineQuantities.get(inputKey) ?? [];
      const outcome = substituted.get(inputKey);
      if (outcome === undefined) {
        continue;
      }
      if (!outcome.ok) {
        points.push({
          pointKind: "state-digest",
          subjectId: inputKey,
          baselineValue: baselineDigest,
          substitutedValue: "(shape-refused)",
          equal: false,
          divergenceKind: "contract-mismatch",
          detail:
            `operation step ${position} (${step.applied.operation.operationType}): the substitute's output could ` +
            `not be projected onto the canonical shapes — ${outcome.shapeRefusal}`,
        });
        continue;
      }
      const outputs = outcome.result.outputs ?? {};

      const digestProjection = projectCanonicalDigest("stateContentDigest", outputs["stateContentDigest"]);
      if (!digestProjection.ok) {
        points.push({
          pointKind: "state-digest",
          subjectId: inputKey,
          baselineValue: baselineDigest,
          substitutedValue: "(shape-refused)",
          equal: false,
          divergenceKind: "contract-mismatch",
          detail:
            `operation step ${position} (${step.applied.operation.operationType}): the substitute's state ` +
            `digest was refused at the canonical boundary — ${digestProjection.refusal.detail}`,
        });
        continue;
      }
      const substitutedDigest = digestProjection.projected;
      const digestEqual = substitutedDigest === baselineDigest;
      points.push({
        pointKind: "state-digest",
        subjectId: inputKey,
        baselineValue: baselineDigest,
        substitutedValue: substitutedDigest,
        equal: digestEqual,
        ...(digestEqual ? {} : { divergenceKind: DIVERGENCE_KIND_BY_POINT["state-digest"] }),
        detail: digestEqual
          ? `operation step ${position} (${step.applied.operation.operationType}): the substitute's state content digest equals the canonical engine's`
          : `operation step ${position} (${step.applied.operation.operationType}): the substitute's state content digest deviates from the canonical engine's — the state evolution diverged`,
      });

      const quantitiesProjection = projectCanonicalQuantities(outputs["quantitiesJson"]);
      if (!quantitiesProjection.ok) {
        points.push({
          pointKind: "quantity-value",
          subjectId: `${inputKey}:quantities`,
          baselineValue: baselineStepQuantities.length,
          substitutedValue: "(shape-refused)",
          equal: false,
          divergenceKind: "contract-mismatch",
          detail:
            `operation step ${position} (${step.applied.operation.operationType}): the substitute's effect ` +
            `quantities were refused at the canonical boundary — ${quantitiesProjection.refusal.detail}`,
        });
        continue;
      }
      points.push(...quantityPoints(inputKey, baselineStepQuantities, quantitiesProjection.projected));
    }
    return points;
  };

  return { inputs, compare };
}

/** Compares one step's baseline vs substituted quantity rows (matched by label). */
function quantityPoints(
  inputKey: string,
  baselineQuantities: readonly CanonicalQuantity[],
  substitutedQuantities: readonly CanonicalQuantity[],
): readonly ComparisonPointResult[] {
  const points: ComparisonPointResult[] = [];
  const substitutedByLabel = new Map<string, CanonicalQuantity>();
  for (const quantity of substitutedQuantities) {
    substitutedByLabel.set(quantity.label, quantity);
  }
  const baselineLabels = new Set(baselineQuantities.map((quantity) => quantity.label));
  for (const baseline of baselineQuantities) {
    const substituted = substitutedByLabel.get(baseline.label);
    if (substituted === undefined) {
      points.push({
        pointKind: "quantity-value",
        subjectId: `${inputKey}:${baseline.label}`,
        baselineValue: baseline.value,
        substitutedValue: "(absent)",
        equal: false,
        divergenceKind: DIVERGENCE_KIND_BY_POINT["quantity-value"],
        detail: `quantity '${baseline.label}' of ${inputKey}: the substitute did not emit the canonical quantity`,
      });
      continue;
    }
    const rowEqual =
      substituted.dimension === baseline.dimension &&
      substituted.unit === baseline.unit &&
      substituted.direction === baseline.direction &&
      substituted.calculationRef === baseline.calculationRef;
    const valueEqual = substituted.value === baseline.value;
    const equal = rowEqual && valueEqual;
    points.push({
      pointKind: "quantity-value",
      subjectId: `${inputKey}:${baseline.label}`,
      baselineValue: baseline.value,
      substitutedValue: substituted.value,
      equal,
      ...(equal ? {} : { divergenceKind: DIVERGENCE_KIND_BY_POINT["quantity-value"] }),
      detail: equal
        ? `quantity '${baseline.label}' of ${inputKey} (${baseline.dimension}, ${baseline.unit}, ${baseline.direction}): the substitute's value and quantity semantics equal the canonical engine's`
        : `quantity '${baseline.label}' of ${inputKey} (${baseline.dimension}, ${baseline.unit}, ${baseline.direction}): the substitute's quantity semantics deviate from the canonical engine's (value ${substituted.value} vs ${baseline.value}${rowEqual ? "" : "; dimension/unit/direction/calculationRef mismatch"})`,
    });
  }
  for (const substituted of substitutedQuantities) {
    if (!baselineLabels.has(substituted.label)) {
      points.push({
        pointKind: "quantity-value",
        subjectId: `${inputKey}:${substituted.label}`,
        baselineValue: "(absent)",
        substitutedValue: substituted.value,
        equal: false,
        divergenceKind: DIVERGENCE_KIND_BY_POINT["quantity-value"],
        detail: `quantity '${substituted.label}' of ${inputKey}: the substitute emitted a quantity the canonical engine does not derive`,
      });
    }
  }
  return points;
}

/** Memoized replay steps (the engine's AppliedOperation records of the journey). */
interface ReplayStepView {
  readonly stepIndex: number;
  readonly intentId: string;
  readonly applied: {
    readonly outcome: "applied";
    readonly operation: SemanticCarrier & { readonly intentRef?: string };
    readonly quantities: readonly EngineQuantity[];
  };
}

let wallUpgradeReplayStepsCache: readonly ReplayStepView[] | undefined;

function wallUpgradeReplaySteps(): readonly ReplayStepView[] {
  if (wallUpgradeReplayStepsCache !== undefined) {
    return wallUpgradeReplayStepsCache;
  }
  const replay = replaySolution({
    solutionId: WALL_UPGRADE_WORLD.solutionId,
    projectId: WALL_UPGRADE_WORLD.projectId,
    title: WALL_UPGRADE_WORLD.title,
    problemStatement: WALL_UPGRADE_WORLD.problemStatement,
    domain: REFERENCE_BUILDING_DOMAIN,
    baselineRealityVersionId: WALL_UPGRADE_WORLD.baselineRealityVersionId,
    intents: wallUpgradeIntents(),
    capabilityProfile: REFERENCE_BUILDING_OPERATION_PROFILE,
    baselineGeometry: new TableBaselineGeometryResolver(WALL_UPGRADE_WORLD.baselineGeometry),
    materializeClock: (stateIndex: number) => WALL_UPGRADE_WORLD.materializeClock(stateIndex),
    createdAt: WALL_UPGRADE_WORLD.createdAt,
  });
  if (replay.outcome !== "complete") {
    throw new Error(
      "solution-eval harness: the committed wall-upgrade baseline replay failed — an internal invariant is broken",
    );
  }
  wallUpgradeReplayStepsCache = replay.steps as unknown as readonly ReplayStepView[];
  return wallUpgradeReplayStepsCache;
}

/* --- validation seam ------------------------------------------------ */

function validationBaseline(): SeamBaseline {
  const { version, snapshot } = wallUpgradeBaseline();
  const inputs: SeamInput[] = [
    {
      inputKey: "version-validation",
      providerInput: {
        kind: "provider-input",
        capability: SEAM_CAPABILITIES.validation,
        payload: {
          solutionId: version.solutionId,
          versionNumber: version.versionNumber,
          inputDigest: snapshot.inputDigest,
        },
      },
    },
  ];

  const compare = (substituted: ReadonlyMap<string, SubstitutedOutcome>): readonly ComparisonPointResult[] => {
    const outcome = substituted.get("version-validation");
    if (outcome === undefined) {
      return [];
    }
    const points: ComparisonPointResult[] = [];
    const pushVerdictPoint = (
      subjectId: string,
      baselineValue: string,
      substitutedValue: string,
      detail: string,
    ): void => {
      const equal = substitutedValue === baselineValue;
      points.push({
        pointKind: "validation-verdict",
        subjectId,
        baselineValue,
        substitutedValue,
        equal,
        ...(equal ? {} : { divergenceKind: DIVERGENCE_KIND_BY_POINT["validation-verdict"] }),
        detail,
      });
    };

    if (!outcome.ok) {
      pushVerdictPoint(
        "validation-outcome",
        snapshot.outcome,
        "(shape-refused)",
        `the substitute's validation output could not be projected onto the canonical verdict shape — ${outcome.shapeRefusal}`,
      );
      return points;
    }
    const outputs = outcome.result.outputs ?? {};
    const outcomeProjection = projectCanonicalVerdict("outcome", outputs["outcome"]);
    const checksProjection = projectCanonicalValidationChecks(outputs["checksJson"]);
    if (!outcomeProjection.ok) {
      pushVerdictPoint(
        "validation-outcome",
        snapshot.outcome,
        "(shape-refused)",
        `the substitute's outcome was refused at the canonical boundary — ${outcomeProjection.refusal.detail}`,
      );
      return points;
    }
    pushVerdictPoint(
      "validation-outcome",
      snapshot.outcome,
      outcomeProjection.projected,
      outcomeProjection.projected === snapshot.outcome
        ? "the substitute's worst-of validation outcome agrees with the deterministic validator's"
        : `the substitute's worst-of validation outcome ('${outcomeProjection.projected}') DISAGREES with the deterministic validator's ('${snapshot.outcome}') — an incorrect verdict over the same inputs`,
    );

    if (!checksProjection.ok) {
      pushVerdictPoint(
        "validation-checks",
        `${snapshot.checks.length} canonical checks`,
        "(shape-refused)",
        `the substitute's checks were refused at the canonical boundary — ${checksProjection.refusal.detail}`,
      );
      return points;
    }
    const substitutedByCheckId = new Map<string, CanonicalValidationCheck>();
    for (const check of checksProjection.projected) {
      substitutedByCheckId.set(check.checkId, check);
    }
    const baselineCheckIds = new Set(snapshot.checks.map((check) => check.checkId));
    for (const baselineCheck of snapshot.checks) {
      const substitutedCheck = substitutedByCheckId.get(baselineCheck.checkId);
      if (substitutedCheck === undefined) {
        pushVerdictPoint(
          `check:${baselineCheck.checkId}`,
          baselineCheck.result,
          "(absent)",
          `check '${baselineCheck.checkId}': the substitute did not answer the canonical check`,
        );
        continue;
      }
      pushVerdictPoint(
        `check:${baselineCheck.checkId}`,
        baselineCheck.result,
        substitutedCheck.result,
        substitutedCheck.result === baselineCheck.result
          ? `check '${baselineCheck.checkId}': the substitute's check result agrees with the deterministic validator's`
          : `check '${baselineCheck.checkId}': the substitute's check result ('${substitutedCheck.result}') DISAGREES with the deterministic validator's ('${baselineCheck.result}')`,
      );
    }
    for (const substitutedCheck of checksProjection.projected) {
      if (!baselineCheckIds.has(substitutedCheck.checkId)) {
        pushVerdictPoint(
          `check:${substitutedCheck.checkId}`,
          "(absent)",
          substitutedCheck.result,
          `check '${substitutedCheck.checkId}': the substitute invented a check the deterministic validator does not run`,
        );
      }
    }
    return points;
  };

  return { inputs, compare };
}

/* --- boq-derivation seam -------------------------------------------- */

function boqBaseline(): SeamBaseline {
  const { version, snapshot } = wallUpgradeBaseline();
  const boq = deriveSolutionBoq({ version, snapshot });
  const baselineLines: readonly CanonicalBoqLine[] = boq.lines.map((line) => ({
    activity: line.activity,
    direction: line.direction,
    dimension: line.quantity.dimension,
    unit: line.quantity.unit,
    value: line.quantity.value,
    ...(line.material === undefined ? {} : { material: line.material }),
    calculationRef: line.quantity.calculationRef,
  }));
  const inputs: SeamInput[] = [
    {
      inputKey: "version-boq",
      providerInput: {
        kind: "provider-input",
        capability: SEAM_CAPABILITIES["boq-derivation"],
        payload: {
          solutionId: version.solutionId,
          versionNumber: version.versionNumber,
          validationSnapshotRef: snapshot.snapshotId,
        },
      },
    },
  ];

  const compare = (substituted: ReadonlyMap<string, SubstitutedOutcome>): readonly ComparisonPointResult[] => {
    const outcome = substituted.get("version-boq");
    if (outcome === undefined) {
      return [];
    }
    if (!outcome.ok) {
      return [
        {
          pointKind: "boq-line",
          subjectId: "boq-lines",
          baselineValue: baselineLines.length,
          substitutedValue: "(shape-refused)",
          equal: false,
          divergenceKind: "contract-mismatch",
          detail: `the substitute's BOQ output could not be projected onto the canonical line shape — ${outcome.shapeRefusal}`,
        },
      ];
    }
    const outputs = outcome.result.outputs ?? {};
    const linesProjection = projectCanonicalBoqLines(outputs["linesJson"]);
    if (!linesProjection.ok) {
      return [
        {
          pointKind: "boq-line",
          subjectId: "boq-lines",
          baselineValue: baselineLines.length,
          substitutedValue: "(shape-refused)",
          equal: false,
          divergenceKind: "contract-mismatch",
          detail: `the substitute's BOQ lines were refused at the canonical boundary — ${linesProjection.refusal.detail}`,
        },
      ];
    }
    return boqLinePoints(baselineLines, linesProjection.projected);
  };

  return { inputs, compare };
}

/** The deterministic BOQ-line semantic key (matched, never id-pinned). */
function boqLineKey(line: CanonicalBoqLine): string {
  return [
    line.activity,
    line.direction,
    line.dimension,
    line.unit,
    line.material ?? "-",
    line.calculationRef,
  ].join("|");
}

/** Compares the baseline vs substituted BOQ lines (matched by semantic key). */
function boqLinePoints(
  baselineLines: readonly CanonicalBoqLine[],
  substitutedLines: readonly CanonicalBoqLine[],
): readonly ComparisonPointResult[] {
  const points: ComparisonPointResult[] = [];
  const substitutedByKey = new Map<string, CanonicalBoqLine>();
  for (const line of substitutedLines) {
    substitutedByKey.set(boqLineKey(line), line);
  }
  const baselineKeys = new Set(baselineLines.map((line) => boqLineKey(line)));
  for (const baseline of baselineLines) {
    const key = boqLineKey(baseline);
    const subjectId = `${baseline.activity}:${baseline.dimension}`;
    const substituted = substitutedByKey.get(key);
    if (substituted === undefined) {
      points.push({
        pointKind: "boq-line",
        subjectId,
        baselineValue: baseline.value,
        substitutedValue: "(absent)",
        equal: false,
        divergenceKind: DIVERGENCE_KIND_BY_POINT["boq-line"],
        detail: `BOQ line '${subjectId}' (${baseline.unit}, ${baseline.direction}): the substitute did not derive the canonical work item`,
      });
      continue;
    }
    const equal = substituted.value === baseline.value;
    points.push({
      pointKind: "boq-line",
      subjectId,
      baselineValue: baseline.value,
      substitutedValue: substituted.value,
      equal,
      ...(equal ? {} : { divergenceKind: DIVERGENCE_KIND_BY_POINT["boq-line"] }),
      detail: equal
        ? `BOQ line '${subjectId}' (${baseline.unit}, ${baseline.direction}): the substitute's line quantity equals the canonical derivation's`
        : `BOQ line '${subjectId}' (${baseline.unit}, ${baseline.direction}): the substitute's line quantity (${substituted.value} ${substituted.unit}) deviates from the canonical derivation's (${baseline.value} ${baseline.unit})`,
    });
  }
  for (const substituted of substitutedLines) {
    if (!baselineKeys.has(boqLineKey(substituted))) {
      points.push({
        pointKind: "boq-line",
        subjectId: `${substituted.activity}:${substituted.dimension}`,
        baselineValue: "(absent)",
        substitutedValue: substituted.value,
        equal: false,
        divergenceKind: DIVERGENCE_KIND_BY_POINT["boq-line"],
        detail: `BOQ line '${substituted.activity}:${substituted.dimension}': the substitute derived a work item the canonical derivation does not`,
      });
    }
  }
  return points;
}

/* ------------------------------------------------------------------ */
/* The substituted path (declared executions → control plane → guard)   */
/* ------------------------------------------------------------------ */

/**
 * Drives every canonical seam input through the substitute's declared
 * execution: input validation, control-plane normalization and (per input)
 * a SHAPE-REFUSAL marker if the provider output violated its declared
 * contract. The canonical projections happen per seam inside `compare`
 * (so a projection refusal is recorded as a comparison point, not a
 * short-circuit).
 */
function runSubstitutedPath(
  profile: ProviderProfile,
  baseline: SeamBaseline,
  scenario: SubstitutionScenario,
): { readonly outcomes: ReadonlyMap<string, SubstitutedOutcome> } | { readonly refusal: SubstitutionRefusal } {
  const declared = new Map<string, unknown>();
  for (const declaredExecution of scenario.substitutedRun.executions) {
    declared.set(declaredExecution.inputKey, declaredExecution.execution);
  }
  const outcomes = new Map<string, SubstitutedOutcome>();

  for (const input of baseline.inputs) {
    const execution = declared.get(input.inputKey);
    if (execution === undefined) {
      return {
        refusal: {
          kind: "missing-declared-execution",
          detail:
            `the substituted run does not declare an execution for canonical seam input '${input.inputKey}' ` +
            `— a substitute must answer every input, never stay silent`,
        },
      };
    }
    const validation = validateProviderInput(input.providerInput, profile);
    if (!validation.ok) {
      const first = validation.failures[0];
      return {
        refusal: {
          kind: "seam-capability-mismatch",
          detail:
            `the canonical seam input '${input.inputKey}' violates the substitute's declared input contract — ` +
            `the provider does not fit the seam's canonical I/O (${first ? `${first.kind}: ${first.detail}` : "typed validation failure"})`,
        },
      };
    }
    const normalized = normalizeResult(execution, profile, {
      inputDigest: validation.inputDigest,
    });
    if (!normalized.ok) {
      outcomes.set(input.inputKey, {
        ok: false,
        shapeRefusal: `normalization refused (${normalized.failure.kind}): ${normalized.failure.detail}`,
      });
      continue;
    }
    outcomes.set(input.inputKey, {
      ok: true,
      result: normalized.result,
      inputDigest: validation.inputDigest,
    });
  }
  return { outcomes };
}

/* ------------------------------------------------------------------ */
/* The evaluation                                                       */
/* ------------------------------------------------------------------ */

/**
 * Evaluates one Layer-3 substitution scenario over a provider-registry
 * event log. PURE + DETERMINISTIC + ASYNC (the canonical compiler's seam is
 * async): the same scenario and log always produce the byte-identical
 * evaluation.
 */
export async function evaluateSubstitution(
  scenario: SubstitutionScenario,
  registryLog: readonly ProviderRegistryEvent[],
): Promise<SubstitutionEvaluation> {
  /* Scenario internal consistency (defensive for direct callers). */
  if (SEAM_BASELINE_PAIRING[scenario.seam] !== scenario.baselineId) {
    return refusedEvaluation(
      scenario,
      "scenario-inconsistent",
      `baseline '${scenario.baselineId}' does not pin the '${scenario.seam}' seam`,
    );
  }
  if (scenario.substitutedRun.capability !== SEAM_CAPABILITIES[scenario.seam]) {
    return refusedEvaluation(
      scenario,
      "scenario-inconsistent",
      `the declared run's capability '${scenario.substitutedRun.capability}' does not name the '${scenario.seam}' seam's capability '${SEAM_CAPABILITIES[scenario.seam]}'`,
    );
  }

  /* Registry resolution: the log must lawfully register the substitute. */
  const replayed = replayRegistry(registryLog);
  if (!replayed.ok) {
    return refusedEvaluation(
      scenario,
      "registry-log-refused",
      `the registry log does not replay lawfully (event ${replayed.eventIndex}: ${replayed.failure.kind} — ${replayed.failure.detail})`,
    );
  }
  const entry = replayed.registry.entryOf(
    scenario.substitute.providerId,
    scenario.substitute.technologyVersion,
  );
  if (entry === undefined) {
    return refusedEvaluation(
      scenario,
      "provider-not-registered",
      `substitute '${scenario.substitute.providerId}' (${scenario.substitute.technologyVersion}) is not registered in the registry log`,
    );
  }
  if (entry.state !== "evaluation") {
    return refusedEvaluation(
      scenario,
      "evaluation-not-started",
      `substitute '${scenario.substitute.providerId}' (${scenario.substitute.technologyVersion}) is in state '${entry.state}' — a substitution evaluation requires the 'evaluation' state`,
    );
  }
  const profile = entry.profile;
  if (!(profile.capabilities as readonly string[]).includes(SEAM_CAPABILITIES[scenario.seam])) {
    return refusedEvaluation(
      scenario,
      "seam-capability-mismatch",
      `substitute '${scenario.substitute.providerId}' (${scenario.substitute.technologyVersion}) does not declare the seam capability '${SEAM_CAPABILITIES[scenario.seam]}' — offered: [${profile.capabilities.join(", ")}]`,
    );
  }

  /* Baseline path (LIVE canonical components) + substituted path (control plane). */
  const baseline = await seamBaselineOf(scenario.seam);
  const substitutedRun = runSubstitutedPath(profile, baseline, scenario);
  if ("refusal" in substitutedRun) {
    return refusedEvaluation(
      scenario,
      substitutedRun.refusal.kind,
      substitutedRun.refusal.detail,
    );
  }

  /* Comparison (canonical outputs only — the projection guard has run). */
  const comparisonPoints = baseline.compare(substitutedRun.outcomes);
  const divergingPoints = comparisonPoints.filter((point) => !point.equal);

  let verdict: SubstitutionVerdict;
  let divergence: SubstitutionDivergence | undefined;
  if (divergingPoints.length === 0) {
    verdict = "substitution-proven";
  } else {
    const failureKinds: FailureKind[] = [];
    for (const point of divergingPoints) {
      if (point.divergenceKind !== undefined && !failureKinds.includes(point.divergenceKind)) {
        failureKinds.push(point.divergenceKind);
      }
    }
    const primaryKind: FailureKind = failureKinds[0] ?? "contract-mismatch";
    verdict = "divergence-recorded";
    divergence = {
      failureKind: primaryKind,
      failureKinds,
      points: divergingPoints,
      detail:
        `substitute '${scenario.substitute.providerId}' (${scenario.substitute.technologyVersion}) diverged from the canonical ` +
        `'${scenario.seam}' semantics at ${divergingPoints.length} comparison point(s) — the difference is RECORDED as ` +
        `evidence (primary kind '${primaryKind}'), never hidden`,
    };
  }

  const expectationSatisfied =
    scenario.expectation === "canonical-equality"
      ? verdict === "substitution-proven"
      : verdict === "divergence-recorded" &&
        divergence !== undefined &&
        divergence.failureKind === scenario.expectedDivergenceKind;

  /* The control-plane emission: BenchmarkRecord + ProvenanceManifest + events. */
  const equalCount = comparisonPoints.length - divergingPoints.length;
  const recordBody = {
    kind: "provider-benchmark-record" as const,
    schemaVersion: "provider-benchmark/1" as const,
    providerId: profile.providerId,
    technologyVersion: profile.technologyVersion,
    benchmarkId: BENCHMARK_ID,
    capability: SEAM_CAPABILITIES[scenario.seam],
    metrics: [
      {
        metric: "canonical_comparison_points",
        value: comparisonPoints.length,
        unit: "count",
        detail: "the number of canonical comparison points the substitution was evaluated over",
      },
      {
        metric: "equal_comparison_points",
        value: equalCount,
        unit: "count",
        detail: "the comparison points whose canonical outputs were equal",
      },
      {
        metric: "divergent_comparison_points",
        value: divergingPoints.length,
        unit: "count",
        detail: "the comparison points whose canonical outputs diverged (recorded as evidence)",
      },
      {
        metric: "substitution_proven",
        value: verdict === "substitution-proven" ? 1 : 0,
        unit: "boolean",
        detail:
          verdict === "substitution-proven"
            ? "every canonical comparison point was equal — the substitution is proven"
            : "at least one canonical comparison point diverged — the difference is recorded, never hidden",
      },
      {
        metric: "expectation_satisfied",
        value: expectationSatisfied ? 1 : 0,
        unit: "boolean",
        detail:
          expectationSatisfied
            ? "the harness's verdict matches the scenario's declared expectation"
            : "the harness's verdict CONTRADICTS the scenario's declared expectation — the benchmark fails this cell",
      },
    ],
    failureObservations: divergingPoints.map((point) => ({
      kind: (point.divergenceKind ?? "contract-mismatch") as NonNullable<ComparisonPointResult["divergenceKind"]>,
      detail: point.detail,
    })),
    resourceObservations: {
      compute: "deterministic-fixture-cpu",
      memoryMiB: 16,
      latencyMsP50: 0.5,
      latencyMsP95: 1,
    },
    reproduction: {
      inputsDigest: scenarioInputsDigest(scenario),
      codeVersion: HARNESS_CODE_VERSION,
      statement:
        "deterministic reproduction: the declared scenario (digest above) evaluated by the Layer-3 substitution " +
        "harness at code version (above) over the canonical components always yields these metrics — no clock, " +
        "no randomness, no network",
    },
  };
  const recordValidation = validateBenchmarkRecord(recordBody);
  if (!recordValidation.ok) {
    throw new Error(
      `solution-eval harness: the emitted benchmark record is invalid (${recordValidation.failures[0]?.detail ?? "typed failure"}) — an internal invariant is broken`,
    );
  }
  const benchmarkRecord = recordValidation.record;

  const inputDigests: string[] = [];
  const resultDigests: string[] = [];
  const registryEvents: ProviderRegistryEvent[] = [];
  for (const input of baseline.inputs) {
    const outcome = substitutedRun.outcomes.get(input.inputKey);
    if (outcome === undefined || !outcome.ok) {
      continue;
    }
    inputDigests.push(outcome.inputDigest);
    const resultDigest = providerResultDigestOf(outcome.result);
    resultDigests.push(resultDigest);
    registryEvents.push({
      kind: "execution-normalized",
      providerId: profile.providerId,
      technologyVersion: profile.technologyVersion,
      execution: {
        capability: SEAM_CAPABILITIES[scenario.seam],
        inputDigest: outcome.inputDigest,
        normalizedResultDigest: resultDigest,
      },
    });
  }
  const normalizedResultDigest = sha256Hex(canonicalJsonText(resultDigests));
  const provenanceManifest = sealProvenanceManifest({
    profile,
    inputDigests,
    normalizedResultDigest,
    benchmarkRecords: [benchmarkRecord],
    environment: SOLUTION_EVAL_ENVIRONMENT,
    consumer: { consumer: "AISE", surface: "layer3-substitution-eval" },
    reproducibilityStatement:
      "Layer-3 substitution evaluation: the registered profile, the canonical seam input digests (above), the " +
      "aggregated normalized result digest (sha-256 over the ordered per-input result digests) and the benchmark " +
      "record (digest above) fully determine this evaluation — identical inputs reproduce the identical manifest",
  });
  registryEvents.push({ kind: "benchmark-recorded", record: benchmarkRecord });
  registryEvents.push({ kind: "provenance-sealed", manifest: provenanceManifest });

  /* Lawfulness check: the derived events must apply cleanly to the replayed registry. */
  let registry = replayed.registry;
  for (const event of registryEvents) {
    const applied = applyRegistryEvent(registry, event);
    if (!applied.ok) {
      return refusedEvaluation(
        scenario,
        "registry-event-refused",
        `the evaluation's registry event '${event.kind}' was refused (${applied.failure.kind} — ${applied.failure.detail})`,
      );
    }
    registry = applied.registry;
  }

  return {
    scenarioId: scenario.scenarioId,
    seam: scenario.seam,
    substitute: scenario.substitute,
    expectation: scenario.expectation,
    verdict,
    expectationSatisfied,
    comparisonPoints,
    ...(divergence === undefined ? {} : { divergence }),
    benchmarkRecord,
    provenanceManifest,
    registryEvents,
  };
}

/** The per-seam baseline driver (LIVE canonical components). */
async function seamBaselineOf(seam: SubstitutionSeam): Promise<SeamBaseline> {
  switch (seam) {
    case "operation-compiler":
      return compilerBaseline();
    case "engine-execution":
      return engineBaseline();
    case "validation":
      return validationBaseline();
    case "boq-derivation":
      return boqBaseline();
  }
}

/* ------------------------------------------------------------------ */
/* The committed matrix evaluation (the benchmark entry point)            */
/* ------------------------------------------------------------------ */

export interface MatrixCellSummary {
  readonly scenarioId: string;
  readonly seam: SubstitutionSeam;
  readonly expectation: SubstitutionExpectation;
  readonly verdict: SubstitutionVerdict;
  readonly expectationSatisfied: boolean;
  readonly comparisonPointCount: number;
  readonly equalPointCount: number;
  readonly divergentPointCount: number;
  readonly divergenceFailureKind?: SubstitutionDivergence["failureKind"];
  readonly refusalKind?: SubstitutionRefusal["kind"];
  readonly benchmarkRecordId?: string;
  readonly benchmarkRecordDigest?: string;
  readonly manifestId?: string;
  readonly registryEventCount: number;
}

export interface MatrixRunResult {
  readonly cells: readonly SubstitutionEvaluation[];
  readonly summaries: readonly MatrixCellSummary[];
  readonly totals: {
    readonly scenarios: number;
    readonly proven: number;
    readonly divergenceRecorded: number;
    readonly refused: number;
    readonly expectationSatisfied: number;
  };
}

/**
 * Runs the full committed substitution matrix over a registry log (the
 * tools/solution-eval benchmark consumes the committed golden of this
 * computation). Deterministic: identical log → byte-identical cells.
 */
export async function runSubstitutionMatrix(
  scenarios: readonly SubstitutionScenario[],
  registryLog: readonly ProviderRegistryEvent[],
): Promise<MatrixRunResult> {
  const cells: SubstitutionEvaluation[] = [];
  for (const scenario of scenarios) {
    cells.push(await evaluateSubstitution(scenario, registryLog));
  }
  const summaries = cells.map(cellSummaryOf);
  return {
    cells,
    summaries,
    totals: {
      scenarios: cells.length,
      proven: cells.filter((cell) => cell.verdict === "substitution-proven").length,
      divergenceRecorded: cells.filter((cell) => cell.verdict === "divergence-recorded").length,
      refused: cells.filter((cell) => cell.verdict === "substitution-refused").length,
      expectationSatisfied: cells.filter((cell) => cell.expectationSatisfied).length,
    },
  };
}

/** The deterministic per-cell summary (the committed golden's cell shape). */
export function cellSummaryOf(evaluation: SubstitutionEvaluation): MatrixCellSummary {
  const divergent = evaluation.comparisonPoints.filter((point) => !point.equal).length;
  return {
    scenarioId: evaluation.scenarioId,
    seam: evaluation.seam,
    expectation: evaluation.expectation,
    verdict: evaluation.verdict,
    expectationSatisfied: evaluation.expectationSatisfied,
    comparisonPointCount: evaluation.comparisonPoints.length,
    equalPointCount: evaluation.comparisonPoints.length - divergent,
    divergentPointCount: divergent,
    ...(evaluation.divergence === undefined ? {} : { divergenceFailureKind: evaluation.divergence.failureKind }),
    ...(evaluation.refusal === undefined ? {} : { refusalKind: evaluation.refusal.kind }),
    ...(evaluation.benchmarkRecord === undefined
      ? {}
      : {
          benchmarkRecordId: evaluation.benchmarkRecord.recordId,
          benchmarkRecordDigest: sha256Hex(canonicalJsonText(evaluation.benchmarkRecord)),
        }),
    ...(evaluation.provenanceManifest === undefined
      ? {}
      : { manifestId: evaluation.provenanceManifest.manifestId }),
    registryEventCount: evaluation.registryEvents.length,
  };
}
