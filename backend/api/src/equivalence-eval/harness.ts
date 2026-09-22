/**
 * HFX-301 — the equivalence benchmark HARNESS (the deterministic
 * dual-path executor).
 *
 * `evaluateEquivalencePair(pair)` drives ONE corpus pair through BOTH
 * authoring paths against the SAME deterministic baseline scene and
 * compares the CANONICAL results on PROD-029's comparison points:
 *
 *              ┌─ NL path: compile({utterance, session}) ──→ intent (agent origin)
 *   corpus pair ┤                                                     │
 *              └─ DM path: createOperationIntent(direct input) ───────┤
 *                                                                    ▼
 *                materializeBaselineState(scene) — ONE baseline per pair
 *                                                                    ▼
 *                [prerequisite?] → applyOperation(baseline, intent) ──→ applied | refused
 *                validateSolutionVersion(...)                       ──→ verdict
 *                deriveSolutionBoq({version, snapshot})             ──→ delta lines
 *                                                                    ▼
 *                project BOTH results onto PROD-029's canonical points and
 *                compare: EQUIVALENT or DECLARED-DIFFERENT(kind)
 *
 *  - the NL path runs the REAL `createSolutionCommandCompiler`
 *    (backend/api/src/reasoning/solution — imported, never modified) with
 *    the DEFAULT deterministic NLU port and an injected fixed clock;
 *  - the DM path constructs its intent EXCLUSIVELY through the contract's
 *    `createOperationIntent` (origin "direct-manipulation");
 *  - BOTH paths run through the SAME engine calls (`applyOperation`,
 *    `validateSolutionVersion`, the BOQ resolution seam over
 *    `deriveSolutionBoq` — @aise/solution-engine and @aise/solution-boq,
 *    imported, never modified): that sameness is the point;
 *  - the comparison projects both journeys onto PROD-029's canonical
 *    comparison points (`backend/api/src/solution-eval` — imported, never
 *    modified): operation identity semantics, post-state digest,
 *    validation verdict and BOQ delta lines, with the CLOSED difference
 *    vocabulary (`DIVERGENCE_KIND_BY_POINT`) — reused, never reinvented;
 *  - the agent-refused and agent-clarification cells record the DESIGNED
 *    agent-path outcomes (the taxonomy reason code, the targeted
 *    questions) — never equivalence failures;
 *  - every evaluation emits the governed control-plane `BenchmarkRecord`
 *    (validated by `validateBenchmarkRecord`) + a sealed
 *    `ProvenanceManifest` under the HFX-301 benchmark identity.
 *
 * DETERMINISM: no I/O, no randomness, injected fixed instants (the
 * scene's pinned materialization/validation/compile/authored-at
 * instants). The default NlUnderstandingPort never enriches — the whole
 * corpus passes offline.
 */

import { createHash } from "node:crypto";
import {
  REFERENCE_BUILDING_DOMAIN,
  REFERENCE_BUILDING_OPERATION_PROFILE,
  createOperationIntent,
} from "@aise/solution-contract";
import type {
  EngineeringOperationIntent,
  OperationCapabilityProfile,
  ProposedState,
  SolutionValidationSnapshot,
  SolutionVersion,
} from "@aise/solution-contract";
import { canonicalJsonStringify } from "@aise/shared-contracts";
import {
  applyOperation,
  materializeBaselineState,
  validateSolutionVersion,
} from "@aise/solution-engine";
import type {
  BaselineGeometryResolver,
  OperationApplicationResult,
} from "@aise/solution-engine";
import type { SolutionBoqLine } from "@aise/solution-boq";
import { sealProvenanceManifest, validateBenchmarkRecord } from "@aise/provider-registry";
import type { BenchmarkRecord, FailureKind, ProviderProfile } from "@aise/provider-registry";
import { createSolutionCommandCompiler } from "../reasoning/solution/compiler";
import type { CompiledCommand } from "../reasoning/solution/model";
import { DIVERGENCE_KIND_BY_POINT } from "../solution-eval/model";
import {
  EQUIVALENCE_CAPABILITY,
  EQUIVALENCE_EVAL_BENCHMARK_ID,
  EQUIVALENCE_EVAL_CODE_VERSION,
  EQUIVALENCE_EVAL_CONSUMER,
  EQUIVALENCE_EVAL_DECLARED_RESOURCES,
  EQUIVALENCE_EVAL_ENVIRONMENT,
  EQUIVALENCE_LANE_PROVIDER_ID,
  EQUIVALENCE_LANE_TECHNOLOGY_VERSION,
  deterministicInhouseLaneProfile,
} from "./registry";
import { equivalenceSceneOf } from "./corpus";
import type { EquivalenceScene } from "./corpus";
import { EquivalenceEvalError, validateEquivalencePair } from "./model";
import type {
  AgentPathCompile,
  DirectAuthoringInput,
  EquivalenceComparison,
  EquivalenceOutcome,
  EquivalencePair,
  EquivalencePointResult,
  JourneyOutcome,
} from "./model";

/* ------------------------------------------------------------------ */
/* The harness seams (injected deterministic doubles — see testkit.ts)   */
/* ------------------------------------------------------------------ */

/** One resolved BOQ of the seam (the lines are the delta rows). */
export interface ResolvedBoq {
  readonly lines: readonly SolutionBoqLine[];
}

/** The journey-input projection the BOQ resolution seam consumes. */
export interface BoqResolutionInput {
  readonly version: SolutionVersion;
  readonly snapshot: SolutionValidationSnapshot;
  readonly capabilityProfile: OperationCapabilityProfile;
  readonly baselineGeometry: BaselineGeometryResolver;
  readonly validatedAt: string;
}

/**
 * The BOQ resolution seam — resolves a validated journey version's BOQ
 * delta lines. The DEFAULT double (testkit.ts) delegates to the
 * deterministic `deriveSolutionBoq` of `@aise/solution-boq`; tests and the
 * runner share ONE implementation.
 */
export type BoqResolverSeam = (input: BoqResolutionInput) => ResolvedBoq | null;

/** The deterministic doubles the harness runs on (ONE shared implementation). */
export interface EquivalenceHarnessDoubles {
  /**
   * The read-only baseline scene resolver (surface resolution for coated
   * operations — the engine's own `BaselineGeometryResolver` over the
   * committed scene's geometry table).
   */
  readonly baselineGeometry: BaselineGeometryResolver;
  /** The BOQ resolution seam (the default: the deterministic `deriveSolutionBoq`). */
  readonly boqResolver: BoqResolverSeam;
}

/* ------------------------------------------------------------------ */
/* The DM intent construction (the contract's single constructor)       */
/* ------------------------------------------------------------------ */

/** Constructs an intent from a direct authoring input through the contract constructor (pure). */
export function directIntentOf(
  directInput: DirectAuthoringInput,
  scene: EquivalenceScene,
  intentId: string,
): EngineeringOperationIntent {
  return createOperationIntent({
    intentId,
    operationType: directInput.operationType,
    domain: REFERENCE_BUILDING_DOMAIN,
    parameters: directInput.parameters,
    target: directInput.target,
    ...(directInput.dependsOn === undefined ? {} : { dependsOn: directInput.dependsOn }),
    provenance: {
      origin: "direct-manipulation",
      authoredBy: "user-demo-engineer",
      authoredAt: scene.directAuthoredAt,
      interactionDetail: directInput.interactionDetail,
      derivationNote: `operator authored the ${directInput.operationType} in the interactive environment`,
      evidenceIds: [],
    },
    proposedTo: {
      solutionId: scene.solutionId,
      versionNumber: scene.versionNumber,
    },
  });
}

/* ------------------------------------------------------------------ */
/* The journey (apply → validate → BOQ)                                 */
/* ------------------------------------------------------------------ */

/** The canonical projection of a journey's BOQ delta lines (the comparison form). */
export interface BoqDeltaLine {
  readonly activity: string;
  readonly direction: string;
  readonly dimension: string;
  readonly unit: string;
  readonly value: number;
  readonly material?: string;
  readonly calculationRef: string;
}

/** Projects a solution BOQ's lines onto the canonical comparison rows (sorted by activity). */
export function boqDeltaLinesOf(lines: readonly SolutionBoqLine[]): readonly BoqDeltaLine[] {
  return lines
    .map((line) => ({
      activity: line.activity,
      direction: line.direction,
      dimension: line.quantity.dimension,
      unit: line.quantity.unit,
      value: line.quantity.value,
      ...(line.material === undefined ? {} : { material: line.material }),
      calculationRef: line.quantity.calculationRef,
    }))
    .sort((a, b) => (a.activity < b.activity ? -1 : a.activity > b.activity ? 1 : 0));
}

/** The deterministic journey of ONE authored intent (either path). */
function runJourney(input: {
  readonly scene: EquivalenceScene;
  readonly baseline: ProposedState;
  readonly prerequisite?: EngineeringOperationIntent;
  readonly intent: EngineeringOperationIntent;
  readonly doubles: EquivalenceHarnessDoubles;
}): JourneyOutcome {
  const { scene, baseline, intent, doubles } = input;

  const states: ProposedState[] = [baseline];
  const operations: SolutionVersion["operations"] = [];
  const apply = (candidate: EngineeringOperationIntent): OperationApplicationResult => {
    const latest = states[states.length - 1] as ProposedState;
    const result: OperationApplicationResult = applyOperation({
      baseline: latest,
      intent: candidate,
      capabilityProfile: REFERENCE_BUILDING_OPERATION_PROFILE,
      materializedAt: scene.materializedAt,
      baselineGeometry: doubles.baselineGeometry,
    });
    if (result.outcome === "applied") {
      operations.push(result.operation);
      states.push(result.resultingState);
    }
    return result;
  };

  if (input.prerequisite !== undefined) {
    const prerequisiteResult = apply(input.prerequisite);
    if (prerequisiteResult.outcome !== "applied") {
      return {
        intentId: input.prerequisite.intentId,
        application: {
          outcome: "refused",
          reasonCodes: prerequisiteResult.reasons.map((reason) => reason.code),
        },
        stateDigest: null,
        validationOutcome: null,
        boqLines: null,
        boqDigest: null,
      };
    }
  }

  const result = apply(intent);
  if (result.outcome !== "applied") {
    return {
      intentId: intent.intentId,
      application: {
        outcome: "refused",
        reasonCodes: result.reasons.map((reason) => reason.code),
      },
      stateDigest: null,
      validationOutcome: null,
      boqLines: null,
      boqDigest: null,
    };
  }

  const version: SolutionVersion = {
    contractVersion: "1.0.0",
    solutionId: scene.solutionId,
    versionNumber: scene.versionNumber,
    status: "draft",
    operations,
    states,
    createdAt: scene.createdAt,
  };
  const snapshot = validateSolutionVersion({
    version,
    capabilityProfile: REFERENCE_BUILDING_OPERATION_PROFILE,
    baselineGeometry: doubles.baselineGeometry,
    validatedAt: scene.validatedAt,
  });

  const boq = doubles.boqResolver({
    version,
    snapshot,
    capabilityProfile: REFERENCE_BUILDING_OPERATION_PROFILE,
    baselineGeometry: doubles.baselineGeometry,
    validatedAt: scene.validatedAt,
  });
  const boqLines = boq === null ? null : boqDeltaLinesOf(boq.lines);
  const boqDigest =
    boqLines === null
      ? null
      : createHash("sha256").update(canonicalJsonStringify(boqLines), "utf8").digest("hex");

  const finalState = states[states.length - 1] as ProposedState;
  return {
    intentId: intent.intentId,
    application: { outcome: "applied", operationId: result.operation.operationId },
    stateDigest: finalState.contentDigest ?? finalState.stateId,
    validationOutcome: snapshot.outcome,
    boqLines,
    boqDigest,
  };
}

/* ------------------------------------------------------------------ */
/* The comparison (PROD-029's points, reused)                           */
/* ------------------------------------------------------------------ */

/** Compares the two journeys on PROD-029's canonical comparison points. */
export function compareJourneys(
  pairId: string,
  agent: JourneyOutcome,
  direct: JourneyOutcome,
): EquivalenceComparison {
  const points: EquivalencePointResult[] = [];
  const push = (
    pointKind: EquivalencePointResult["pointKind"],
    agentValue: string | null,
    directValue: string | null,
    detail: string,
  ): void => {
    const agentText = agentValue ?? "(absent)";
    const directText = directValue ?? "(absent)";
    const equal = agentText === directText;
    points.push({
      pointKind,
      agentValue: agentText,
      directValue: directText,
      equal,
      ...(equal ? {} : { differenceKind: DIVERGENCE_KIND_BY_POINT[pointKind] }),
      detail,
    });
  };

  push(
    "operation-identity",
    agent.application.outcome === "applied" ? agent.application.operationId : null,
    direct.application.outcome === "applied" ? direct.application.operationId : null,
    `pair '${pairId}': the derived engineering operation identity of the applied operation ` +
      `(sha-256 over the semantic projection — provenance excluded by the contract)`,
  );
  push(
    "state-digest",
    agent.stateDigest,
    direct.stateDigest,
    `pair '${pairId}': the content digest of the journey's final proposed state (the hash ` +
      `chain over the applied operation sequence)`,
  );
  push(
    "validation-verdict",
    agent.validationOutcome,
    direct.validationOutcome,
    `pair '${pairId}': the deterministic validation snapshot's worst-of outcome`,
  );
  push(
    "boq-line",
    agent.boqDigest,
    direct.boqDigest,
    `pair '${pairId}': the canonical digest of the derived BOQ delta lines (activity, ` +
      `direction, dimension, unit, value, material, calculation reference)`,
  );

  const divergent = points.filter((point) => !point.equal);
  const differenceKinds: FailureKind[] = [];
  for (const point of divergent) {
    if (point.differenceKind !== undefined && !differenceKinds.includes(point.differenceKind)) {
      differenceKinds.push(point.differenceKind);
    }
  }
  if (divergent.length === 0) {
    return { verdict: "equivalent", points, differenceKinds };
  }
  const first = divergent[0] as EquivalencePointResult;
  return {
    verdict: "declared-different",
    points,
    differenceKind: first.differenceKind,
    differenceKinds,
  };
}

/* ------------------------------------------------------------------ */
/* The compiled-command echo (the typed union projection)              */
/* ------------------------------------------------------------------ */

function agentCompileEchoOf(command: CompiledCommand): AgentPathCompile {
  if (command.kind === "operation-intent") {
    return { kind: "operation-intent", compilerPath: command.attribution.compilerPath };
  }
  if (command.kind === "unsafe-refusal") {
    return {
      kind: "unsafe-refusal",
      reasonCode: command.reasonCode,
      reason: command.reason,
    };
  }
  if (command.kind === "clarification-needed") {
    return {
      kind: "clarification-needed",
      questions: command.questions.map((question) => ({
        slotKind: question.slotKind,
        slot: question.slot,
        question: question.question,
      })),
    };
  }
  // 'unsupported', 'ambiguous' and 'tool-command' lie OUTSIDE the
  // four-cell behavior matrix: a corpus pair compiling to one of them is
  // a CORPUS-AUTHORING BUG, surfaced as a typed error — never a silent
  // benchmark outcome.
  throw new EquivalenceEvalError(
    "invalid_pair",
    `pair compiled to '${command.kind}', which is outside the four-cell equivalence ` +
      `behavior matrix (equivalent / declared-different / agent-refused / ` +
      `agent-clarification) — the corpus must stay within the compiled vocabulary`,
  );
}

const NOT_RUN_JOURNEY: JourneyOutcome = {
  intentId: null,
  application: { outcome: "not-run" },
  stateDigest: null,
  validationOutcome: null,
  boqLines: null,
  boqDigest: null,
};

/* ------------------------------------------------------------------ */
/* The pair evaluation (the benchmark entry point)                      */
/* ------------------------------------------------------------------ */

/**
 * Evaluates ONE equivalence pair (the benchmark entry point). Throws
 * {@link EquivalenceEvalError} for CALLER/wiring bugs only (a malformed
 * pair, an unknown scene); every benchmark outcome is a first-class value
 * in the returned {@link EquivalenceOutcome}.
 */
export async function evaluateEquivalencePair(
  pairInput: unknown,
  doubles: EquivalenceHarnessDoubles,
): Promise<EquivalenceOutcome> {
  const validation = validateEquivalencePair(pairInput);
  if (!validation.ok) {
    const issues = validation.failures
      .map((failure) => `${failure.path}: ${failure.detail}`)
      .join("; ");
    throw new EquivalenceEvalError("invalid_pair", `the pair failed validation: ${issues}`);
  }
  const pair = validation.pair;
  const scene = equivalenceSceneOf(pair.sceneId);

  /* 1. ONE baseline materialization per pair (the same deterministic scene). */
  const baseline = materializeBaselineState({
    solutionId: scene.solutionId,
    versionNumber: scene.versionNumber,
    baselineRealityVersionId: scene.baselineRealityVersionId,
    materializedAt: scene.materializedAt,
  });

  /* 2. The prerequisite journey history (the sequencing pairs' committed step). */
  const prerequisite =
    pair.prerequisite === undefined
      ? undefined
      : directIntentOf(pair.prerequisite, scene, `intent-prereq-${pair.pairId}`);

  /* 3. The NL path — the REAL compiler, DEFAULT deterministic port, fixed clock. */
  const compiler = createSolutionCommandCompiler({ clock: () => scene.compiledAt });
  const command = await compiler.compile({ utterance: pair.nlUtterance, session: pair.session });
  const agentCompile = agentCompileEchoOf(command);

  /* 4. The DM path — the contract's single constructor surface. */
  const directIntent = directIntentOf(pair.direct, scene, `intent-direct-${pair.pairId}`);

  /* 5. The journeys (both through the SAME engine calls). */
  const agentJourney: JourneyOutcome =
    command.kind === "operation-intent"
      ? runJourney({
          scene,
          baseline,
          ...(prerequisite === undefined ? {} : { prerequisite }),
          intent: command.intent,
          doubles,
        })
      : NOT_RUN_JOURNEY;
  const directJourney = runJourney({
    scene,
    baseline,
    ...(prerequisite === undefined ? {} : { prerequisite }),
    intent: directIntent,
    doubles,
  });

  /* 6. The comparison (equivalent / declared-different cells only). */
  const comparison: EquivalenceComparison | null =
    command.kind === "operation-intent"
      ? compareJourneys(pair.pairId, agentJourney, directJourney)
      : null;

  /* 7. The observed cell + the expectation gate. */
  let observed: EquivalenceOutcome["observed"];
  if (command.kind === "unsafe-refusal") {
    observed = "agent-refused";
  } else if (command.kind === "clarification-needed") {
    observed = "agent-clarification";
  } else if (comparison !== null && comparison.verdict === "equivalent") {
    observed = "equivalent";
  } else {
    observed = "declared-different";
  }
  let expectationMet: boolean;
  if (observed !== pair.expectation) {
    expectationMet = false;
  } else if (observed === "declared-different") {
    expectationMet =
      pair.declaredDifferenceKind !== undefined &&
      comparison !== null &&
      comparison.differenceKind === pair.declaredDifferenceKind;
  } else {
    expectationMet = true;
  }

  /* 8. The governed control-plane emission. */
  const record = emitBenchmarkRecord({
    pair,
    observed,
    expectationMet,
    agentCompile,
    agentJourney,
    directJourney,
    comparison,
  });

  const profile: ProviderProfile = deterministicInhouseLaneProfile();
  const manifest = sealProvenanceManifest({
    profile,
    inputDigests: [
      createHash("sha256")
        .update(canonicalJsonStringify({ pairId: pair.pairId, nlUtterance: pair.nlUtterance }))
        .digest("hex"),
    ],
    normalizedResultDigest: createHash("sha256")
      .update(canonicalJsonStringify({ observed, expectationMet }))
      .digest("hex"),
    benchmarkRecords: [record],
    environment: EQUIVALENCE_EVAL_ENVIRONMENT,
    consumer: EQUIVALENCE_EVAL_CONSUMER,
    reproducibilityStatement:
      "HFX-301 equivalence evaluation: the committed pair (digest above), the deterministic " +
      "compiler + contract constructor + solution engine at the pinned code versions and the " +
      "committed scene instants fully determine this evaluation — identical inputs reproduce " +
      "the identical record and manifest (no clock, no randomness, no network)",
  });

  return {
    pairId: pair.pairId,
    expectation: pair.expectation,
    observed,
    expectationMet,
    paths: {
      agentCompile,
      directIntentId: directIntent.intentId,
      agentJourney,
      directJourney,
    },
    comparison,
    benchmarkRecordId: record.recordId,
    provenanceManifestId: manifest.manifestId,
  };
}

/* ------------------------------------------------------------------ */
/* The control-plane emission                                           */
/* ------------------------------------------------------------------ */

function emitBenchmarkRecord(input: {
  readonly pair: EquivalencePair;
  readonly observed: EquivalenceOutcome["observed"];
  readonly expectationMet: boolean;
  readonly agentCompile: AgentPathCompile;
  readonly agentJourney: JourneyOutcome;
  readonly directJourney: JourneyOutcome;
  readonly comparison: EquivalenceComparison | null;
}): BenchmarkRecord {
  const { pair, observed, expectationMet, comparison } = input;
  const divergentPoints =
    comparison === null ? [] : comparison.points.filter((point) => !point.equal);
  const body = {
    kind: "provider-benchmark-record" as const,
    schemaVersion: "provider-benchmark/1" as const,
    providerId: EQUIVALENCE_LANE_PROVIDER_ID,
    technologyVersion: EQUIVALENCE_LANE_TECHNOLOGY_VERSION,
    benchmarkId: EQUIVALENCE_EVAL_BENCHMARK_ID,
    capability: EQUIVALENCE_CAPABILITY,
    metrics: [
      {
        metric: "expectation_match",
        value: expectationMet ? 1 : 0,
        unit: "ratio",
        subjectId: pair.pairId,
        detail:
          "the observed behavior-matrix cell (and the declared difference kind, where " +
          "declared) satisfies the corpus entry's expectation",
      },
      {
        metric: "comparison_points_equal",
        value: comparison === null ? 0 : comparison.points.length - divergentPoints.length,
        unit: "count",
        subjectId: pair.pairId,
        detail:
          comparison === null
            ? "the designed agent-path outcome produced no intent — no cross-path comparison exists"
            : "the number of PROD-029 canonical comparison points equal across both authoring paths",
      },
      {
        metric: "comparison_points_total",
        value: comparison === null ? 0 : comparison.points.length,
        unit: "count",
        subjectId: pair.pairId,
        detail: "the four canonical journey comparison points (identity, state, verdict, BOQ)",
      },
    ],
    failureObservations: [
      ...(comparison === null || comparison.verdict === "equivalent"
        ? []
        : (comparison.differenceKinds.map(
            (kind) => ({
              kind,
              detail: `${pair.pairId}: the ${divergentPoints
                .map((point) => point.pointKind)
                .join(", ")} comparison point(s) diverge across the two authoring paths — ` +
                `the honestly-declared difference (kind '${kind}')`,
            }),
          ) as { readonly kind: FailureKind; readonly detail: string }[])),
      ...(expectationMet
        ? []
        : [
            {
              kind: "contract-mismatch" as FailureKind,
              detail: `${pair.pairId}: the observed cell '${observed}' does not satisfy the ` +
                `declared expectation '${pair.expectation}' — a corpus/harness mismatch, never ` +
                `a silent pass`,
            },
          ]),
    ],
    resourceObservations: EQUIVALENCE_EVAL_DECLARED_RESOURCES,
    reproduction: {
      inputsDigest: createHash("sha256")
        .update(canonicalJsonStringify({ pairId: pair.pairId }))
        .digest("hex"),
      codeVersion: EQUIVALENCE_EVAL_CODE_VERSION,
      statement:
        "deterministic reproduction: the committed pair, the default-grammar compiler, the " +
        "contract constructor and the solution engine at code version (above) always yield " +
        "these metrics — no clock, no randomness, no network",
    },
  };
  const validated = validateBenchmarkRecord(body);
  if (!validated.ok) {
    const issues = validated.failures
      .map((failure) => `${failure.path}: ${failure.detail}`)
      .join("; ");
    throw new EquivalenceEvalError(
      "invalid_request",
      `the emitted benchmark record failed validation: ${issues}`,
    );
  }
  return validated.record;
}

/* ------------------------------------------------------------------ */
/* The provenance-only control (the structural doctrine, journey level) */
/* ------------------------------------------------------------------ */

/**
 * The PROVENANCE-ONLY negative control (the structural doctrine asserted
 * at the JOURNEY level): takes ONE pair, extracts its authored intent,
 * derives the provenance-only twin (origin flipped agent ↔
 * direct-manipulation with its fields — commandText/derivationNote vs
 * interactionDetail), runs BOTH through the full journey and compares on
 * the four canonical points. A pair where the ONLY delta is provenance
 * MUST compare EQUIVALENT — attribution is not semantics.
 */
export async function evaluateProvenanceOnlyControl(input: {
  readonly pairInput: unknown;
  readonly doubles: EquivalenceHarnessDoubles;
}): Promise<EquivalenceComparison> {
  const validation = validateEquivalencePair(input.pairInput);
  if (!validation.ok) {
    const issues = validation.failures
      .map((failure) => `${failure.path}: ${failure.detail}`)
      .join("; ");
    throw new EquivalenceEvalError("invalid_pair", `the pair failed validation: ${issues}`);
  }
  const pair = validation.pair;
  const scene = equivalenceSceneOf(pair.sceneId);

  const baseline = materializeBaselineState({
    solutionId: scene.solutionId,
    versionNumber: scene.versionNumber,
    baselineRealityVersionId: scene.baselineRealityVersionId,
    materializedAt: scene.materializedAt,
  });

  // The original: compiled by the real compiler (the pair's utterance) —
  // or, when the compile is a designed non-intent outcome, the DM twin.
  // The control takes whatever intent exists and flips ONLY the provenance.
  const compiler = createSolutionCommandCompiler({ clock: () => scene.compiledAt });
  const command = await compiler.compile({ utterance: pair.nlUtterance, session: pair.session });
  const original: EngineeringOperationIntent =
    command.kind === "operation-intent"
      ? command.intent
      : directIntentOf(pair.direct, scene, `intent-direct-${pair.pairId}`);

  // The provenance-only twin: the SAME semantics, the OTHER origin, the
  // origin's own fields — everything else identical (the intentId is an
  // authoring EVENT id, not operation identity; it is kept identical so
  // the flip isolates the provenance fields alone).
  const twin = createOperationIntent({
    intentId: original.intentId,
    operationType: original.operationType,
    domain: original.domain,
    parameters: original.parameters,
    target: original.target,
    dependsOn: original.dependsOn,
    provenance:
      original.provenance.origin === "agent"
        ? {
            origin: "direct-manipulation",
            authoredBy: "user-demo-engineer",
            authoredAt: original.provenance.authoredAt,
            interactionDetail: `operator authored the ${original.operationType} directly in the interactive view`,
            derivationNote: `operator authored the ${original.operationType} in the interactive environment`,
            evidenceIds: [],
          }
        : {
            origin: "agent",
            authoredBy: "agent-demo-assistant",
            authoredAt: original.provenance.authoredAt,
            commandText: `${original.operationType} authored through the agent path`,
            evidenceIds: [],
          },
    ...(original.proposedTo === undefined ? {} : { proposedTo: original.proposedTo }),
  });

  const left = runJourney({ scene, baseline, intent: original, doubles: input.doubles });
  const right = runJourney({ scene, baseline, intent: twin, doubles: input.doubles });
  return compareJourneys(`${pair.pairId}#provenance-only`, left, right);
}
