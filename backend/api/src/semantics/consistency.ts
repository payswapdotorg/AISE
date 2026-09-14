/**
 * AISE-015 — semantic/geometry consistency checks.
 *
 * FINDING, NOT FIXING: this module reports incoherence between semantic
 * objects and geometry; it never repairs, mutates or deletes anything. What
 * happens to a finding is a governed human/assurance decision (AISE-022).
 *
 * Checks (each finding carries a stable code + the measured value that
 * triggered it, null when the quantity is undefined):
 *
 *   - WALL_NORMAL_NOT_HORIZONTAL / FLOOR_NORMAL_NOT_UPWARD /
 *     CEILING_NORMAL_NOT_DOWNWARD: per-element coherence of the declared kind
 *     with the element's own unit normal (mirrors the extraction thresholds —
 *     a "floor" whose normal does not point up is incoherent, whatever
 *     produced it; catches hand-built or migrated elements too).
 *
 *   - DUPLICATE_ELEMENT: two same-kind elements with nearly-identical unit
 *     planes (|n̂₁·n̂₂| ≥ DUPLICATE_NORMAL_DOT_MIN AND |d₁ − d₂| <
 *     DUPLICATE_OFFSET_TOLERANCE_M), naming both element ids and the offset
 *     delta. Orientation-independent (|dot|): an anti-parallel re-detection
 *     of the same face is still a duplicate.
 *
 *   - OPENING_UNANCHORED: every observed opening (from the SAME input the
 *     caller extracted from) must lie within OPENING_ANCHOR_TOLERANCE_M of
 *     SOME wall element's plane, measured from the opening centroid; the
 *     finding names the measured distance. Raw observations carry no element
 *     id, so elementId is null and the detail names the source artifact.
 *
 * Pure and deterministic: fixed check order (normal coherence in element
 * order → duplicates per kind in SEMANTIC_ELEMENT_KINDS order → openings in
 * input order), fixed iteration order, no input mutation.
 */

import {
  DUPLICATE_NORMAL_DOT_MIN,
  DUPLICATE_OFFSET_TOLERANCE_M,
  FLOOR_MIN_Z,
  OPENING_ANCHOR_TOLERANCE_M,
  SEMANTIC_ELEMENT_KINDS,
  WALL_MAX_VERTICALITY,
  type ConsistencyReport,
  type GeometryObservationInput,
  type SemanticElement,
  type SemanticElementKind,
  type SemanticFinding,
} from "./model";
import {
  canonicalZero,
  distancePointPlane,
  vecDot,
  vecNorm,
  type Plane,
  type Vec3,
} from "../geometry";

/** A plane-kind element together with its already-unitized plane. */
interface PlaneElement {
  readonly element: SemanticElement;
  readonly unit: Plane;
}

/** Unit-normalize an element plane; null for zero-length normals. */
function unitElementPlane(element: SemanticElement): Plane | null {
  const plane = element.geometry.plane;
  if (plane === undefined) {
    return null;
  }
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

/** Normal-direction coherence of a plane-kind element's declared kind. */
function normalCoherenceFinding(element: SemanticElement): SemanticFinding | null {
  const unit = unitElementPlane(element);
  if (unit === null) {
    // Zero-length (or missing) normal on a plane-kind element: incoherent,
    // and no quantity can be measured — the finding names that honestly.
    if (element.kind === "wall" || element.kind === "floor" || element.kind === "ceiling") {
      if (element.geometry.plane === undefined) {
        return null; // plane-less elements carry no normal-direction claim
      }
      return {
        code: normalCodeFor(element.kind),
        elementId: element.elementId,
        measuredValue: null,
        detail: `${element.kind} element has a zero-length plane normal; direction is undefined`,
      };
    }
    return null;
  }
  const unitZ = canonicalZero(unit.normal[2]);
  if (element.kind === "wall") {
    if (Math.abs(unitZ) >= WALL_MAX_VERTICALITY) {
      return {
        code: "WALL_NORMAL_NOT_HORIZONTAL",
        elementId: element.elementId,
        measuredValue: Math.abs(unitZ),
        detail:
          `wall normal is not near-horizontal: |unit normal z| = ${Math.abs(unitZ)} is not ` +
          `< WALL_MAX_VERTICALITY = ${WALL_MAX_VERTICALITY}`,
      };
    }
    return null;
  }
  if (element.kind === "floor") {
    if (unitZ <= FLOOR_MIN_Z) {
      return {
        code: "FLOOR_NORMAL_NOT_UPWARD",
        elementId: element.elementId,
        measuredValue: unitZ,
        detail:
          `floor normal does not point up: unit normal z = ${unitZ} is not > ` +
          `FLOOR_MIN_Z = ${FLOOR_MIN_Z}`,
      };
    }
    return null;
  }
  if (element.kind === "ceiling") {
    if (unitZ >= -FLOOR_MIN_Z) {
      return {
        code: "CEILING_NORMAL_NOT_DOWNWARD",
        elementId: element.elementId,
        measuredValue: unitZ,
        detail:
          `ceiling normal does not point down: unit normal z = ${unitZ} is not < ` +
          `${-FLOOR_MIN_Z}`,
      };
    }
    return null;
  }
  return null; // openings make no normal-direction claim
}

function normalCodeFor(kind: "wall" | "floor" | "ceiling"): SemanticFinding["code"] {
  if (kind === "wall") {
    return "WALL_NORMAL_NOT_HORIZONTAL";
  }
  if (kind === "floor") {
    return "FLOOR_NORMAL_NOT_UPWARD";
  }
  return "CEILING_NORMAL_NOT_DOWNWARD";
}

/** Duplicate detection over one kind's plane elements (ordered pairs). */
function duplicateFindings(kind: SemanticElementKind, planeElements: readonly PlaneElement[]): SemanticFinding[] {
  const findings: SemanticFinding[] = [];
  for (const [i, a] of planeElements.entries()) {
    for (const [j, b] of planeElements.entries()) {
      if (j <= i) {
        continue;
      }
      const dot = Math.abs(vecDot(a.unit.normal, b.unit.normal));
      const offsetDelta = Math.abs(a.unit.d - b.unit.d);
      if (dot >= DUPLICATE_NORMAL_DOT_MIN && offsetDelta < DUPLICATE_OFFSET_TOLERANCE_M) {
        findings.push({
          code: "DUPLICATE_ELEMENT",
          elementId: a.element.elementId,
          relatedElementIds: [b.element.elementId],
          measuredValue: offsetDelta,
          detail:
            `two ${kind} elements have nearly-identical planes: |n̂₁·n̂₂| = ${dot} ≥ ` +
            `${DUPLICATE_NORMAL_DOT_MIN} and |d₁ − d₂| = ${offsetDelta} m < ` +
            `${DUPLICATE_OFFSET_TOLERANCE_M} m`,
        });
      }
    }
  }
  return findings;
}

/** Vertex-mean centroid of a polygon; null for an empty polygon. */
function polygonCentroid(polygon: readonly Vec3[]): Vec3 | null {
  if (polygon.length === 0) {
    return null;
  }
  let x = 0;
  let y = 0;
  let z = 0;
  for (const point of polygon) {
    x += point[0];
    y += point[1];
    z += point[2];
  }
  return [x / polygon.length, y / polygon.length, z / polygon.length];
}

/**
 * Check semantic/geometry consistency of extracted elements against the
 * observations they were extracted from. Pure: returns findings only.
 */
export function checkSemanticConsistency(
  elements: readonly SemanticElement[],
  input: GeometryObservationInput,
): ConsistencyReport {
  const findings: SemanticFinding[] = [];

  // 1. Normal-direction coherence, in element order.
  for (const element of elements) {
    const finding = normalCoherenceFinding(element);
    if (finding !== null) {
      findings.push(finding);
    }
  }

  // 2. Duplicates, per kind in canonical kind order, pairs in element order.
  for (const kind of SEMANTIC_ELEMENT_KINDS) {
    const planeElements: PlaneElement[] = [];
    for (const element of elements) {
      if (element.kind !== kind) {
        continue;
      }
      const unit = unitElementPlane(element);
      if (unit === null) {
        continue; // zero-normal pairs are not comparable (already reported above)
      }
      planeElements.push({ element, unit });
    }
    findings.push(...duplicateFindings(kind, planeElements));
  }

  // 3. Opening anchoring: observed openings vs wall element planes.
  const wallPlanes: PlaneElement[] = [];
  for (const element of elements) {
    if (element.kind !== "wall") {
      continue;
    }
    const unit = unitElementPlane(element);
    if (unit === null) {
      continue; // zero-normal walls cannot anchor (already reported above)
    }
    wallPlanes.push({ element, unit });
  }
  for (const opening of input.openings ?? []) {
    const centroid = polygonCentroid(opening.boundingPolygon);
    if (centroid === null) {
      findings.push({
        code: "OPENING_UNANCHORED",
        elementId: null,
        measuredValue: null,
        detail:
          `opening from artifact ${opening.sourceArtifactId} has an empty bounding polygon; ` +
          `centroid (and anchoring) undefined`,
      });
      continue;
    }
    if (wallPlanes.length === 0) {
      findings.push({
        code: "OPENING_UNANCHORED",
        elementId: null,
        measuredValue: null,
        detail:
          `opening from artifact ${opening.sourceArtifactId} cannot be anchored: no wall ` +
          `element with a usable plane is present`,
      });
      continue;
    }
    let nearest: number | null = null;
    for (const wall of wallPlanes) {
      const distance = distancePointPlane(centroid, null, wall.unit).absolute;
      if (nearest === null || distance < nearest) {
        nearest = distance;
      }
    }
    if (nearest !== null && nearest > OPENING_ANCHOR_TOLERANCE_M) {
      findings.push({
        code: "OPENING_UNANCHORED",
        elementId: null,
        measuredValue: nearest,
        detail:
          `opening from artifact ${opening.sourceArtifactId}: centroid distance to the ` +
          `nearest wall plane is ${nearest} m > OPENING_ANCHOR_TOLERANCE_M = ` +
          `${OPENING_ANCHOR_TOLERANCE_M} m`,
      });
    }
  }

  return { findings };
}
