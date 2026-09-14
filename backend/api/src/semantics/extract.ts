/**
 * AISE-015 — deterministic architectural-semantics extraction.
 *
 * Pure function over `GeometryObservationInput` → `SemanticsResult`: no I/O,
 * no clock, no randomness, no input mutation. Identical input bits (including
 * observation order) produce identical output bits; element ids are
 * content-derived (kind + unit plane/polygon + source artifact, sha-256), so
 * re-extraction of unchanged geometry is idempotent.
 *
 * CLASSIFICATION (facts, not scores — there is no confidence/readiness
 * concept here): planes are classified by their UNIT normal's z component
 * against the named constants in model.ts, using STRICT comparisons:
 *   |z| < WALL_MAX_VERTICALITY  → wall
 *   z    > FLOOR_MIN_Z          → floor
 *   z    < -FLOOR_MIN_Z         → ceiling
 *   otherwise                   → honestly UNCLASSIFIED (reason names the
 *                                 measured |z| and both thresholds). A 45°
 *                                 tilted plane (|z| ≈ 0.707) therefore lands
 *                                 in UNCLASSIFIED, never guessed into a band.
 *
 * OPENINGS are door/window ONLY with supporting facts (reachesFloor, or sill
 * height in the door/window bands). Insufficient or ambiguous facts keep the
 * coarse kind "opening" plus an explicit `unclassifiedReason` property and an
 * unclassified entry — an honest unknown.
 *
 * DIMENSIONS use the geometry library: values come from
 * `dimensionBetweenParallelPlanes` (typed NON_PARALLEL_PLANES pairs are
 * simply not dimension partners — skipped, not errors), and uncertainties
 * are composed ONLY from caller-supplied plane `offsetSigma` values via the
 * library's `propagateUncertainty` (σ = sqrt(σa² + σb²) for the two offsets).
 * When an offset σ is unknown (omitted/null) the dimension uncertainty stays
 * NULL — never 0, never guessed from rms residuals or point counts (a
 * documented limitation: richer σ models are a governed future change).
 *
 * EPISTEMICS: every emitted element and property is INFERRED — extracted
 * semantics are interpretations of reconstructed geometry, NEVER
 * observed/confirmed reality (see model.ts).
 */

import { sha256Hex } from "../lib/hash";
import {
  GeometryError,
  canonicalZero,
  dimensionBetweenParallelPlanes,
  propagateUncertainty,
  vecNorm,
  type Measurement,
  type Plane,
  type Vec3,
} from "../geometry";
import {
  DOOR_SILL_MAX_M,
  EXTRACTOR_VERSION,
  FLOOR_MIN_Z,
  WALL_MAX_VERTICALITY,
  WINDOW_SILL_MAX_M,
  WINDOW_SILL_MIN_M,
  type GeometryObservationInput,
  type ObservedPlane,
  type OpeningFacts,
  type SemanticElement,
  type SemanticElementKind,
  type SemanticProperty,
  type SemanticsResult,
  type SemanticsStats,
  type UnclassifiedEntry,
} from "./model";

/** Plane kinds derivable from a normal direction. */
type PlaneKind = "wall" | "floor" | "ceiling";

/** Mutable working draft of a SemanticElement (frozen shape at the end). */
interface ElementDraft {
  readonly elementId: string;
  readonly kind: SemanticElementKind;
  readonly geometry: {
    plane?: { readonly normal: Vec3; readonly d: number; readonly rmsResidual: number };
    boundaryPolygon?: Vec3[];
    height?: { value: number; uncertainty: number | null };
    width?: { value: number; uncertainty: number | null };
  };
  readonly epistemicStatus: "INFERRED";
  readonly provenance: { sourceArtifactIds: string[]; extractorVersion: string };
  readonly properties: SemanticProperty[];
}

/** A classified plane record kept for the dimension passes. */
interface PlaneRecord {
  readonly observed: ObservedPlane;
  readonly unit: Plane;
  readonly kind: PlaneKind;
  readonly draft: ElementDraft;
}

/** Normalize (n, d) to a unit normal; returns null for a zero-length normal. */
function unitPlane(plane: Plane): Plane | null {
  const scale = vecNorm(plane.normal);
  if (scale === 0) {
    return null;
  }
  const [n0, n1, n2] = plane.normal;
  return {
    normal: [canonicalZero(n0 / scale), canonicalZero(n1 / scale), canonicalZero(n2 / scale)],
    d: canonicalZero(plane.d / scale),
  };
}

/**
 * Plane classification by unit-normal z. STRICT comparisons; boundary values
 * and the tilted band between thresholds return null (unclassified).
 */
function classifyPlaneKind(unitZ: number): PlaneKind | null {
  if (Math.abs(unitZ) < WALL_MAX_VERTICALITY) {
    return "wall";
  }
  if (unitZ > FLOOR_MIN_Z) {
    return "floor";
  }
  if (unitZ < -FLOOR_MIN_Z) {
    return "ceiling";
  }
  return null;
}

/** Opening classification from supporting facts (never guessed). */
function classifyOpeningKind(facts: OpeningFacts | undefined): {
  kind: "door" | "window" | "opening";
  reason: string | null;
} {
  if (facts !== undefined && facts.reachesFloor === true) {
    return { kind: "door", reason: null };
  }
  const sill = facts?.sillHeight;
  if (typeof sill === "number") {
    if (sill < DOOR_SILL_MAX_M) {
      return { kind: "door", reason: null };
    }
    if (sill >= WINDOW_SILL_MIN_M && sill <= WINDOW_SILL_MAX_M) {
      return { kind: "window", reason: null };
    }
    return {
      kind: "opening",
      reason:
        `sillHeight ${sill} m matches neither band: door requires reachesFloor or ` +
        `sillHeight < ${DOOR_SILL_MAX_M} m; window requires sillHeight in ` +
        `[${WINDOW_SILL_MIN_M}, ${WINDOW_SILL_MAX_M}] m`,
    };
  }
  return {
    kind: "opening",
    reason:
      "insufficient facts: reachesFloor is not true and no sillHeight was supplied " +
      "(door/window would be a guess)",
  };
}

/** Content-derived, deterministic element id: kind + geometry + source. */
function planeElementId(kind: PlaneKind, unit: Plane, sourceArtifactId: string): string {
  const digest = sha256Hex(
    JSON.stringify([kind, unit.normal[0], unit.normal[1], unit.normal[2], unit.d, sourceArtifactId]),
  ).slice(0, 12);
  return `${kind}-${digest}`;
}

function openingElementId(
  kind: "door" | "window" | "opening",
  polygon: readonly Vec3[],
  sourceArtifactId: string,
): string {
  const digest = sha256Hex(JSON.stringify([kind, polygon, sourceArtifactId])).slice(0, 12);
  return `${kind}-${digest}`;
}

function planeProperties(observed: ObservedPlane, unitZ: number): SemanticProperty[] {
  const properties: SemanticProperty[] = [
    { key: "classificationBasis", value: "normal-direction", epistemicStatus: "INFERRED" },
    { key: "classificationNormalZ", value: unitZ, epistemicStatus: "INFERRED" },
    { key: "planePointCount", value: observed.pointCount, epistemicStatus: "INFERRED" },
    { key: "planeRmsResidual", value: observed.rmsResidual, epistemicStatus: "INFERRED" },
  ];
  if (observed.observedAt !== undefined) {
    properties.push({ key: "observedAt", value: observed.observedAt, epistemicStatus: "INFERRED" });
  }
  return properties;
}

/** Explicit plane-offset σ, or null = unknown (never fabricated). */
function offsetSigmaOf(observed: ObservedPlane): number | null {
  return observed.offsetSigma === undefined ? null : observed.offsetSigma;
}

/** Dimension between two unit planes; null when they are not parallel. */
function separationOrNull(a: Plane, b: Plane): Measurement | null {
  try {
    return dimensionBetweenParallelPlanes(a, b);
  } catch (error) {
    if (error instanceof GeometryError && error.code === "NON_PARALLEL_PLANES") {
      return null; // not a dimension pair — skip, never an extraction error
    }
    throw error;
  }
}

interface PartnerChoice {
  readonly record: PlaneRecord;
  readonly value: number;
}

/** Nearest parallel partner (minimum separation; first wins ties). */
function nearestParallelPartner(
  subject: PlaneRecord,
  candidates: readonly PlaneRecord[],
): PartnerChoice | null {
  let best: PartnerChoice | null = null;
  for (const candidate of candidates) {
    if (candidate === subject) {
      continue;
    }
    const separation = separationOrNull(subject.unit, candidate.unit);
    if (separation === null) {
      continue;
    }
    if (best === null || separation.value < best.value) {
      best = { record: candidate, value: separation.value };
    }
  }
  return best;
}

/** Compose the dimension σ from the two planes' explicit offset σs. */
function dimensionUncertainty(
  value: number,
  a: ObservedPlane,
  b: ObservedPlane,
): number | null {
  return propagateUncertainty(value, [1, 1], [offsetSigmaOf(a), offsetSigmaOf(b)]).uncertainty;
}

/** Extract architectural semantics deterministically from observations. */
export function extractArchitecturalSemantics(input: GeometryObservationInput): SemanticsResult {
  const drafts: ElementDraft[] = [];
  const unclassified: UnclassifiedEntry[] = [];
  const planeRecords: PlaneRecord[] = [];
  const seenIds = new Set<string>();

  // Planes, in input order: wall/floor/ceiling by normal direction.
  for (const observed of input.planes) {
    const unit = unitPlane(observed.plane);
    if (unit === null) {
      unclassified.push({
        description: `plane observation from artifact ${observed.sourceArtifactId}`,
        reason: "zero-length plane normal — no direction to classify by",
      });
      continue;
    }
    const unitZ = canonicalZero(unit.normal[2]);
    const kind = classifyPlaneKind(unitZ);
    if (kind === null) {
      unclassified.push({
        description: `plane observation from artifact ${observed.sourceArtifactId}`,
        reason:
          `unit normal z = ${unitZ} matches no band: wall requires |z| < ` +
          `${WALL_MAX_VERTICALITY}; floor requires z > ${FLOOR_MIN_Z}; ceiling ` +
          `requires z < ${-FLOOR_MIN_Z} (strict thresholds; a tilted plane is ` +
          `honestly unclassified, never guessed)`,
      });
      continue;
    }
    const elementId = planeElementId(kind, unit, observed.sourceArtifactId);
    if (seenIds.has(elementId)) {
      // Bit-identical duplicate observation (same artifact + same unit plane
      // + same kind): the second element would be bit-identical to the first,
      // so it collapses. Near-duplicates (different artifacts/values) do NOT
      // collapse — they surface as DUPLICATE_ELEMENT consistency findings.
      continue;
    }
    seenIds.add(elementId);
    const draft: ElementDraft = {
      elementId,
      kind,
      geometry: {
        plane: { normal: unit.normal, d: unit.d, rmsResidual: observed.rmsResidual },
      },
      epistemicStatus: "INFERRED",
      provenance: {
        sourceArtifactIds: [observed.sourceArtifactId],
        extractorVersion: EXTRACTOR_VERSION,
      },
      properties: planeProperties(observed, unitZ),
    };
    drafts.push(draft);
    planeRecords.push({ observed, unit, kind, draft });
  }

  // Openings, in input order: door/window only with supporting facts.
  for (const opening of input.openings ?? []) {
    const { kind, reason } = classifyOpeningKind(opening.facts);
    const elementId = openingElementId(kind, opening.boundingPolygon, opening.sourceArtifactId);
    if (seenIds.has(elementId)) {
      continue; // bit-identical duplicate observation collapses (see above)
    }
    seenIds.add(elementId);
    const properties: SemanticProperty[] = [];
    if (opening.facts?.reachesFloor !== undefined) {
      properties.push({
        key: "reachesFloor",
        value: opening.facts.reachesFloor,
        epistemicStatus: "INFERRED",
      });
    }
    if (opening.facts?.sillHeight !== undefined) {
      properties.push({
        key: "sillHeight",
        value: opening.facts.sillHeight,
        epistemicStatus: "INFERRED",
        note: "supplied opening fact, metres above floor",
      });
    }
    if (reason !== null) {
      properties.push({ key: "unclassifiedReason", value: reason, epistemicStatus: "INFERRED" });
      unclassified.push({
        description: `opening observation from artifact ${opening.sourceArtifactId}`,
        reason,
      });
    }
    drafts.push({
      elementId,
      kind,
      geometry: {
        // Defensive copy: outputs never alias caller-owned arrays.
        boundaryPolygon: opening.boundingPolygon.map((p): Vec3 => [p[0], p[1], p[2]]),
      },
      epistemicStatus: "INFERRED",
      provenance: {
        sourceArtifactIds: [opening.sourceArtifactId],
        extractorVersion: EXTRACTOR_VERSION,
      },
      properties,
    });
  }

  // Dimensions (geometry library values + caller-σ uncertainties).
  const walls = planeRecords.filter((r) => r.kind === "wall");
  const floors = planeRecords.filter((r) => r.kind === "floor");
  const ceilings = planeRecords.filter((r) => r.kind === "ceiling");

  for (const record of floors) {
    const partner = nearestParallelPartner(record, ceilings);
    if (partner === null) {
      continue;
    }
    const uncertainty = dimensionUncertainty(partner.value, record.observed, partner.record.observed);
    record.draft.geometry.height = { value: partner.value, uncertainty };
    record.draft.properties.push({
      key: "floorToCeilingHeight",
      value: partner.value,
      epistemicStatus: "INFERRED",
      note:
        `dimensionBetweenParallelPlanes (geometry library) between artifacts ` +
        `[${record.observed.sourceArtifactId}, ${partner.record.observed.sourceArtifactId}]; ` +
        `σ composed first-order via propagateUncertainty from explicit plane offsetSigma values`,
    });
  }
  for (const record of ceilings) {
    const partner = nearestParallelPartner(record, floors);
    if (partner === null) {
      continue;
    }
    const uncertainty = dimensionUncertainty(partner.value, record.observed, partner.record.observed);
    record.draft.geometry.height = { value: partner.value, uncertainty };
    record.draft.properties.push({
      key: "floorToCeilingHeight",
      value: partner.value,
      epistemicStatus: "INFERRED",
      note:
        `dimensionBetweenParallelPlanes (geometry library) between artifacts ` +
        `[${record.observed.sourceArtifactId}, ${partner.record.observed.sourceArtifactId}]; ` +
        `σ composed first-order via propagateUncertainty from explicit plane offsetSigma values`,
    });
  }
  for (const record of walls) {
    const partner = nearestParallelPartner(record, walls);
    if (partner === null) {
      continue;
    }
    const uncertainty = dimensionUncertainty(partner.value, record.observed, partner.record.observed);
    record.draft.geometry.width = { value: partner.value, uncertainty };
    record.draft.properties.push({
      key: "distanceToNearestParallelWall",
      value: partner.value,
      epistemicStatus: "INFERRED",
      note:
        `dimensionBetweenParallelPlanes (geometry library) to artifact ` +
        `${partner.record.observed.sourceArtifactId}; σ composed first-order via ` +
        `propagateUncertainty from explicit plane offsetSigma values`,
    });
  }

  const elements: SemanticElement[] = drafts.map((draft) => ({
    elementId: draft.elementId,
    kind: draft.kind,
    geometry: draft.geometry,
    epistemicStatus: draft.epistemicStatus,
    provenance: draft.provenance,
    properties: draft.properties,
  }));

  const stats: SemanticsStats = {
    walls: elements.filter((e) => e.kind === "wall").length,
    floors: elements.filter((e) => e.kind === "floor").length,
    ceilings: elements.filter((e) => e.kind === "ceiling").length,
    openings: elements.filter((e) => e.kind === "opening").length,
    doors: elements.filter((e) => e.kind === "door").length,
    windows: elements.filter((e) => e.kind === "window").length,
    unclassified: unclassified.length,
  };

  return { elements, unclassified, stats };
}
