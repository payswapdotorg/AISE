/**
 * HFX-302 — the geometry/validation substitution benchmark HARNESS (the
 * deterministic dual-lane executor + the canonical comparison).
 *
 * `evaluateSubstitutionSequence(sequence, doubles)` drives ONE corpus
 * sequence through BOTH lanes against the SAME deterministic baseline
 * scene and compares the CANONICAL projections:
 *
 *              ┌─ reference lane: adapter(aise-engine-reference) ──→ the canonical
 *   sequence ──┤        engine's applyOperation + quantity-models + validation     │
 *   (+ scene,  └─ substitute lane: adapter(geometry-substitute-{profile}) ──→ the │
 *   profile)           INDEPENDENT reimplementation (discretized accumulation     │
 *                      + independent validation re-check + independent topology)  ▼
 *                              project BOTH onto the canonical points (quantities ⊕ declared
 *                              tolerance, validation checks + verdict, topology constraints,
 *                              BOQ lines ⊕ declared tolerance — both lanes' quantities through
 *                              the SAME deriveSolutionBoq seam)
 *                                                            ▼
 *               compatible | declared-incompatible(kind + tolerance breach)
 *             | unsupported-by-substitute (the typed pre-execution gate)
 *
 *  - ONE baseline scene resolution per sequence; BOTH lanes through the
 *    SAME adapter call (`executeSequence`) — the sameness is the point;
 *  - the comparison REUSES PROD-029's canonical projections + comparison
 *    KINDS (`GEOMETRY_DIVERGENCE_KIND_BY_POINT` — every value from
 *    PROD-029's own table); the ONLY extension is the DECLARED TOLERANCE
 *    WRAP around the quantity/BOQ value comparisons (the substitute's
 *    per-dimension declared tolerances; every point carries the observed
 *    delta and the effective allowance — never rounded away);
 *  - the checks compare PER-CHECK (not just the worst-of verdict);
 *  - the BOQ leg flows BOTH lanes' quantities through the SAME public
 *    derivation seam (`deriveSolutionBoq` — the PROD-025 dependency made
 *    real; the substitute's transient derivation input is consumed and
 *    discarded, never emitted as Solution Graph identity);
 *  - the typed verdict is per-point (quantity-by-quantity, check-by-check,
 *    constraint-by-constraint, line-by-line);
 *  - every evaluation emits the governed control-plane `BenchmarkRecord`
 *    for EACH lane + a sealed `ProvenanceManifest` per lane.
 *
 * DETERMINISM: no I/O, no randomness, no clock (the scene's pinned
 * instants); identical inputs → byte-identical outcomes.
 */

import { createHash } from "node:crypto";
import { canonicalJsonStringify } from "@aise/shared-contracts";
import { sealProvenanceManifest, validateBenchmarkRecord } from "@aise/provider-registry";
import type { BenchmarkRecord, FailureKind, ProviderProfile } from "@aise/provider-registry";
import type { SolutionBoqLine } from "@aise/solution-boq";
import type { BoqDerivationInput, GeometryProvider, LaneProjection } from "./adapter";
import { executeSequence } from "./adapter";
import { REFERENCE_PROVIDER } from "./reference";
import {
  GEOMETRY_EVAL_BENCHMARK_ID,
  GEOMETRY_EVAL_CODE_VERSION,
  GEOMETRY_EVAL_CONSUMER,
  GEOMETRY_EVAL_DECLARED_RESOURCES,
  GEOMETRY_EVAL_ENVIRONMENT,
  GEOMETRY_SUBSTITUTION_CAPABILITY,
  REFERENCE_LANE_PROVIDER_ID,
  REFERENCE_LANE_TECHNOLOGY_VERSION,
  SUBSTITUTE_TECHNOLOGY_VERSION,
  referenceLaneProfile,
  substituteLaneProfile,
} from "./registry";
import type { SubstituteProfileId } from "./registry";
import { COMMITTED_PROFILE_IDS, COMMITTED_SCENE_IDS } from "./corpus";
import type { GeometryScene } from "./model";
import {
  GEOMETRY_DIVERGENCE_KIND_BY_POINT,
  GeometryEvalError,
  evaluateQuantityTolerance,
  toleranceFor,
  validateSubstitutionSequence,
} from "./model";
import type {
  GeometryComparisonPointKind,
  QuantityTolerance,
  SubstitutionExpectation,
  ToleranceEvaluation,
} from "./model";
import type { CanonicalQuantity } from "../solution-eval/model";

/* ------------------------------------------------------------------ */
/* The harness seams (injected deterministic doubles — see testkit.ts)   */
/* ------------------------------------------------------------------ */

/** One resolved BOQ of the seam (the lines are the derived rows). */
export interface ResolvedBoq {
  readonly lines: readonly SolutionBoqLine[];
}

/**
 * The BOQ resolution seam — resolves one lane's derivation input into its
 * BOQ lines through the SAME public derivation. The DEFAULT double
 * (testkit.ts) delegates to the deterministic `deriveSolutionBoq` of
 * `@aise/solution-boq` (fail-closed gates map an underivable BOQ to
 * `null`, never a throw); tests and the runner share ONE implementation.
 */
export type BoqResolverSeam = (input: BoqDerivationInput) => ResolvedBoq | null;

/** The deterministic doubles the harness runs on (ONE shared implementation). */
export interface GeometryHarnessDoubles {
  /** The baseline scene resolver (the committed corpus scenes by default). */
  readonly resolveScene: (sceneId: string) => GeometryScene;
  /** The BOQ resolution seam (the default: the deterministic `deriveSolutionBoq`). */
  readonly boqResolver: BoqResolverSeam;
  /**
   * The substitute provider resolver (the committed profiles by default).
   * The MUTATION TWINS inject sabotaged providers through THIS seam (the
   * tolerance-breach and verdict-mutation negative controls).
   */
  readonly resolveSubstituteProvider: (profileId: string) => GeometryProvider;
}

/* ------------------------------------------------------------------ */
/* The comparison records (typed, per-point)                            */
/* ------------------------------------------------------------------ */

/**
 * ONE canonical comparison point. The tolerance legs (quantity-value,
 * boq-line) carry the declared tolerance and the observed deltas (the
 * compatibility margins made auditable); the validation legs carry the
 * compared check results; every point carries its closed-vocabulary
 * divergence kind iff it diverged.
 */
export interface GeometryComparisonPoint {
  readonly pointKind: GeometryComparisonPointKind;
  readonly subjectId: string;
  readonly equal: boolean;
  readonly divergenceKind?: FailureKind;
  readonly detail: string;
  /* The tolerance legs (quantity-value, boq-line). */
  readonly dimension?: string;
  readonly unit?: string;
  readonly referenceValue?: number;
  readonly candidateValue?: number;
  readonly declaredTolerance?: { readonly absolute: number; readonly relative: number };
  readonly absoluteDelta?: number;
  readonly relativeDelta?: number;
  readonly allowedAbsolute?: number;
  readonly allowedBy?: string;
  /* The validation legs (validation-check, validation-verdict). */
  readonly referenceResult?: string;
  readonly candidateResult?: string;
}

/** The honest difference declaration (present iff the comparison diverged). */
export interface GeometryDivergence {
  /** The closed-vocabulary kind of the FIRST diverging point (deterministic order). */
  readonly failureKind: FailureKind;
  /** The distinct kinds of all diverging points (deterministic order). */
  readonly failureKinds: readonly FailureKind[];
  /** The diverging point kinds, in comparison order. */
  readonly divergentPoints: readonly GeometryComparisonPointKind[];
  readonly detail: string;
}

/** The full comparison of one dual-lane execution. */
export interface GeometryComparison {
  readonly verdict: "compatible" | "declared-incompatible";
  readonly points: readonly GeometryComparisonPoint[];
  readonly divergence?: GeometryDivergence;
}

/** One lane's control-plane record of the sequence evaluation. */
export interface SubstitutionLaneRecord {
  readonly lane: "reference" | "substitute";
  readonly providerId: string;
  readonly technologyVersion: string;
  readonly executed: boolean;
  /** Present iff the lane's capability gate refused (the substitute lane only). */
  readonly unsupportedFamily?: string;
  readonly benchmarkRecordId: string;
  readonly provenanceManifestId: string;
}

/** The outcome of ONE substitution sequence evaluation. */
export interface SubstitutionSequenceOutcome {
  readonly sequenceId: string;
  readonly expectation: SubstitutionExpectation;
  readonly observed: SubstitutionExpectation;
  readonly expectationMet: boolean;
  readonly substituteProfileId: string;
  readonly referenceLane: SubstitutionLaneRecord;
  readonly substituteLane: SubstitutionLaneRecord;
  /** Present iff BOTH lanes executed (null on the unsupported cell). */
  readonly comparison: GeometryComparison | null;
  /**
   * sha-256 over the reference lane's canonical projection — the
   * historical-replay anchor (a failed/removed substitute never affects
   * the reference lane's re-derivable projections).
   */
  readonly referenceProjectionDigest: string;
}

/* ------------------------------------------------------------------ */
/* The comparison (PROD-029's points + the declared tolerance wrap)     */
/* ------------------------------------------------------------------ */

/** The deterministic quantity-group key (the compared semantic fields). */
function quantityGroupKey(row: CanonicalQuantity): string {
  return `${row.label}::${row.direction}::${row.dimension}::${row.unit}`;
}

/** The deterministic BOQ-line group key (the compared semantic fields). */
function boqLineGroupKey(line: SolutionBoqLine): string {
  return `${line.activity}::${line.direction}::${line.quantity.dimension}::${line.quantity.unit}::${
    line.material ?? ""
  }`;
}

/** Builds one tolerance leg point (quantity or BOQ line). */
function tolerancePoint(
  pointKind: "quantity-value" | "boq-line",
  subjectId: string,
  detail: string,
  dimension: string,
  unit: string,
  referenceValue: number,
  candidateValue: number,
  tolerance: QuantityTolerance,
): GeometryComparisonPoint {
  const evaluation: ToleranceEvaluation = evaluateQuantityTolerance(
    tolerance,
    referenceValue,
    candidateValue,
  );
  return {
    pointKind,
    subjectId,
    equal: evaluation.within,
    ...(evaluation.within ? {} : { divergenceKind: GEOMETRY_DIVERGENCE_KIND_BY_POINT[pointKind] }),
    detail,
    dimension,
    unit,
    referenceValue,
    candidateValue,
    declaredTolerance: { absolute: tolerance.absolute, relative: tolerance.relative },
    absoluteDelta: evaluation.absoluteDelta,
    relativeDelta: evaluation.relativeDelta,
    allowedAbsolute: evaluation.allowedAbsolute,
    allowedBy: evaluation.allowedBy,
  };
}

/** Compares the two lanes' projected quantities (grouped, pairwise, tolerance-wrapped). */
function compareQuantities(
  reference: readonly CanonicalQuantity[],
  candidate: readonly CanonicalQuantity[],
  toleranceOf: (dimension: string) => QuantityTolerance,
): GeometryComparisonPoint[] {
  const points: GeometryComparisonPoint[] = [];
  const referenceGroups = new Map<string, CanonicalQuantity[]>();
  for (const row of reference) {
    const key = quantityGroupKey(row);
    const list = referenceGroups.get(key) ?? [];
    list.push(row);
    referenceGroups.set(key, list);
  }
  const candidateGroups = new Map<string, CanonicalQuantity[]>();
  for (const row of candidate) {
    const key = quantityGroupKey(row);
    const list = candidateGroups.get(key) ?? [];
    list.push(row);
    candidateGroups.set(key, list);
  }
  const keys = [...new Set([...referenceGroups.keys(), ...candidateGroups.keys()])].sort((a, b) =>
    a.localeCompare(b),
  );
  for (const key of keys) {
    const referenceRows = referenceGroups.get(key) ?? [];
    const candidateRows = candidateGroups.get(key) ?? [];
    const label = key.split("::")[0] ?? key;
    for (let ordinal = 1; ordinal <= Math.max(referenceRows.length, candidateRows.length); ordinal += 1) {
      const subjectId = `${label}#${ordinal}`;
      const referenceRow = referenceRows[ordinal - 1];
      const candidateRow = candidateRows[ordinal - 1];
      if (referenceRow === undefined || candidateRow === undefined) {
        points.push({
          pointKind: "quantity-value",
          subjectId,
          equal: false,
          divergenceKind: GEOMETRY_DIVERGENCE_KIND_BY_POINT["quantity-value"],
          detail:
            referenceRow === undefined
              ? `sequence quantity '${subjectId}' (${key}): the reference lane did not emit the row the substitute emitted — a one-sided quantity is a divergence, never a pass`
              : `sequence quantity '${subjectId}' (${key}): the substitute lane did not emit the row the reference emitted — a one-sided quantity is a divergence, never a pass`,
        });
        continue;
      }
      points.push(
        tolerancePoint(
          "quantity-value",
          subjectId,
          `sequence quantity '${subjectId}' (${referenceRow.dimension} ${referenceRow.unit}, ${referenceRow.direction}) compared within the substitute's declared ${referenceRow.dimension} tolerance`,
          referenceRow.dimension,
          referenceRow.unit,
          referenceRow.value,
          candidateRow.value,
          toleranceOf(referenceRow.dimension),
        ),
      );
    }
  }
  return points;
}

/** Compares the two lanes' validation checks (per-check, never only the verdict). */
function compareChecks(
  reference: readonly { checkId: string; result: string }[],
  candidate: readonly { checkId: string; result: string }[],
): GeometryComparisonPoint[] {
  const points: GeometryComparisonPoint[] = [];
  const referenceById = new Map(reference.map((check) => [check.checkId, check.result] as const));
  const candidateById = new Map(candidate.map((check) => [check.checkId, check.result] as const));
  const checkIds = [...new Set([...referenceById.keys(), ...candidateById.keys()])].sort((a, b) =>
    a.localeCompare(b),
  );
  for (const checkId of checkIds) {
    const referenceResult = referenceById.get(checkId);
    const candidateResult = candidateById.get(checkId);
    if (referenceResult === undefined || candidateResult === undefined) {
      points.push({
        pointKind: "validation-check",
        subjectId: checkId,
        equal: false,
        divergenceKind: GEOMETRY_DIVERGENCE_KIND_BY_POINT["validation-check"],
        detail:
          referenceResult === undefined
            ? `validation check '${checkId}': the reference lane did not emit the check the substitute emitted — a one-sided check is a divergence`
            : `validation check '${checkId}': the substitute lane did not emit the check the reference emitted — a one-sided check is a divergence`,
      });
      continue;
    }
    const equal = referenceResult === candidateResult;
    points.push({
      pointKind: "validation-check",
      subjectId: checkId,
      equal,
      ...(equal ? {} : { divergenceKind: GEOMETRY_DIVERGENCE_KIND_BY_POINT["validation-check"] }),
      detail: equal
        ? `validation check '${checkId}': both lanes answer '${referenceResult}'`
        : `validation check '${checkId}': the reference lane answers '${referenceResult}' but the substitute answers '${candidateResult}' — the checks compare, never only the worst-of verdict`,
      referenceResult,
      candidateResult,
    });
  }
  return points;
}

/** Compares the two lanes' topology constraints (row-by-row by constraint id). */
function compareTopology(
  reference: readonly { constraintId: string; kind: string; subjectRefs: readonly string[]; statement: string }[],
  candidate: readonly { constraintId: string; kind: string; subjectRefs: readonly string[]; statement: string }[],
): GeometryComparisonPoint[] {
  const points: GeometryComparisonPoint[] = [];
  const referenceById = new Map(reference.map((row) => [row.constraintId, row] as const));
  const candidateById = new Map(candidate.map((row) => [row.constraintId, row] as const));
  const constraintIds = [...new Set([...referenceById.keys(), ...candidateById.keys()])].sort((a, b) =>
    a.localeCompare(b),
  );
  for (const constraintId of constraintIds) {
    const referenceRow = referenceById.get(constraintId);
    const candidateRow = candidateById.get(constraintId);
    if (referenceRow === undefined || candidateRow === undefined) {
      points.push({
        pointKind: "topology-constraint",
        subjectId: constraintId,
        equal: false,
        divergenceKind: GEOMETRY_DIVERGENCE_KIND_BY_POINT["topology-constraint"],
        detail:
          referenceRow === undefined
            ? `topology constraint '${constraintId}': the reference lane did not derive the constraint the substitute derived — a one-sided topology is a divergence`
            : `topology constraint '${constraintId}': the substitute lane did not derive the constraint the reference derived — a one-sided topology is a divergence`,
      });
      continue;
    }
    const equal =
      referenceRow.kind === candidateRow.kind &&
      referenceRow.statement === candidateRow.statement &&
      referenceRow.subjectRefs.join("|") === candidateRow.subjectRefs.join("|");
    points.push({
      pointKind: "topology-constraint",
      subjectId: constraintId,
      equal,
      ...(equal ? {} : { divergenceKind: GEOMETRY_DIVERGENCE_KIND_BY_POINT["topology-constraint"] }),
      detail: equal
        ? `topology constraint '${constraintId}' (${referenceRow.kind}): both lanes derive the identical canonical row`
        : `topology constraint '${constraintId}': the lanes derive different canonical rows (reference: '${referenceRow.statement}'; substitute: '${candidateRow.statement}')`,
    });
  }
  return points;
}

/** Compares the two lanes' derived BOQ lines (grouped, pairwise, tolerance-wrapped). */
function compareBoqLines(
  reference: readonly SolutionBoqLine[],
  candidate: readonly SolutionBoqLine[],
  toleranceOf: (dimension: string) => QuantityTolerance,
): GeometryComparisonPoint[] {
  const points: GeometryComparisonPoint[] = [];
  const referenceGroups = new Map<string, SolutionBoqLine[]>();
  for (const line of reference) {
    const key = boqLineGroupKey(line);
    const list = referenceGroups.get(key) ?? [];
    list.push(line);
    referenceGroups.set(key, list);
  }
  const candidateGroups = new Map<string, SolutionBoqLine[]>();
  for (const line of candidate) {
    const key = boqLineGroupKey(line);
    const list = candidateGroups.get(key) ?? [];
    list.push(line);
    candidateGroups.set(key, list);
  }
  const keys = [...new Set([...referenceGroups.keys(), ...candidateGroups.keys()])].sort((a, b) =>
    a.localeCompare(b),
  );
  for (const key of keys) {
    const referenceLines = referenceGroups.get(key) ?? [];
    const candidateLines = candidateGroups.get(key) ?? [];
    const activity = key.split("::")[0] ?? key;
    for (let ordinal = 1; ordinal <= Math.max(referenceLines.length, candidateLines.length); ordinal += 1) {
      const subjectId = `${activity}#${ordinal}`;
      const referenceLine = referenceLines[ordinal - 1];
      const candidateLine = candidateLines[ordinal - 1];
      if (referenceLine === undefined || candidateLine === undefined) {
        points.push({
          pointKind: "boq-line",
          subjectId,
          equal: false,
          divergenceKind: GEOMETRY_DIVERGENCE_KIND_BY_POINT["boq-line"],
          detail:
            referenceLine === undefined
              ? `BOQ line '${subjectId}' (${key}): the reference derivation did not emit the line the substitute derivation emitted — a one-sided line is a divergence`
              : `BOQ line '${subjectId}' (${key}): the substitute derivation did not emit the line the reference derivation emitted — a one-sided line is a divergence`,
        });
        continue;
      }
      points.push(
        tolerancePoint(
          "boq-line",
          subjectId,
          `BOQ line '${subjectId}' (${referenceLine.quantity.dimension} ${referenceLine.quantity.unit}, ${referenceLine.direction}) compared within the substitute's declared ${referenceLine.quantity.dimension} tolerance — both lanes' quantities flowed through the SAME deriveSolutionBoq derivation`,
          referenceLine.quantity.dimension,
          referenceLine.quantity.unit,
          referenceLine.quantity.value,
          candidateLine.quantity.value,
          toleranceOf(referenceLine.quantity.dimension),
        ),
      );
    }
  }
  return points;
}

/** Assembles the divergence declaration over the compared points (deterministic order). */
function divergenceOver(points: readonly GeometryComparisonPoint[]): GeometryDivergence {
  const divergent = points.filter((point) => !point.equal);
  const failureKinds: FailureKind[] = [];
  for (const point of divergent) {
    if (point.divergenceKind !== undefined && !failureKinds.includes(point.divergenceKind)) {
      failureKinds.push(point.divergenceKind);
    }
  }
  const first = divergent[0];
  return {
    failureKind: (first?.divergenceKind ?? "operation-semantic-failure") as FailureKind,
    failureKinds,
    divergentPoints: divergent.map((point) => point.pointKind),
    detail:
      `${divergent.length} comparison point(s) diverge ` +
      `(${divergent.map((point) => point.subjectId).join(", ")}) — the honestly-declared ` +
      `difference with the PROD-029 closed-vocabulary kind(s) ${failureKinds.join(", ")}`,
  };
}

/* ------------------------------------------------------------------ */
/* The control-plane emission (per lane)                                */
/* ------------------------------------------------------------------ */

function digestOf(value: unknown): string {
  return createHash("sha256").update(canonicalJsonStringify(value), "utf8").digest("hex");
}

function emitLaneRecord(input: {
  readonly sequenceId: string;
  readonly lane: "reference" | "substitute";
  readonly providerId: string;
  readonly technologyVersion: string;
  readonly profile: ProviderProfile;
  readonly executed: boolean;
  readonly unsupportedFamily?: string;
  readonly comparison: GeometryComparison | null;
  readonly expectationMet: boolean;
  readonly projection: LaneProjection | null;
}): { readonly record: BenchmarkRecord; readonly manifestId: string } {
  const { sequenceId, lane, providerId, technologyVersion, comparison, expectationMet } = input;
  const divergent = comparison === null ? [] : comparison.points.filter((point) => !point.equal);
  const metrics = [
    {
      metric: "lane_executed",
      value: input.executed ? 1 : 0,
      unit: "ratio",
      subjectId: sequenceId,
      detail:
        lane === "reference"
          ? "the reference oracle executed the sequence through the canonical engine"
          : "the substitute lane executed the sequence through the independent reimplementation (0 when the fail-closed capability gate refused)",
    },
    {
      metric: "comparison_points_equal",
      value: comparison === null ? 0 : comparison.points.length - divergent.length,
      unit: "count",
      subjectId: sequenceId,
      detail:
        comparison === null
          ? "the typed unsupported outcome produced no cross-lane comparison — the record IS the outcome"
          : "the number of canonical comparison points equal across both lanes",
    },
    {
      metric: "comparison_points_total",
      value: comparison === null ? 0 : comparison.points.length,
      unit: "count",
      subjectId: sequenceId,
      detail: "the canonical comparison points (quantities, checks, verdict, topology, BOQ lines)",
    },
    {
      metric: "expectation_match",
      value: expectationMet ? 1 : 0,
      unit: "ratio",
      subjectId: sequenceId,
      detail: "the observed behavior-matrix cell satisfies the corpus entry's expectation",
    },
  ];
  const failureObservations: { readonly kind: FailureKind; readonly detail: string }[] = [
    ...(input.unsupportedFamily === undefined
      ? []
      : [
          {
            kind: "unsupported-data" as FailureKind,
            detail:
              `${sequenceId}: the operation family '${input.unsupportedFamily}' is outside the ` +
              `substitute's declared capabilities — the typed fail-closed gate recorded it BEFORE ` +
              `execution, never computed`,
          },
        ]),
    ...(comparison === null || comparison.verdict === "compatible"
      ? []
      : (comparison.divergence?.failureKinds.map((kind) => ({
          kind,
          detail:
            `${sequenceId}: the ${divergent.map((point) => point.subjectId).join(", ")} comparison ` +
            `point(s) diverge — the honestly-declared difference (kind '${kind}')`,
        })) ?? [])),
    ...(expectationMet
      ? []
      : [
          {
            kind: "contract-mismatch" as FailureKind,
            detail:
              `${sequenceId}: the observed cell does not satisfy the declared expectation — a ` +
              `corpus/harness mismatch, never a silent pass`,
          },
        ]),
  ];
  const body = {
    kind: "provider-benchmark-record" as const,
    schemaVersion: "provider-benchmark/1" as const,
    providerId,
    technologyVersion,
    benchmarkId: GEOMETRY_EVAL_BENCHMARK_ID,
    capability: GEOMETRY_SUBSTITUTION_CAPABILITY,
    metrics,
    failureObservations,
    resourceObservations: GEOMETRY_EVAL_DECLARED_RESOURCES,
    reproduction: {
      inputsDigest: digestOf({ sequenceId, lane, providerId }),
      codeVersion: GEOMETRY_EVAL_CODE_VERSION,
      statement:
        "deterministic reproduction: the committed sequence (digest above) through the " +
        "deterministic lane at code version (above) always yields these metrics — no clock, " +
        "no randomness, no network",
    },
  };
  const validated = validateBenchmarkRecord(body);
  if (!validated.ok) {
    const issues = validated.failures
      .map((failure) => `${failure.path}: ${failure.detail}`)
      .join("; ");
    throw new GeometryEvalError(
      "invalid_request",
      `the emitted benchmark record failed validation: ${issues}`,
    );
  }
  const manifest = sealProvenanceManifest({
    profile: input.profile,
    inputDigests: [digestOf({ sequenceId, lane })],
    normalizedResultDigest: digestOf({
      lane,
      executed: input.executed,
      ...(input.unsupportedFamily === undefined ? {} : { unsupportedFamily: input.unsupportedFamily }),
      ...(comparison === null ? {} : { verdict: comparison.verdict }),
      expectationMet,
    }),
    benchmarkRecords: [validated.record],
    environment: GEOMETRY_EVAL_ENVIRONMENT,
    consumer: GEOMETRY_EVAL_CONSUMER,
    reproducibilityStatement:
      `HFX-302 geometry substitution evaluation (${lane} lane): the committed sequence, the ` +
      `deterministic lane at the pinned code versions and the committed scene instants fully ` +
      `determine this evaluation — identical inputs reproduce the identical record and manifest`,
  });
  return { record: validated.record, manifestId: manifest.manifestId };
}

/* ------------------------------------------------------------------ */
/* The sequence evaluation (the benchmark entry point)                  */
/* ------------------------------------------------------------------ */

/**
 * Evaluates ONE substitution sequence (the benchmark entry point). Throws
 * {@link GeometryEvalError} for CALLER/wiring bugs only (a malformed
 * sequence, an unknown profile); every benchmark outcome — compatible,
 * declared-incompatible with the tolerance breach, unsupported-by-substitute
 * naming the family — is a first-class value in the returned
 * {@link SubstitutionSequenceOutcome}.
 */
export function evaluateSubstitutionSequence(
  sequenceInput: unknown,
  doubles: GeometryHarnessDoubles,
): SubstitutionSequenceOutcome {
  /* 1. Validation (fail-closed). */
  const validation = validateSubstitutionSequence(
    sequenceInput,
    COMMITTED_PROFILE_IDS,
    COMMITTED_SCENE_IDS,
  );
  if (!validation.ok) {
    const issues = validation.failures
      .map((failure) => `${failure.path}: ${failure.detail}`)
      .join("; ");
    throw new GeometryEvalError("invalid_sequence", `the sequence failed validation: ${issues}`);
  }
  const sequence = validation.sequence;
  const scene = doubles.resolveScene(sequence.baselineSceneId);

  /* 2. The substitute provider of the declared profile. */
  const substituteProvider: GeometryProvider = doubles.resolveSubstituteProvider(
    sequence.substituteProfileId,
  );
  const substituteDescriptor = substituteProvider.descriptor;

  /* 3. BOTH lanes through the SAME adapter call. */
  const referenceExecution = executeSequence(REFERENCE_PROVIDER, scene, sequence.operations);
  const substituteExecution = executeSequence(substituteProvider, scene, sequence.operations);

  if (referenceExecution.outcome !== "executed") {
    // The reference oracle declares ALL TEN families and projects its own
    // canonical output — a refusal here is a harness wiring bug, never a
    // benchmark outcome.
    throw new GeometryEvalError(
      "invalid_request",
      `the reference oracle lane did not execute sequence '${sequence.sequenceId}': ` +
        `'${referenceExecution.outcome}'`,
    );
  }

  /* 4. The unsupported cell: the typed gate outcome IS the record. */
  if (substituteExecution.outcome === "unsupported") {
    const expectationMet = sequence.expectation === "unsupported-by-substitute";
    const referenceRecord = emitLaneRecord({
      sequenceId: sequence.sequenceId,
      lane: "reference",
      providerId: REFERENCE_LANE_PROVIDER_ID,
      technologyVersion: REFERENCE_LANE_TECHNOLOGY_VERSION,
      profile: referenceLaneProfile(),
      executed: true,
      comparison: null,
      expectationMet,
      projection: referenceExecution.projection,
    });
    const substituteRecord = emitLaneRecord({
      sequenceId: sequence.sequenceId,
      lane: "substitute",
      providerId: substituteDescriptor.providerId,
      technologyVersion: SUBSTITUTE_TECHNOLOGY_VERSION,
      profile: substituteLaneProfile(
        sequence.substituteProfileId as SubstituteProfileId,
      ),
      executed: false,
      unsupportedFamily: substituteExecution.family,
      comparison: null,
      expectationMet,
      projection: null,
    });
    return {
      sequenceId: sequence.sequenceId,
      expectation: sequence.expectation,
      observed: "unsupported-by-substitute",
      expectationMet,
      substituteProfileId: sequence.substituteProfileId,
      referenceLane: {
        lane: "reference",
        providerId: REFERENCE_LANE_PROVIDER_ID,
        technologyVersion: REFERENCE_LANE_TECHNOLOGY_VERSION,
        executed: true,
        benchmarkRecordId: referenceRecord.record.recordId,
        provenanceManifestId: referenceRecord.manifestId,
      },
      substituteLane: {
        lane: "substitute",
        providerId: substituteDescriptor.providerId,
        technologyVersion: SUBSTITUTE_TECHNOLOGY_VERSION,
        executed: false,
        unsupportedFamily: substituteExecution.family,
        benchmarkRecordId: substituteRecord.record.recordId,
        provenanceManifestId: substituteRecord.manifestId,
      },
      comparison: null,
      referenceProjectionDigest: digestOf(referenceExecution.projection),
    };
  }

  if (substituteExecution.outcome === "projection-refused") {
    // A committed substitute that smuggles provider-specific fields into a
    // canonical point is a WIRING bug at this seam — the negative control
    // asserts the refusal through the adapter directly (adapter.test.ts).
    throw new GeometryEvalError(
      "invalid_request",
      `the substitute lane's output was refused at the canonical boundary for sequence ` +
        `'${sequence.sequenceId}': ${substituteExecution.refusal.detail}`,
    );
  }

  /* 5. The comparison (PROD-029's points + the declared tolerance wrap). */
  const toleranceOf = (dimension: string): QuantityTolerance =>
    toleranceFor(substituteDescriptor, dimension as QuantityTolerance["dimension"]);
  const referenceBoq = doubles.boqResolver(referenceExecution.derivationInput);
  const substituteBoq = doubles.boqResolver(substituteExecution.derivationInput);

  const points: GeometryComparisonPoint[] = [
    ...compareQuantities(
      referenceExecution.projection.quantities,
      substituteExecution.projection.quantities,
      toleranceOf,
    ),
    ...compareChecks(referenceExecution.projection.checks, substituteExecution.projection.checks),
    {
      pointKind: "validation-verdict" as const,
      subjectId: "worst-of-verdict",
      equal: referenceExecution.projection.verdict === substituteExecution.projection.verdict,
      ...(referenceExecution.projection.verdict === substituteExecution.projection.verdict
        ? {}
        : { divergenceKind: GEOMETRY_DIVERGENCE_KIND_BY_POINT["validation-verdict"] }),
      detail:
        referenceExecution.projection.verdict === substituteExecution.projection.verdict
          ? `both lanes' worst-of validation verdict is '${referenceExecution.projection.verdict}'`
          : `the reference lane's worst-of verdict is '${referenceExecution.projection.verdict}' but the substitute's is '${substituteExecution.projection.verdict}'`,
      referenceResult: referenceExecution.projection.verdict,
      candidateResult: substituteExecution.projection.verdict,
    },
    ...compareTopology(
      referenceExecution.projection.topology,
      substituteExecution.projection.topology,
    ),
  ];
  if (referenceBoq !== null && substituteBoq !== null) {
    points.push(...compareBoqLines(referenceBoq.lines, substituteBoq.lines, toleranceOf));
  } else if (referenceBoq === null && substituteBoq === null) {
    // Both derivations fail-closed identically (never the case over the
    // committed corpus): no BOQ point exists to compare — recorded in the
    // verdict detail, never silently dropped.
    points.push({
      pointKind: "boq-line",
      subjectId: "boq-derivation",
      equal: true,
      detail:
        "both lanes' BOQ derivations were refused by the derivation's own fail-closed gates — no BOQ lines exist to compare on either side",
    });
  } else {
    points.push({
      pointKind: "boq-line",
      subjectId: "boq-derivation",
      equal: false,
      divergenceKind: GEOMETRY_DIVERGENCE_KIND_BY_POINT["boq-line"],
      detail:
        referenceBoq === null
          ? "the reference lane's BOQ derivation was refused while the substitute's derived — a one-sided derivation is a divergence"
          : "the substitute lane's BOQ derivation was refused while the reference's derived — a one-sided derivation is a divergence",
    });
  }

  const divergent = points.filter((point) => !point.equal);
  const comparison: GeometryComparison =
    divergent.length === 0
      ? { verdict: "compatible", points }
      : { verdict: "declared-incompatible", points, divergence: divergenceOver(points) };

  /* 6. The observed cell + the expectation gate. */
  const observed: SubstitutionExpectation =
    comparison.verdict === "compatible" ? "compatible" : "declared-incompatible";
  let expectationMet: boolean;
  if (observed !== sequence.expectation) {
    expectationMet = false;
  } else if (observed === "declared-incompatible") {
    expectationMet =
      sequence.declaredDifferenceKind !== undefined &&
      comparison.divergence !== undefined &&
      comparison.divergence.failureKind === sequence.declaredDifferenceKind;
  } else {
    expectationMet = true;
  }

  /* 7. The governed control-plane emission (BOTH lanes). */
  const referenceRecord = emitLaneRecord({
    sequenceId: sequence.sequenceId,
    lane: "reference",
    providerId: REFERENCE_LANE_PROVIDER_ID,
    technologyVersion: REFERENCE_LANE_TECHNOLOGY_VERSION,
    profile: referenceLaneProfile(),
    executed: true,
    comparison,
    expectationMet,
    projection: referenceExecution.projection,
  });
  const substituteRecord = emitLaneRecord({
    sequenceId: sequence.sequenceId,
    lane: "substitute",
    providerId: substituteDescriptor.providerId,
    technologyVersion: SUBSTITUTE_TECHNOLOGY_VERSION,
    profile: substituteLaneProfile(sequence.substituteProfileId as SubstituteProfileId),
    executed: true,
    comparison,
    expectationMet,
    projection: substituteExecution.projection,
  });

  return {
    sequenceId: sequence.sequenceId,
    expectation: sequence.expectation,
    observed,
    expectationMet,
    substituteProfileId: sequence.substituteProfileId,
    referenceLane: {
      lane: "reference",
      providerId: REFERENCE_LANE_PROVIDER_ID,
      technologyVersion: REFERENCE_LANE_TECHNOLOGY_VERSION,
      executed: true,
      benchmarkRecordId: referenceRecord.record.recordId,
      provenanceManifestId: referenceRecord.manifestId,
    },
    substituteLane: {
      lane: "substitute",
      providerId: substituteDescriptor.providerId,
      technologyVersion: SUBSTITUTE_TECHNOLOGY_VERSION,
      executed: true,
      benchmarkRecordId: substituteRecord.record.recordId,
      provenanceManifestId: substituteRecord.manifestId,
    },
    comparison,
    referenceProjectionDigest: digestOf(referenceExecution.projection),
  };
}

/** The historical-replay reference digest helper (the reference lane alone). */
export function referenceProjectionDigestOf(
  sequenceInput: unknown,
  doubles: GeometryHarnessDoubles,
): string {
  const validation = validateSubstitutionSequence(
    sequenceInput,
    COMMITTED_PROFILE_IDS,
    COMMITTED_SCENE_IDS,
  );
  if (!validation.ok) {
    const issues = validation.failures
      .map((failure) => `${failure.path}: ${failure.detail}`)
      .join("; ");
    throw new GeometryEvalError("invalid_sequence", `the sequence failed validation: ${issues}`);
  }
  const scene = doubles.resolveScene(validation.sequence.baselineSceneId);
  const execution = executeSequence(REFERENCE_PROVIDER, scene, validation.sequence.operations);
  if (execution.outcome !== "executed") {
    throw new GeometryEvalError(
      "invalid_request",
      `the reference oracle lane did not execute: '${execution.outcome}'`,
    );
  }
  return digestOf(execution.projection);
}
