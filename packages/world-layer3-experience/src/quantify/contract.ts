/**
 * WORLD-P3 — the QUANTIFY family (`src/quantify/`): stages 4–5 of the
 * lane (QUANTIFY + WHAT-IF).
 *
 *   QUANTIFY  — live quantity consequences as typed queries over the
 *               BOQ Graph seams. THE BOQ-AUTHORITY LAW (seam law #5):
 *               the BOQ Graph stays the ONLY quantity authority; this
 *               lane VIEWS it and PROJECTS live consequences from
 *               ENGINE-derived quantities carried verbatim — it never
 *               recomputes a quantity, never invents a unit, never
 *               restates a calculation method (the engine's versioned
 *               calculationRef is CITED, verbatim). A projection is
 *               typed PROPOSED and is structurally NOT a generated BOQ
 *               (the `isSolutionGeneratedBoq` seal discrimination is
 *               asserted by the tests).
 *   WHAT-IF   — what-if alternatives as typed variant sets through the
 *               P0-A USD composition port: variants as AISE
 *               scene-composition types (`UsdVariantSet`), the AISE
 *               side selecting variants EXPLICITLY (never the
 *               substrate), composed through the P0-C what-if ghost
 *               discipline, and COMPARED against the P1 deviation
 *               vocabulary (`DIFFERENCE_CLASSIFICATIONS` — the Layer-1
 *               lane's closed "what changed?" set) with the DECLARED
 *               tolerance carried verbatim.
 *
 * THE BOQ-GRAPH VIEW SEAM: the lane's read of the BOQ Graph sits behind
 * the `BoqGraphViewAdapter` port — the BOQ STORE is a replaceable
 * substrate (P4 wires the real store/transport; the two in-memory
 * doubles serve the fixture BOQ derived through the REAL
 * `deriveSolutionBoq` seam at corpus-build time). The BOQ Graph itself
 * is not a substrate — it is the authority the port serves read-only.
 *
 * LAWS (on top of the seam's ten; enforced here and drilled by
 * `quantify.test.ts`):
 *
 *  1. THE VIEW NEVER RECOMPUTES: every value a `BoqViewResult` carries
 *     is byte-identical to the BOQ Graph's own line/totals records —
 *     the tests assert byte-equality against the source lines.
 *  2. THE PROJECTION IS NOT A BOQ: `QuantityConsequenceProjection` is
 *     typed `epistemicClass: "PROPOSED"` + `projectionKind:
 *     "boq-projection"` and has NO `artifactKind:
 *     "solution-generated-boq"` seal — a projection never enters the
 *     world as a generated BOQ (the BOQ Graph stays the only
 *     authority).
 *  3. ENGINE QUANTITIES CARRIED VERBATIM: every projected quantity
 *     value comes from a recorded operation's ENGINE-derived
 *     quantity-impact effect (value + unit + calculationRef cited
 *     verbatim); summing happens ONLY within one (dimension, unit)
 *     group — a mixed-unit group is a typed refusal (the consumer
 *     re-splits; the lane never converts or invents).
 *  4. WHAT-IF GHOST DISCIPLINE (the P0-C law 3, delegated to): every
 *     element a selected variant's overrides target must be a ghost in
 *     the base scene — what-if never presents as captured reality; the
 *     composition runs through the P0-C `presentWhatIfVariants` usage
 *     request (USD port + identity law + payload discipline enforced
 *     there, end-to-end).
 *  5. THE DEVIATION COMPARISON IS TOLERANCE-DECLARED: alternative-vs-
 *     baseline deviations answer from the P1 closed classification
 *     vocabulary with the declared tolerance carried VERBATIM and the
 *     deviation VALUE separate from the verdict — the consumer decides
 *     (the P1 compare discipline, composed).
 *  6. DECLARED QUANTITY DELTAS: what-if alternatives carry their
 *     quantity deltas as DECLARED typed quantities (from the
 *     operations' engine effects, never invented by the lane).
 *  7. DETERMINISM: content-addressed view/projection/comparison ids;
 *     identical inputs produce byte-identical outputs.
 */

import type { SolutionBoq } from "@aise/solution-boq";
import {
  navigateLineToOperations,
  navigateOperationToLines,
  sectionOfOperationType,
  sectionTitle,
  buildingElementOfOperationType,
  boqItemDescription,
  type SolutionBoqLine,
} from "@aise/solution-boq";
import type { EngineeringOperation, TypedQuantity } from "@aise/solution-contract";
import type { ComparableShape } from "@aise/world-layer1-experience";
import type {
  GeometryToleranceDeclaration,
  GeometryUnitDeclaration,
} from "@aise/world-understanding-substrate";
import type {
  SceneElementId,
  UsdPayloadRegion,
  UsdVariantSet,
  ComposedScene,
} from "@aise/world-reality-substrate";
import type { WhatIfVariantRequest, WhatIfVariantPresentation } from "@aise/world-solution-substrate";
import { classifyWorldDiffs, type WorldDiffPair } from "../compare-bridge";
import type { SolutionSceneUsageAdapter } from "@aise/world-solution-substrate";
import {
  contentIdOf,
  isDeclaredInstant,
  isFinitePositive,
  isNonEmptyString,
  isRecord,
  laneRefused,
  looksLikeSubstrateId,
  type Layer3Family,
  type LaneOutcome,
} from "../seam";

const FAMILY: Layer3Family = "quantify";

/* ------------------------------------------------------------------ */
/* Sealed kinds + closed vocabularies                                   */
/* ------------------------------------------------------------------ */

export const BOQ_VIEW_PORT_ID = "quantify.boq-graph-view/1" as const;
export const QUANTITY_PROJECTION_KIND = "quantity-consequence-projection" as const;
export const QUANTITY_PROJECTION_SCHEMA_VERSION = "quantity-consequence-projection/1" as const;
export const WHAT_IF_COMPARISON_KIND = "what-if-comparison" as const;
export const WHAT_IF_COMPARISON_SCHEMA_VERSION = "what-if-comparison/1" as const;

/** The closed BOQ view-query vocabulary. */
export const BOQ_VIEW_QUERY_KINDS = [
  "section-totals",
  "line",
  "operation-contributions",
  "assumptions",
] as const;
export type BoqViewQueryKind = (typeof BOQ_VIEW_QUERY_KINDS)[number];

/* ------------------------------------------------------------------ */
/* The BOQ-Graph view seam (the replaceable store substrate)            */
/* ------------------------------------------------------------------ */

/** The read-only BOQ version resolution request. */
export interface BoqVersionRequest {
  readonly solutionId: string;
  readonly versionNumber: number;
}

/** Capabilities of one BOQ-store view implementation. */
export interface BoqGraphViewCapabilities {
  /** Max BOQ versions served concurrently, or null. */
  readonly maxServedVersions: number | null;
  readonly blocked: readonly { readonly capability: string; readonly reason: string }[];
}

/**
 * The BOQ-Graph view port: a READ-ONLY resolution of one solution
 * version's derived BOQ. The store behind it (a real backend store in
 * P4, an in-memory double here) is a replaceable substrate — the BOQ
 * Graph itself stays the ONLY quantity authority; this port only
 * SERVES it. A version with no derived BOQ answers null (honest
 * absence, never a fabricated projection).
 */
export interface BoqGraphViewAdapter {
  readonly portId: typeof BOQ_VIEW_PORT_ID;
  readonly capabilities: BoqGraphViewCapabilities;
  resolveBoqVersion(request: BoqVersionRequest): LaneOutcome<SolutionBoq | null>;
}

/* ------------------------------------------------------------------ */
/* VIEW — the typed read-only queries over the served BOQ Graph         */
/* ------------------------------------------------------------------ */

/** One typed BOQ view query (the closed vocabulary). */
export type BoqViewQuery =
  | { readonly query: "section-totals" }
  | { readonly query: "line"; readonly lineId: string }
  | { readonly query: "operation-contributions"; readonly operationId: string }
  | { readonly query: "assumptions" };

/** The view request: the query + the resolved BOQ (read-only input). */
export interface BoqViewRequest {
  readonly boq: SolutionBoq;
  readonly query: BoqViewQuery;
}

/** The typed view result (every value carried verbatim — law 1). */
export interface BoqViewResult {
  readonly viewKind: "boq-graph-view";
  /** Content-derived view identity (deterministic). */
  readonly viewId: string;
  readonly boqId: string;
  readonly solutionId: string;
  readonly versionNumber: number;
  /** section-totals: the per-section line counts + net totals echo. */
  readonly sectionTotals: readonly {
    readonly sectionId: string;
    readonly title: string;
    readonly lineCount: number;
  }[];
  /** line: the requested line, carried VERBATIM (or null). */
  readonly line: SolutionBoqLine | null;
  /** line: the line's contributing operation ids (the BOQ's own trace). */
  readonly lineOperationIds: readonly string[];
  /** operation-contributions: the lines the operation contributes to. */
  readonly operationLineIds: readonly string[];
  /** assumptions: the BOQ's assumption statements, carried verbatim. */
  readonly assumptionStatements: readonly {
    readonly assumptionId: string;
    readonly statement: string;
    readonly affectedOperationIds: readonly string[];
  }[];
  /** The net totals echo (carried VERBATIM from the BOQ Graph). */
  readonly totals: readonly SolutionBoq["totals"][number][];
}

/**
 * Run one typed read-only query over the served BOQ Graph (law 1: the
 * view NEVER recomputes — every value is the BOQ's own record carried
 * verbatim; navigation uses the BOQ package's own resolvers). PURE.
 */
export function viewBoqGraph(request: BoqViewRequest): LaneOutcome<BoqViewResult> {
  const boq = request.boq;
  if (boq.artifactKind !== "solution-generated-boq") {
    return laneRefused<BoqViewResult>(
      FAMILY,
      "contract-mismatch",
      `the view input must be a solution-generated BOQ (artifactKind '${String(boq.artifactKind)}' refused) — the BOQ Graph is the only authority`,
    );
  }
  const query = request.query;
  if (
    !isRecord(query) ||
    !(BOQ_VIEW_QUERY_KINDS as readonly string[]).includes(
      (query as Record<string, unknown>)["query"] as string,
    )
  ) {
    return laneRefused<BoqViewResult>(
      FAMILY,
      "contract-mismatch",
      `the view query must be one of ${BOQ_VIEW_QUERY_KINDS.join(" | ")}`,
    );
  }
  const sectionTotals: { sectionId: string; title: string; lineCount: number }[] = [];
  let line: SolutionBoqLine | null = null;
  const lineOperationIds: string[] = [];
  const operationLineIds: string[] = [];
  const assumptionStatements: {
    assumptionId: string;
    statement: string;
    affectedOperationIds: string[];
  }[] = [];
  switch ((query as { readonly query: BoqViewQueryKind }).query) {
    case "section-totals": {
      for (const section of boq.sections) {
        sectionTotals.push({
          sectionId: section.sectionId,
          title: section.title,
          lineCount: section.lineIds.length,
        });
      }
      break;
    }
    case "line": {
      const lineId = (query as { readonly lineId: string }).lineId;
      if (!isNonEmptyString(lineId)) {
        return laneRefused<BoqViewResult>(
          FAMILY,
          "contract-mismatch",
          "the 'line' view query requires a non-empty lineId",
        );
      }
      const found = boq.lines.find((candidate) => candidate.boqLineId === lineId);
      if (found === undefined) {
        return laneRefused<BoqViewResult>(
          FAMILY,
          "unsupported-data",
          `line '${lineId}' is not a line of BOQ '${boq.boqId}'`,
        );
      }
      line = found;
      const navigation = navigateLineToOperations(boq, lineId);
      if (navigation !== undefined) {
        lineOperationIds.push(
          ...navigation.contributions.map((contribution) => contribution.operationId),
        );
      }
      break;
    }
    case "operation-contributions": {
      const operationId = (query as { readonly operationId: string }).operationId;
      if (!isNonEmptyString(operationId)) {
        return laneRefused<BoqViewResult>(
          FAMILY,
          "contract-mismatch",
          "the 'operation-contributions' view query requires a non-empty operationId",
        );
      }
      const navigation = navigateOperationToLines(boq, operationId);
      if (navigation !== undefined) {
        operationLineIds.push(...navigation.map((entry) => entry.line.boqLineId));
      }
      break;
    }
    case "assumptions": {
      for (const assumption of boq.assumptions) {
        assumptionStatements.push({
          assumptionId: assumption.assumptionId,
          statement: assumption.statement,
          affectedOperationIds: [...assumption.affectedOperationIds],
        });
      }
      break;
    }
  }
  const result: BoqViewResult = {
    viewKind: "boq-graph-view",
    viewId: "",
    boqId: boq.boqId,
    solutionId: boq.solutionId,
    versionNumber: boq.versionNumber,
    sectionTotals,
    line,
    lineOperationIds,
    operationLineIds,
    assumptionStatements,
    totals: boq.totals,
  };
  const viewId = contentIdOf(viewResultBody(result), "viewId");
  return { ok: true, value: { ...result, viewId } };
}

/** The canonical view-result body (the digest projection). */
function viewResultBody(result: BoqViewResult): Record<string, unknown> {
  return {
    viewKind: result.viewKind,
    boqId: result.boqId,
    solutionId: result.solutionId,
    versionNumber: result.versionNumber,
    sectionTotals: result.sectionTotals,
    line: result.line,
    lineOperationIds: result.lineOperationIds,
    operationLineIds: result.operationLineIds,
    assumptionStatements: result.assumptionStatements,
    totals: result.totals,
  };
}

/* ------------------------------------------------------------------ */
/* PROJECT — live quantity consequences (the PROPOSED projection)       */
/* ------------------------------------------------------------------ */

/** One projected BOQ line-shaped consequence (NOT a generated BOQ line). */
export interface ProjectedConsequenceLine {
  readonly sectionId: string;
  readonly sectionTitle: string;
  readonly buildingElement: string;
  readonly activity: string;
  readonly itemDescription: string;
  readonly direction: "added" | "removed" | "changed";
  readonly dimension: TypedQuantity["dimension"];
  /** The sum of the contributing ENGINE quantities (verbatim values). */
  readonly value: number;
  /** The engine quantity unit, carried VERBATIM. */
  readonly unit: string;
  /** The engine's versioned calculation reference, CITED verbatim. */
  readonly calculationRef: string;
  readonly contributingOperationIds: readonly string[];
}

/** The live quantity-consequence projection request. */
export interface QuantityConsequenceProjectionRequest {
  readonly solutionId: string;
  readonly versionNumber: number;
  /**
   * The NEW authored operations whose live consequences are projected —
   * RECORDED canonical operations (engine-derived quantity effects
   * carried inside); the projection reads them, never recomputes.
   */
  readonly proposedOperations: readonly EngineeringOperation[];
  /**
   * The current derived BOQ (the authority the projection is compared
   * against), or null when none is derived yet (the projection still
   * stands alone, honestly typed PROPOSED).
   */
  readonly baselineBoq: SolutionBoq | null;
}

/** The projection (law 2: PROPOSED, never a generated BOQ). */
export interface QuantityConsequenceProjection {
  readonly kind: typeof QUANTITY_PROJECTION_KIND;
  readonly schemaVersion: typeof QUANTITY_PROJECTION_SCHEMA_VERSION;
  /** Content-derived projection identity (deterministic). */
  readonly projectionId: string;
  readonly solutionId: string;
  readonly versionNumber: number;
  /** ALWAYS "PROPOSED" — the epistemic law, structural. */
  readonly epistemicClass: "PROPOSED";
  /** The baseline BOQ identity the projection is compared against. */
  readonly baselineBoqId: string | null;
  readonly lines: readonly ProjectedConsequenceLine[];
  /** The operation ids with NO engine quantity effects (honest census). */
  readonly operationsWithoutQuantityEffects: readonly string[];
}

/**
 * Project the live quantity consequences of NEW authored operations:
 * group their ENGINE-derived quantity-impact effects into BOQ-line-
 * shaped projections through the solution-boq's OWN pure grouping
 * helpers (section/element/description — labels over the operation
 * types, never quantity math), carrying values/units/calculationRefs
 * VERBATIM (law 3). PURE.
 */
export function projectLiveQuantityConsequences(
  request: QuantityConsequenceProjectionRequest,
): LaneOutcome<QuantityConsequenceProjection> {
  if (request.proposedOperations.length === 0) {
    return laneRefused<QuantityConsequenceProjection>(
      FAMILY,
      "contract-mismatch",
      "a quantity-consequence projection needs at least one proposed operation",
    );
  }
  if (
    request.baselineBoq !== null &&
    (request.baselineBoq.solutionId !== request.solutionId ||
      request.baselineBoq.versionNumber !== request.versionNumber)
  ) {
    return laneRefused<QuantityConsequenceProjection>(
      FAMILY,
      "operation-semantic-failure",
      `the baseline BOQ '${request.baselineBoq.boqId}' belongs to ${request.baselineBoq.solutionId} ` +
        `v${request.baselineBoq.versionNumber}, not ${request.solutionId} v${request.versionNumber}`,
    );
  }
  const withoutEffects: string[] = [];
  type Group = {
    sectionId: string;
    direction: ProjectedConsequenceLine["direction"];
    dimension: TypedQuantity["dimension"];
    unit: string;
    calculationRef: string;
    operations: string[];
    value: number;
  };
  const groups = new Map<string, Group>();
  for (const operation of request.proposedOperations) {
    if (
      operation.solutionId !== request.solutionId ||
      operation.versionNumber !== request.versionNumber
    ) {
      return laneRefused<QuantityConsequenceProjection>(
        FAMILY,
        "operation-semantic-failure",
        `operation '${operation.operationId}' belongs to ${operation.solutionId} v${operation.versionNumber}, ` +
          `not ${request.solutionId} v${request.versionNumber}`,
      );
    }
    const quantityEffects = operation.effects.filter(
      (effect) => effect.effectKind === "quantity-impact" && effect.quantity !== undefined,
    );
    if (quantityEffects.length === 0) {
      withoutEffects.push(operation.operationId);
      continue;
    }
    for (const effect of quantityEffects) {
      const quantity = effect.quantity;
      if (quantity === undefined) {
        continue;
      }
      const direction = effect.direction;
      if (direction === undefined) {
        return laneRefused<QuantityConsequenceProjection>(
          FAMILY,
          "contract-mismatch",
          `operation '${operation.operationId}' carries a quantity-impact effect without a direction`,
        );
      }
      const sectionId = sectionOfOperationType(operation.operationType);
      // Law 3: group ONLY within (section, direction, dimension, unit,
      // calculationRef) — a mixed-unit group never sums (refused below).
      const key = [
        sectionId,
        direction,
        quantity.dimension,
        quantity.unit,
        quantity.calculationRef,
      ].join("::");
      const group = groups.get(key);
      if (group === undefined) {
        groups.set(key, {
          sectionId,
          direction,
          dimension: quantity.dimension,
          unit: quantity.unit,
          calculationRef: quantity.calculationRef,
          operations: [operation.operationId],
          value: quantity.value,
        });
      } else {
        group.operations.push(operation.operationId);
        group.value += quantity.value;
      }
    }
  }
  const lines: ProjectedConsequenceLine[] = [];
  for (const group of [...groups.values()].sort((a, b) =>
    a.sectionId === b.sectionId
      ? a.dimension.localeCompare(b.dimension)
      : a.sectionId.localeCompare(b.sectionId),
  )) {
    if (!Number.isFinite(group.value)) {
      return laneRefused<QuantityConsequenceProjection>(
        FAMILY,
        "contract-mismatch",
        `the '${group.sectionId}' ${group.direction} ${group.dimension} [${group.unit}] group sums to a non-finite value`,
      );
    }
    const representative = request.proposedOperations.find((operation) =>
      group.operations.includes(operation.operationId),
    );
    const operationType = representative?.operationType ?? "";
    const buildingElement = buildingElementOfOperationType(operationType);
    lines.push({
      sectionId: group.sectionId,
      sectionTitle: sectionTitle(group.sectionId),
      buildingElement,
      activity: operationType,
      itemDescription: boqItemDescription({
        activity: operationType,
        material: representative?.parameters.find(
          (parameter) => parameter.name === "material",
        )?.value as string | undefined,
        dimension: group.dimension,
        unit: group.unit,
      }),
      direction: group.direction,
      dimension: group.dimension,
      value: group.value,
      unit: group.unit,
      calculationRef: group.calculationRef,
      contributingOperationIds: [...group.operations],
    });
  }
  const projection: QuantityConsequenceProjection = {
    kind: QUANTITY_PROJECTION_KIND,
    schemaVersion: QUANTITY_PROJECTION_SCHEMA_VERSION,
    projectionId: "",
    solutionId: request.solutionId,
    versionNumber: request.versionNumber,
    epistemicClass: "PROPOSED",
    baselineBoqId: request.baselineBoq?.boqId ?? null,
    lines,
    operationsWithoutQuantityEffects: withoutEffects,
  };
  const projectionId = contentIdOf(
    projectionBody(projection),
    "projectionId",
  );
  return { ok: true, value: { ...projection, projectionId } };
}

/** The canonical projection body (the digest projection). */
function projectionBody(
  projection: QuantityConsequenceProjection,
): Record<string, unknown> {
  return {
    kind: projection.kind,
    schemaVersion: projection.schemaVersion,
    solutionId: projection.solutionId,
    versionNumber: projection.versionNumber,
    epistemicClass: projection.epistemicClass,
    baselineBoqId: projection.baselineBoqId,
    lines: projection.lines,
    operationsWithoutQuantityEffects: projection.operationsWithoutQuantityEffects,
  };
}

/* ------------------------------------------------------------------ */
/* WHAT-IF — alternatives as variant sets + deviation comparison        */
/* ------------------------------------------------------------------ */

/**
 * One declared what-if alternative: a named variant selection (AISE
 * scene-composition types), its DECLARED quantity deltas (from the
 * operations' engine effects — law 6) and its declared comparable
 * geometry for the deviation comparison (the P1 vocabulary).
 */
export interface WhatIfAlternative {
  readonly alternativeId: string;
  readonly label: string;
  /** The EXPLICIT variant selections (the AISE side chooses). */
  readonly variantSelections: readonly {
    readonly variantSetId: string;
    readonly variantId: string;
  }[];
  /** DECLARED typed quantity deltas (never invented by the lane). */
  readonly declaredQuantityDeltas: readonly {
    readonly dimension: TypedQuantity["dimension"];
    readonly unit: string;
    readonly deltaValue: number;
    readonly direction: "added" | "removed" | "changed";
  }[];
  /** The alternative's declared comparable shapes (per element). */
  readonly elementShapes: readonly {
    readonly elementId: SceneElementId;
    readonly shape: ComparableShape;
  }[];
}

/** The what-if comparison request (law 4 + law 5). */
export interface WhatIfComparisonRequest {
  readonly solutionId: string;
  readonly versionNumber: number;
  /** The base scene; variant-affected elements must be ghosts (law 4). */
  readonly baseScene: ComposedScene;
  /** Variant sets as AISE scene-composition types (P0-A). */
  readonly variantSets: readonly UsdVariantSet[];
  /** Declared lazy payload regions (P0-A). */
  readonly payloads: readonly UsdPayloadRegion[];
  /** USD path bindings (P0-A identity law). */
  readonly pathBindings: readonly {
    readonly usdPath: string;
    readonly elementId: string;
  }[];
  /** The alternatives (declared, with their variant selections). */
  readonly alternatives: readonly WhatIfAlternative[];
  /** The BASELINE's declared comparable shapes (per element). */
  readonly baselineElementShapes: readonly {
    readonly elementId: SceneElementId;
    readonly shape: ComparableShape;
  }[];
  /** REQUIRED — the deviation comparison tolerance (law 5). */
  readonly tolerance: GeometryToleranceDeclaration;
  /** REQUIRED — the declared near-boundary band (metres). */
  readonly nearBoundaryBand: number;
  /** REQUIRED — the units the deviation values are expressed in. */
  readonly units: GeometryUnitDeclaration;
  /** The declared comparison instant (never a clock read). */
  readonly declaredAt: string;
  readonly comparisonLabel: string | null;
}

/** One per-element deviation verdict (the P1 vocabulary, composed). */
export interface WhatIfDeviationVerdict {
  readonly alternativeId: string;
  readonly baselineElementId: SceneElementId;
  readonly alternativeElementId: SceneElementId;
  /** From the P1 closed classification vocabulary. */
  readonly classification: "missing-in-capture" | "missing-in-model" | "deviation-detected" | "within-tolerance" | "unverifiable";
  /** The computed deviation (metres, shape-proxy distance). */
  readonly deviationMetres: number;
  readonly appliedTolerance: GeometryToleranceDeclaration;
  readonly nearBoundary: boolean;
}

/** The what-if comparison result (per alternative). */
export interface WhatIfComparison {
  readonly kind: typeof WHAT_IF_COMPARISON_KIND;
  readonly schemaVersion: typeof WHAT_IF_COMPARISON_SCHEMA_VERSION;
  /** Content-derived comparison identity (deterministic). */
  readonly comparisonId: string;
  readonly solutionId: string;
  readonly versionNumber: number;
  readonly comparisonLabel: string | null;
  readonly alternatives: readonly {
    readonly alternativeId: string;
    readonly label: string;
    /** The P0-C composed what-if presentation (ghost discipline). */
    readonly presentation: WhatIfVariantPresentation;
    /** The deviation verdicts against the baseline (P1 vocabulary). */
    readonly deviationVerdicts: readonly WhatIfDeviationVerdict[];
    /** The alternative's declared quantity deltas, carried verbatim. */
    readonly declaredQuantityDeltas: readonly WhatIfAlternative["declaredQuantityDeltas"][number][];
  }[];
}

/**
 * Compare what-if alternatives against the baseline: compose each
 * alternative through the P0-C what-if usage port (the ghost discipline
 * + USD composition enforced there end-to-end — law 4), then classify
 * every aligned element pair through the P1 deviation vocabulary with
 * the DECLARED tolerance (law 5) — the P1 lane's own compare transform
 * composed through `../compare-bridge`, never re-implemented. The
 * usage adapter is the P0-C port occupant (deterministic doubles in
 * tests; a real substrate host in P4). PURE given the adapter.
 */
export function compareWhatIfAlternatives(
  request: WhatIfComparisonRequest,
  usageAdapter: SolutionSceneUsageAdapter,
): LaneOutcome<WhatIfComparison> {
  if (!isFinitePositive(request.tolerance?.linear)) {
    return laneRefused<WhatIfComparison>(
      FAMILY,
      "operation-semantic-failure",
      "a what-if comparison REQUIRES a declared positive-finite linear tolerance — tolerances are declared, never implicit",
    );
  }
  if (!isFinitePositive(request.nearBoundaryBand)) {
    return laneRefused<WhatIfComparison>(
      FAMILY,
      "operation-semantic-failure",
      "a what-if comparison REQUIRES a declared positive-finite near-boundary band",
    );
  }
  if (request.alternatives.length === 0) {
    return laneRefused<WhatIfComparison>(
      FAMILY,
      "contract-mismatch",
      "a what-if comparison needs at least one alternative",
    );
  }
  if (!isDeclaredInstant(request.declaredAt)) {
    return laneRefused<WhatIfComparison>(
      FAMILY,
      "contract-mismatch",
      "declaredAt must be a declared ISO-8601 UTC instant",
    );
  }
  const alternatives: WhatIfComparison["alternatives"][number][] = [];
  for (const alternative of request.alternatives) {
    if (!isNonEmptyString(alternative.alternativeId)) {
      return laneRefused<WhatIfComparison>(
        FAMILY,
        "contract-mismatch",
        "an alternative requires a non-empty alternativeId",
      );
    }
    const substratePattern = looksLikeSubstrateId(alternative.alternativeId);
    if (substratePattern !== null) {
      return laneRefused<WhatIfComparison>(
        FAMILY,
        "contract-mismatch",
        `identity quarantine: alternativeId carries a substrate-shaped id (pattern ${substratePattern})`,
      );
    }
    // Law 4: compose through the P0-C what-if usage port.
    const usageRequest: WhatIfVariantRequest = {
      kind: "what-if-variant-request",
      schemaVersion: "what-if-variant-request/1",
      solutionId: request.solutionId,
      versionNumber: request.versionNumber,
      baseScene: request.baseScene,
      variantSets: [...request.variantSets],
      payloads: [...request.payloads],
      selectedVariants: [...alternative.variantSelections],
      loadedPayloadRegions: [],
      pathBindings: [...request.pathBindings],
      comparisonLabel: alternative.label,
    };
    const presentation = usageAdapter.presentWhatIfVariants(usageRequest);
    if (!presentation.ok) {
      return laneRefused<WhatIfComparison>(
        FAMILY,
        "operation-semantic-failure",
        `the what-if composition refused alternative '${alternative.alternativeId}': ` +
          `${presentation.failure.kind} — ${presentation.failure.detail}`,
      );
    }
    // Law 5: the deviation comparison against the baseline, through the
    // P1 lane's own compare transform (composed, never re-implemented).
    const deviations: WhatIfDeviationVerdict[] = [];
    const baselineShapes = new Map(
      request.baselineElementShapes.map((entry) => [entry.elementId, entry.shape] as const),
    );
    const alternativeShapes = new Map(
      alternative.elementShapes.map((entry) => [entry.elementId, entry.shape] as const),
    );
    const allElementIds = new Set([
      ...baselineShapes.keys(),
      ...alternativeShapes.keys(),
    ]);
    const diffPairs: WorldDiffPair[] = [];
    const unpairedBaseline: string[] = [];
    const unpairedAlternative: string[] = [];
    for (const elementId of allElementIds) {
      const baselineShape = baselineShapes.get(elementId);
      const alternativeShape = alternativeShapes.get(elementId);
      if (baselineShape === undefined) {
        unpairedAlternative.push(elementId);
        continue;
      }
      if (alternativeShape === undefined) {
        unpairedBaseline.push(elementId);
        continue;
      }
      diffPairs.push({
        baselineElementId: elementId,
        alternativeElementId: elementId,
        baselineShape,
        alternativeShape,
      });
    }
    if (diffPairs.length > 0) {
      const classified = classifyWorldDiffs({
        worldRevision: request.baseScene.revision,
        pairs: diffPairs,
        tolerance: request.tolerance,
        nearBoundaryBand: request.nearBoundaryBand,
        units: request.units,
        declaredAt: request.declaredAt,
      });
      if (!classified.ok) {
        return classified;
      }
      for (const classification of classified.value) {
        deviations.push({
          alternativeId: alternative.alternativeId,
          baselineElementId: classification.baselineElementId,
          alternativeElementId: classification.alternativeElementId,
          classification: classification.classification,
          deviationMetres: classification.deviationMetres,
          appliedTolerance: request.tolerance,
          nearBoundary: classification.nearBoundary,
        });
      }
    }
    for (const elementId of unpairedBaseline) {
      deviations.push({
        alternativeId: alternative.alternativeId,
        baselineElementId: elementId,
        alternativeElementId: elementId,
        classification: "missing-in-capture",
        deviationMetres: 0,
        appliedTolerance: request.tolerance,
        nearBoundary: false,
      });
    }
    for (const elementId of unpairedAlternative) {
      deviations.push({
        alternativeId: alternative.alternativeId,
        baselineElementId: elementId,
        alternativeElementId: elementId,
        classification: "missing-in-model",
        deviationMetres: 0,
        appliedTolerance: request.tolerance,
        nearBoundary: false,
      });
    }
    deviations.sort((a, b) =>
      a.baselineElementId === b.baselineElementId
        ? a.alternativeId.localeCompare(b.alternativeId)
        : a.baselineElementId.localeCompare(b.baselineElementId),
    );
    alternatives.push({
      alternativeId: alternative.alternativeId,
      label: alternative.label,
      presentation: presentation.value,
      deviationVerdicts: deviations,
      declaredQuantityDeltas: [...alternative.declaredQuantityDeltas],
    });
  }
  const comparison: WhatIfComparison = {
    kind: WHAT_IF_COMPARISON_KIND,
    schemaVersion: WHAT_IF_COMPARISON_SCHEMA_VERSION,
    comparisonId: "",
    solutionId: request.solutionId,
    versionNumber: request.versionNumber,
    comparisonLabel: request.comparisonLabel,
    alternatives,
  };
  const comparisonId = contentIdOf(
    comparisonBody(comparison),
    "comparisonId",
  );
  return { ok: true, value: { ...comparison, comparisonId } };
}

/** The canonical comparison body (the digest projection). */
function comparisonBody(
  comparison: WhatIfComparison,
): Record<string, unknown> {
  return {
    kind: comparison.kind,
    schemaVersion: comparison.schemaVersion,
    solutionId: comparison.solutionId,
    versionNumber: comparison.versionNumber,
    comparisonLabel: comparison.comparisonLabel,
    alternatives: comparison.alternatives.map((alternative) => ({
      alternativeId: alternative.alternativeId,
      label: alternative.label,
      presentationToken: alternative.presentation.presentationToken,
      deviationVerdicts: alternative.deviationVerdicts,
      declaredQuantityDeltas: alternative.declaredQuantityDeltas,
    })),
  };
}
