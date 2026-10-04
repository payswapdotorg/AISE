/**
 * WORLD-P3 — the COORDINATION family (`src/coordination/`): stages 2–3
 * of the lane (COORDINATE + CLASH-DETECT).
 *
 *   COORDINATE     — model coordination as multi-model aggregation
 *                    through the P0-A scene-composition types: several
 *                    discipline models (reality capture, the BIM model,
 *                    the solution proposal…) aggregate into ONE
 *                    coordinated world scene with per-node model
 *                    provenance. IDENTITY QUARANTINE ACROSS MODELS:
 *                    element ids are unique across the whole aggregate —
 *                    a cross-model id collision is a typed refusal
 *                    (one stable AISE id names one element, ever); a
 *                    parent reference never crosses models.
 *   CLASH-DETECT   — clash/conflict detection as TYPED PREDICATES
 *                    delegating to the P0-B exact-geometry vocabulary:
 *                    the clash pair's comparable geometry is a DECLARED
 *                    `GeometryShapeDeclaration` (the P0-B closed shape
 *                    vocabulary), the tolerance is DECLARED (positive
 *                    finite, carried VERBATIM in every verdict), and
 *                    the verdict answers from the CLOSED vocabulary
 *                    clear / within-tolerance / clash — NEVER a silent
 *                    boolean (the P0-B near-boundary discipline
 *                    delegated to: the consumer decides with the
 *                    tolerance, the lane never folds it into the
 *                    value).
 *
 * THE CLASH-ENGINE SUBSTRATE LAW: the clash predicate computation sits
 * behind the `ClashPredicateAdapter` port — the real clash engine
 * (exact NURBS/swept-surface distance queries over OCCT) is BLOCKED
 * with the WORLD-P4 sidecar-deployment protocol (see the item's
 * CAPABILITY-BOUNDARIES). The two in-memory substitution doubles prove
 * the contract WITHOUT any clash engine: closed-form axis-aligned box
 * separation over the declared shape proxies, the P0-B declared-shape
 * request validation applied to every pair fail-closed BEFORE any
 * computation, and byte-identical reports from two independent code
 * paths.
 *
 * THE P2 PROBLEM-LANE BINDING LAW: every clash verdict that is NOT
 * clear MUST be recorded as a `CoordinationConflictRecord` BOUND to a
 * declared engineering problem of the P2 problem lane (`@aise/
 * world-layer2-experience` EngineeringProblem — composed, never
 * re-defined): the binding resolves the problem id and its spatial
 * binding must cover the clashing elements — an unresolvable binding is
 * a typed refusal. The conflict record is the P2 problem lane's
 * coordination entry point (P4 wires the live problem creation).
 *
 * LAWS (on top of the seam's ten; enforced here and drilled by
 * `coordination.test.ts`):
 *
 *  1. AGGREGATION THROUGH THE SCENE-COMPOSITION TYPES: the aggregate is
 *     a `ComposedScene` (P0-A) + per-node model provenance; every
 *     model's own scene is validated (`validateScene`) BEFORE
 *     aggregation; the aggregate is validated AFTER (fail-closed: no
 *     partially-aggregated world).
 *  2. IDENTITY QUARANTINE ACROSS MODELS: cross-model element-id
 *     collisions are typed refusals; substrate-shaped ids are refused
 *     by pattern (the seam's tripwire); model ids are AISE-side stable
 *     ids.
 *  3. PARENTS STAY IN-MODEL: a parentId that resolves into another
 *     model is a typed refusal (model-internal hierarchy only).
 *  4. TOLERANCES ARE DECLARED, NEVER IMPLICIT: a clash request without
 *     a positive-finite declared tolerance is refused; every verdict
 *     carries the applied tolerance VERBATIM.
 *  5. THE VERDICT VOCABULARY IS CLOSED: clear / within-tolerance /
 *     clash; near-boundary pairs answer within-tolerance with their
 *     separation VALUE and the near-boundary flag — the consumer
 *     decides, never the lane.
 *  6. DETERMINISM: no network, no clock reads, no randomness; the
 *     report is content-addressed (deterministic reportId).
 */

import {
  validateGeometryComputationRequest,
  GEOMETRY_REQUEST_KIND,
  GEOMETRY_REQUEST_SCHEMA_VERSION,
  type GeometryComputationRequest,
  type GeometryShapeDeclaration,
  type GeometryToleranceDeclaration,
  type GeometryUnitDeclaration,
} from "@aise/world-understanding-substrate";
import { validateScene, type ComposedScene, type SceneNode } from "@aise/world-reality-substrate";
import type { EngineeringProblem } from "@aise/world-layer2-experience";
import {
  contentIdOf,
  isDeclaredInstant,
  isFinitePositive,
  isRecord,
  laneRefused,
  looksLikeSubstrateId,
  type Layer3Family,
  type LaneOutcome,
} from "../seam";

const FAMILY: Layer3Family = "coordination";

/* ------------------------------------------------------------------ */
/* Sealed kinds + closed vocabularies                                   */
/* ------------------------------------------------------------------ */

export const COORDINATION_AGGREGATE_KIND = "coordinated-scene-aggregate" as const;
export const COORDINATION_AGGREGATE_SCHEMA_VERSION = "coordinated-scene-aggregate/1" as const;
export const CLASH_REPORT_KIND = "coordination-clash-report" as const;
export const CLASH_REPORT_SCHEMA_VERSION = "coordination-clash-report/1" as const;
export const CLASH_PREDICATE_PORT_ID = "coordination.clash-predicate/1" as const;

/** The closed clash-verdict vocabulary (law 5 — never a silent boolean). */
export const CLASH_VERDICTS = ["clear", "within-tolerance", "clash"] as const;
export type ClashVerdictKind = (typeof CLASH_VERDICTS)[number];

export function isClashVerdictKind(value: unknown): value is ClashVerdictKind {
  return (
    typeof value === "string" &&
    (CLASH_VERDICTS as readonly string[]).includes(value)
  );
}

/**
 * The closed clash-shape support declaration of the P3 contract: the
 * typed clash pair accepts the P0-B declared shape vocabulary, but the
 * P3 clash predicate computes over BOX shape proxies (axis-aligned
 * bounds) — the honest, declared support; any other shape kind is a
 * typed `unsupported-data` refusal naming the kind (real clash-engine
 * measurements BLOCKED with the WORLD-P4 sidecar protocol).
 */
export const SUPPORTED_CLASH_SHAPE_KINDS = ["box"] as const;
export type SupportedClashShapeKind = (typeof SUPPORTED_CLASH_SHAPE_KINDS)[number];

/* ------------------------------------------------------------------ */
/* COORDINATE — multi-model aggregation                                 */
/* ------------------------------------------------------------------ */

/** One discipline model entering coordination. */
export interface CoordinationModelSource {
  /** AISE-side stable model identity (never a substrate id). */
  readonly modelId: string;
  /** The model's own scene (validated before aggregation). */
  readonly scene: ComposedScene;
  /**
   * The model's placement into the aggregate site frame: a translation
   * (metres, site frame) — declared by the AISE side, never sensed.
   */
  readonly placementMetres: readonly [number, number, number];
}

/**
 * The aggregate: the coordinated world scene plus per-element model
 * provenance. The `scene` is a P0-A `ComposedScene` (law 1); the
 * `elementModelTable` records which model contributed each element.
 */
export interface CoordinatedSceneAggregate {
  readonly kind: typeof COORDINATION_AGGREGATE_KIND;
  readonly schemaVersion: typeof COORDINATION_AGGREGATE_SCHEMA_VERSION;
  /** Content-derived aggregate identity. */
  readonly aggregateId: string;
  /** The aggregated world scene (a NEW revision — inputs never mutated). */
  readonly scene: ComposedScene;
  /** The contributing model ids, in aggregation request order. */
  readonly modelIds: readonly string[];
  /** elementId → the model that contributed it (model provenance). */
  readonly elementModelTable: readonly {
    readonly elementId: string;
    readonly modelId: string;
  }[];
}

/** The aggregation request: the models + the aggregate revision. */
export interface CoordinationAggregationRequest {
  readonly models: readonly CoordinationModelSource[];
  /** The aggregate site frame (carried into the composed scene). */
  readonly siteFrame: ComposedScene["siteFrame"];
  /** The aggregate's layer table (the union of model layers + "solution"). */
  readonly layers: readonly ComposedScene["layers"][number][];
}

/**
 * Aggregate the models into ONE coordinated world scene (law 1–3):
 * validate each model's own scene, refuse cross-model id collisions,
 * place each model's nodes into the aggregate site frame, validate the
 * aggregate structurally. PURE — inputs are never mutated.
 */
export function aggregateCoordinationModels(
  request: CoordinationAggregationRequest,
): LaneOutcome<CoordinatedSceneAggregate> {
  if (request.models.length === 0) {
    return laneRefused<CoordinatedSceneAggregate>(
      FAMILY,
      "contract-mismatch",
      "a coordination aggregate needs at least one contributing model",
    );
  }
  const seenModelIds = new Set<string>();
  for (const model of request.models) {
    if (seenModelIds.has(model.modelId)) {
      return laneRefused<CoordinatedSceneAggregate>(
        FAMILY,
        "contract-mismatch",
        `duplicate model id '${model.modelId}' in the aggregation request`,
      );
    }
    seenModelIds.add(model.modelId);
    const substratePattern = looksLikeSubstrateId(model.modelId);
    if (substratePattern !== null) {
      return laneRefused<CoordinatedSceneAggregate>(
        FAMILY,
        "contract-mismatch",
        `identity quarantine: model id '${model.modelId}' carries a substrate-shaped id (pattern ${substratePattern})`,
      );
    }
    for (const axis of model.placementMetres) {
      if (!Number.isFinite(axis)) {
        return laneRefused<CoordinatedSceneAggregate>(
          FAMILY,
          "contract-mismatch",
          `model '${model.modelId}' placement must be finite (metres)`,
        );
      }
    }
    const structural = validateScene(model.scene);
    if (structural.length > 0) {
      return laneRefused<CoordinatedSceneAggregate>(
        FAMILY,
        "contract-mismatch",
        `model '${model.modelId}' scene is structurally invalid: ${structural.join("; ")}`,
      );
    }
  }
  // Identity quarantine across models (law 2) + in-model parents (law 3).
  const globalById = new Map<string, { model: CoordinationModelSource }>();
  for (const model of request.models) {
    for (const node of model.scene.nodes) {
      const collision = globalById.get(node.elementId);
      if (collision !== undefined) {
        return laneRefused<CoordinatedSceneAggregate>(
          FAMILY,
          "contract-mismatch",
          `identity quarantine across models: element '${node.elementId}' is contributed by BOTH ` +
            `'${collision.model.modelId}' and '${model.modelId}' — one stable AISE id names one element in the coordinated world`,
        );
      }
      const substratePattern = looksLikeSubstrateId(node.elementId);
      if (substratePattern !== null) {
        return laneRefused<CoordinatedSceneAggregate>(
          FAMILY,
          "contract-mismatch",
          `identity quarantine: element id '${node.elementId}' of model '${model.modelId}' carries a substrate-shaped id (pattern ${substratePattern})`,
        );
      }
      globalById.set(node.elementId, { model });
    }
  }
  for (const model of request.models) {
    const ownIds = new Set(model.scene.nodes.map((node) => node.elementId));
    for (const node of model.scene.nodes) {
      if (node.parentId !== null && !ownIds.has(node.parentId)) {
        return laneRefused<CoordinatedSceneAggregate>(
          FAMILY,
          "operation-semantic-failure",
          `model '${model.modelId}': element '${node.elementId}' parents into '${node.parentId}', ` +
            `which is not an element of the SAME model — hierarchy never crosses models`,
        );
      }
    }
  }
  // Aggregate: place each model's nodes at its placement translation.
  const nodes: SceneNode[] = [];
  const elementModelTable: { elementId: string; modelId: string }[] = [];
  for (const model of request.models) {
    const [dx, dy, dz] = model.placementMetres;
    for (const node of model.scene.nodes) {
      const placed: SceneNode = {
        ...node,
        transform: translateTransform(node.transform, dx, dy, dz),
      };
      nodes.push(placed);
      elementModelTable.push({ elementId: node.elementId, modelId: model.modelId });
    }
  }
  const aggregateRevision = Math.max(
    ...request.models.map((model) => model.scene.revision),
  );
  const aggregate: CoordinatedSceneAggregate = {
    kind: COORDINATION_AGGREGATE_KIND,
    schemaVersion: COORDINATION_AGGREGATE_SCHEMA_VERSION,
    aggregateId: "",
    scene: {
      revision: aggregateRevision,
      nodes,
      layers: request.layers,
      siteFrame: request.siteFrame,
      ghostSummary: null,
    },
    modelIds: request.models.map((model) => model.modelId),
    elementModelTable,
  };
  const structural = validateScene(aggregate.scene);
  if (structural.length > 0) {
    return laneRefused<CoordinatedSceneAggregate>(
      FAMILY,
      "contract-mismatch",
      `the coordinated aggregate is structurally invalid: ${structural.join("; ")}`,
    );
  }
  const aggregateId = contentIdOf(aggregateRecordBody(aggregate), "aggregateId");
  return { ok: true, value: { ...aggregate, aggregateId } };
}

/** The canonical record body of an aggregate (the digest projection). */
function aggregateRecordBody(
  aggregate: CoordinatedSceneAggregate,
): Record<string, unknown> {
  return {
    kind: aggregate.kind,
    schemaVersion: aggregate.schemaVersion,
    scene: aggregate.scene,
    modelIds: aggregate.modelIds,
    elementModelTable: aggregate.elementModelTable,
  };
}

/** Translate a 4×4 transform by (dx, dy, dz) (row-major storage). */
function translateTransform(
  transform: SceneNode["transform"],
  dx: number,
  dy: number,
  dz: number,
): SceneNode["transform"] {
  const m = transform.matrix;
  return {
    matrix: [
      m[0] ?? 0, m[1] ?? 0, m[2] ?? 0, (m[3] ?? 0) + dx,
      m[4] ?? 0, m[5] ?? 0, m[6] ?? 0, (m[7] ?? 0) + dy,
      m[8] ?? 0, m[9] ?? 0, m[10] ?? 0, (m[11] ?? 0) + dz,
      m[12] ?? 0, m[13] ?? 0, m[14] ?? 0, m[15] ?? 1,
    ],
  };
}

/* ------------------------------------------------------------------ */
/* CLASH-DETECT — the typed clash pair vocabulary                       */
/* ------------------------------------------------------------------ */

/**
 * One declared clash pair: two elements of the coordinated world and
 * their DECLARED comparable geometry (the P0-B shape vocabulary). The
 * pair is DECLARED data — the app/world declares which elements to
 * test and their shape proxies; the lane never invents pairs.
 */
export interface ClashPair {
  readonly pairId: string;
  readonly elementA: string;
  readonly elementB: string;
  readonly shapeA: GeometryShapeDeclaration;
  readonly shapeB: GeometryShapeDeclaration;
}

/** The clash test request: the pairs + the DECLARED tolerance + units. */
export interface ClashTestRequest {
  readonly pairs: readonly ClashPair[];
  /** REQUIRED — positive finite (law 4: tolerances are declared). */
  readonly tolerance: GeometryToleranceDeclaration;
  /** REQUIRED — the units the separation values are expressed in. */
  readonly units: GeometryUnitDeclaration;
  /** The declared recording instant (never a clock read). */
  readonly declaredAt: string;
}

/**
 * One clash verdict: the classification, the signed separation VALUE
 * (metres — negative = penetration depth), the DECLARED tolerance
 * carried VERBATIM and the near-boundary flag (|separation| within the
 * tolerance band of the verdict flip). The consumer decides with the
 * tolerance; the lane never folds it into the value (law 5).
 */
export interface ClashPairVerdict {
  readonly pairId: string;
  readonly elementA: string;
  readonly elementB: string;
  readonly verdict: ClashVerdictKind;
  /** Signed separation in metres: > 0 apart, < 0 penetration depth. */
  readonly separationMetres: number;
  /** The declared tolerance, carried VERBATIM from the request. */
  readonly appliedTolerance: GeometryToleranceDeclaration;
  /** True when |separation| ≤ the declared linear tolerance. */
  readonly withinTolerance: boolean;
}

/** The clash report: every verdict + the declared inputs + the digest. */
export interface ClashReport {
  readonly kind: typeof CLASH_REPORT_KIND;
  readonly schemaVersion: typeof CLASH_REPORT_SCHEMA_VERSION;
  /** Content-derived report identity (deterministic). */
  readonly reportId: string;
  readonly verdicts: readonly ClashPairVerdict[];
  readonly appliedTolerance: GeometryToleranceDeclaration;
  readonly units: GeometryUnitDeclaration;
  /** Per-verdict counts (the machine-readable summary). */
  readonly verdictCounts: readonly {
    readonly verdict: ClashVerdictKind;
    readonly count: number;
  }[];
}

/** Capabilities of one clash-predicate implementation. */
export interface ClashEngineCapabilities {
  /** The shape kinds this implementation computes over. */
  readonly supportedShapeKinds: readonly string[];
  /** Max pairs per report, or null for unbounded. */
  readonly maxPairs: number | null;
  /** Named BLOCKED capabilities with the honest reason (law 8). */
  readonly blocked: readonly { readonly capability: string; readonly reason: string }[];
}

/**
 * The clash-predicate port. The real clash engine (exact geometry over
 * OCCT in the WORLD-P4 sidecar) is a future occupant; the two in-memory
 * substitution doubles prove the contract WITHOUT any clash engine.
 */
export interface ClashPredicateAdapter {
  readonly portId: typeof CLASH_PREDICATE_PORT_ID;
  readonly capabilities: ClashEngineCapabilities;
  detectClashes(
    request: ClashTestRequest,
    aggregate: CoordinatedSceneAggregate,
  ): LaneOutcome<ClashReport>;
}

/* ------------------------------------------------------------------ */
/* The clash request validation (the fail-closed gate, law 4/6)         */
/* ------------------------------------------------------------------ */

/**
 * Validate a clash test request against the pair/element/tolerance
 * laws: the tolerance is declared positive-finite; the pair elements
 * exist in the aggregate; the pair shapes are the DECLARED P0-B shapes
 * of the SUPPORTED clash kinds; the P0-B exact-geometry request
 * VALIDATION accepts the declared shape table (the vocabulary
 * delegation, fail-closed). PURE.
 */
export function validateClashTestRequest(
  request: ClashTestRequest,
  aggregate: CoordinatedSceneAggregate,
): LaneOutcome<null> {
  if (!isFinitePositive(request.tolerance?.linear)) {
    return laneRefused<null>(
      FAMILY,
      "operation-semantic-failure",
      "a clash test REQUIRES a declared positive-finite linear tolerance — tolerances are declared, never implicit",
    );
  }
  if (!isFinitePositive(request.tolerance?.angular)) {
    return laneRefused<null>(
      FAMILY,
      "operation-semantic-failure",
      "a clash test REQUIRES a declared positive-finite angular tolerance — tolerances are declared, never implicit",
    );
  }
  if (request.pairs.length === 0) {
    return laneRefused<null>(
      FAMILY,
      "contract-mismatch",
      "a clash test needs at least one declared pair",
    );
  }
  if (!isDeclaredInstant(request.declaredAt)) {
    return laneRefused<null>(
      FAMILY,
      "contract-mismatch",
      "declaredAt must be a declared ISO-8601 UTC instant",
    );
  }
  const knownElements = new Set(aggregate.scene.nodes.map((node) => node.elementId));
  const shapes: GeometryShapeDeclaration[] = [];
  for (let index = 0; index < request.pairs.length; index += 1) {
    const pair = request.pairs[index];
    if (pair === undefined) {
      continue;
    }
    if (!isRecord(pair) || !isNonEmpty(pair.pairId)) {
      return laneRefused<null>(
        FAMILY,
        "contract-mismatch",
        `pairs[${index}]: a clash pair needs a non-empty pairId`,
      );
    }
    for (const elementId of [pair.elementA, pair.elementB]) {
      if (!knownElements.has(elementId)) {
        return laneRefused<null>(
          FAMILY,
          "unsupported-data",
          `pair '${pair.pairId}' references element '${elementId}' which is not in the coordinated aggregate`,
        );
      }
    }
    if (pair.elementA === pair.elementB) {
      return laneRefused<null>(
        FAMILY,
        "operation-semantic-failure",
        `pair '${pair.pairId}' tests an element against itself`,
      );
    }
    for (const [side, shape] of [
      ["A", pair.shapeA],
      ["B", pair.shapeB],
    ] as const) {
      const kind = isRecord(shape) ? shape["kind"] : undefined;
      if (
        typeof kind !== "string" ||
        !(SUPPORTED_CLASH_SHAPE_KINDS as readonly string[]).includes(kind)
      ) {
        return laneRefused<null>(
          FAMILY,
          "unsupported-data",
          `pair '${pair.pairId}' shape ${side} has kind '${String(kind)}' — the P3 clash predicate ` +
            `supports ${SUPPORTED_CLASH_SHAPE_KINDS.join(" | ")} proxies only ` +
            `(the declared shape vocabulary is wider; the real clash-engine occupant opens it — BLOCKED, see CAPABILITY-BOUNDARIES)`,
        );
      }
      shapes.push(shape);
    }
  }
  // The P0-B vocabulary delegation: the declared shape table + tolerance
  // + units must satisfy the P0-B exact-geometry request VALIDATION
  // (shapes well-formed, tolerance declared, subject/evidence/instants
  // well-typed) — fail-closed BEFORE any computation.
  const geometryRequest: GeometryComputationRequest = {
    kind: GEOMETRY_REQUEST_KIND,
    schemaVersion: GEOMETRY_REQUEST_SCHEMA_VERSION,
    subjectRef: CLASH_SUBJECT_REF,
    shapes,
    operations: [],
    tolerance: request.tolerance,
    units: request.units,
    evidenceContentId: CLASH_EVIDENCE_CONTENT_ID,
    recordedAt: request.declaredAt,
  };
  const geometryValidation = validateGeometryComputationRequest(geometryRequest);
  if (!geometryValidation.ok) {
    const detail = geometryValidation.failures
      .map((failure) => `${failure.kind} @ ${failure.path}: ${failure.detail}`)
      .join("; ");
    return laneRefused<null>(
      FAMILY,
      "contract-mismatch",
      `the clash pair shapes failed the P0-B exact-geometry request validation: ${detail}`,
    );
  }
  return { ok: true, value: null };
}

/** The P0-B delegation fixture identity (declared, deterministic). */
export const CLASH_SUBJECT_REF =
  "5a5a5a5a5a5a5a5a5a5a5a5a5a5a5a5a5a5a5a5a5a5a5a5a5a5a5a5a5a5a5a5a" as const;
export const CLASH_EVIDENCE_CONTENT_ID =
  "3b3b3b3b3b3b3b3b3b3b3b3b3b3b3b3b3b3b3b3b3b3b3b3b3b3b3b3b3b3b3b3b" as const;

/* ------------------------------------------------------------------ */
/* The verdict classification (the closed table, law 5)                 */
/* ------------------------------------------------------------------ */

/**
 * Classify a signed separation against the DECLARED linear tolerance
 * (the closed verdict table — PURE, shared by every conforming
 * implementation so the verdict semantics are substitutable):
 *
 *   separation < -tolerance          → clash (deep penetration)
 *   |separation| ≤  tolerance        → within-tolerance (near boundary)
 *   separation >  tolerance          → clear
 *
 * The tolerance band is WIDE by design: within-tolerance is the honest
 * near-boundary answer (never a silent boolean); the consumer decides.
 */
export function classifySeparation(
  separationMetres: number,
  toleranceLinear: number,
): ClashVerdictKind {
  if (separationMetres < -toleranceLinear) {
    return "clash";
  }
  if (separationMetres <= toleranceLinear) {
    return "within-tolerance";
  }
  return "clear";
}

/**
 * The axis-aligned box separation (closed-form, deterministic): the
 * DECLARED proxy metric — the minimum POSITIVE axis gap when the boxes
 * are disjoint on at least one axis (a conservative lower bound of the
 * Euclidean distance); the minimum axis penetration depth (the
 * smallest translation that separates) when the boxes intersect.
 * Positive = apart by that many metres; negative = penetration depth.
 * PURE.
 */
export function boxSeparationMetres(
  a: Extract<GeometryShapeDeclaration, { kind: "box" }>,
  b: Extract<GeometryShapeDeclaration, { kind: "box" }>,
): number {
  const gapsPerAxis: number[] = [];
  for (const [aMin, aMax, bMin, bMax] of [
    [a.min.x, a.max.x, b.min.x, b.max.x],
    [a.min.y, a.max.y, b.min.y, b.max.y],
    [a.min.z, a.max.z, b.min.z, b.max.z],
  ] as const) {
    // Positive gap when disjoint on this axis; negative overlap otherwise.
    gapsPerAxis.push(Math.max(aMin, bMin) - Math.min(aMax, bMax));
  }
  const positiveGaps = gapsPerAxis.filter((gap) => gap > 0);
  if (positiveGaps.length > 0) {
    // Disjoint on at least one axis: the minimum positive axis gap.
    return Math.min(...positiveGaps);
  }
  // Intersecting on every axis: the minimum overlap depth (the
  // smallest axis translation that separates the boxes) — NEGATIVE
  // (the largest gap value is the least-negative overlap).
  return Math.max(...gapsPerAxis);
}

/* ------------------------------------------------------------------ */
/* Conflict records (the P2 problem-lane binding)                       */
/* ------------------------------------------------------------------ */

/**
 * One coordination conflict record: a non-clear clash verdict BOUND to
 * a declared engineering problem of the P2 problem lane. The binding
 * law: the problem must be declared in the request scope and its
 * spatial binding must cover one of the clashing elements — the P2
 * problem lane is where coordination conflicts live (P4 wires the live
 * problem creation).
 */
export interface CoordinationConflictRecord {
  readonly conflictId: string;
  readonly reportId: string;
  readonly pairId: string;
  readonly verdict: ClashVerdictKind;
  readonly separationMetres: number;
  readonly appliedTolerance: GeometryToleranceDeclaration;
  /** The P2 problem-lane binding (the problem this conflict belongs to). */
  readonly problemBinding: {
    readonly problemId: string;
    readonly problemStatus: EngineeringProblem["status"];
    readonly problemTitle: string;
  };
  readonly recordedAt: string;
}

/** The conflict-record request: the report + the declared problems. */
export interface ConflictRecordingRequest {
  readonly report: ClashReport;
  /** The P2 problem-lane problems declared in scope (composed types). */
  readonly problems: readonly EngineeringProblem[];
  readonly recordedAt: string;
}

/**
 * Record the conflict records of a clash report: every verdict that is
 * NOT clear binds to a declared problem whose spatial binding covers
 * one of the clashing elements (law: the P2 problem-lane binding,
 * fail-closed — unresolvable bindings refuse the whole recording). PURE.
 */
export function recordCoordinationConflicts(
  request: ConflictRecordingRequest,
): LaneOutcome<readonly CoordinationConflictRecord[]> {
  if (!isDeclaredInstant(request.recordedAt)) {
    return laneRefused<readonly CoordinationConflictRecord[]>(
      FAMILY,
      "contract-mismatch",
      "recordedAt must be a declared ISO-8601 UTC instant",
    );
  }
  const records: CoordinationConflictRecord[] = [];
  for (const verdict of request.report.verdicts) {
    if (verdict.verdict === "clear") {
      continue;
    }
    // Resolve the problem whose spatial binding covers the clashing pair.
    const covering = request.problems.find(
      (problem) =>
        problem.spatialBinding.elementIds.includes(verdict.elementA) ||
        problem.spatialBinding.elementIds.includes(verdict.elementB),
    );
    if (covering === undefined) {
      return laneRefused<readonly CoordinationConflictRecord[]>(
        FAMILY,
        "unsupported-data",
        `clash pair '${verdict.pairId}' (verdict ${verdict.verdict}) has no declared problem whose ` +
          `spatial binding covers '${verdict.elementA}' or '${verdict.elementB}' — a non-clear verdict ` +
          `REQUIRES a P2 problem-lane binding (fail closed, never an orphan conflict)`,
      );
    }
    const record: CoordinationConflictRecord = {
      conflictId: "",
      reportId: request.report.reportId,
      pairId: verdict.pairId,
      verdict: verdict.verdict,
      separationMetres: verdict.separationMetres,
      appliedTolerance: verdict.appliedTolerance,
      problemBinding: {
        problemId: covering.problemId,
        problemStatus: covering.status,
        problemTitle: covering.title,
      },
      recordedAt: request.recordedAt,
    };
    records.push({
      ...record,
      conflictId: contentIdOf(
        conflictRecordBody(record),
        "conflictId",
      ),
    });
  }
  return { ok: true, value: records };
}

/** The canonical record body of a conflict record (digest projection). */
function conflictRecordBody(
  record: CoordinationConflictRecord,
): Record<string, unknown> {
  return {
    reportId: record.reportId,
    pairId: record.pairId,
    verdict: record.verdict,
    separationMetres: record.separationMetres,
    appliedTolerance: record.appliedTolerance,
    problemBinding: record.problemBinding,
    recordedAt: record.recordedAt,
  };
}

/* ------------------------------------------------------------------ */
/* Small local helpers                                                 */
/* ------------------------------------------------------------------ */

function isNonEmpty(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}
