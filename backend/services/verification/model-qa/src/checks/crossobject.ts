/**
 * CROSS-OBJECT consistency checks (AISE-014 family 5).
 *
 * Detects contradictions that only exist BETWEEN objects:
 *
 * - impossible overlaps between same-class objects in one space
 *   (two walls occupying the same planar region);
 * - duplicate representations of one physical object (identical
 *   class, frame and rectangle in one space — identity rules
 *   require one object);
 * - opening/host rectangle containment (an opening whose
 *   rectangle is not within its host wall's rectangle — the
 *   geometric form of "impossible containment");
 * - floor/ceiling elevation ordering (a floor at or above a
 *   ceiling in the same space).
 *
 * Geometry reasoning used here (documented, deterministic):
 *
 * - Two zero-thickness planar rectangles in DIFFERENT planes can
 *   never overlap with positive area (their intersection is at
 *   most a line) — this is a geometric theorem, NOT an
 *   interpretation of missing data. Only co-planar rectangles
 *   are overlap-checkable.
 * - Co-planar rectangles with PARALLEL axes are compared exactly
 *   by interval arithmetic (projection onto one frame).
 * - Co-planar rectangles with non-parallel axes are NOT
 *   overlap-checkable with the v1 deterministic suite: the check
 *   reports UNEVALUABLE — it never treats "cannot decide" as
 *   "no overlap" (the missing-observation discipline).
 * - The same discipline applies to opening/host containment: a
 *   host plane that is not the opening's plane is a CONTRADICTION
 *   (an opening outside its wall's plane is definitionally not in
 *   the wall); rotated-in-plane is UNEVALUABLE; missing geometry
 *   is UNEVALUABLE.
 */
import {
  structuredPlanarGeometry,
  type PlaneFrame,
  type RealityObject,
  type StructuredPlanarGeometry,
} from "@aise/engineering-model";
import { makeFinding, type QaFinding } from "../findings.js";
import type { QaView } from "../view.js";
import type { AssuranceProfile } from "@aise/shared-contracts";
import { frameComparability } from "./geometry.js";
import { formatQuantity, lengthToSiMeters } from "../units.js";

/** Absolute tolerance for plane geometry (the model's own). */
const PLANE_TOLERANCE = 1e-6;

/** Structural validity probe (the model's own constructor as validator). */
function structurallyValid(geometry: StructuredPlanarGeometry): boolean {
  try {
    structuredPlanarGeometry(geometry);
    return true;
  } catch {
    return false;
  }
}

/** Runs all cross-object-family checks over the view. */
export function runCrossObjectChecks(view: QaView, profile: AssuranceProfile): readonly QaFinding[] {
  return [
    ...checkSameClassOverlaps(view, profile),
    ...checkOpeningContainment(view, profile),
    ...checkFloorCeilingOrder(view, profile),
  ];
}

// --- Same-class overlap / duplicate representation ---------------------------------

function checkSameClassOverlaps(view: QaView, profile: AssuranceProfile): readonly QaFinding[] {
  const findings: QaFinding[] = [];
  const objects = view.graph.objects.filter((object) => object.geometry?.structured !== undefined);
  for (let i = 0; i < objects.length; i += 1) {
    const a = objects[i];
    if (a === undefined) {
      continue;
    }
    for (let j = i + 1; j < objects.length; j += 1) {
      const b = objects[j];
      if (b === undefined) {
        continue;
      }
      if (a.objectClass !== b.objectClass) {
        continue; // cross-class overlap rules are class-pair-specific; v1 checks same-class only
      }
      const containersA = view.containersOf.get(a.objectId) ?? [];
      const containersB = view.containersOf.get(b.objectId) ?? [];
      const sharedSpace = containersA.find((spaceId) => containersB.includes(spaceId));
      if (sharedSpace === undefined) {
        continue; // objects in different spaces cannot be duplicate physical representations
      }
      const geometryA = a.geometry!.structured!;
      const geometryB = b.geometry!.structured!;
      if (!structurallyValid(geometryA) || !structurallyValid(geometryB)) {
        continue; // structural invalidity is already GEOMETRY_INVALID-flagged
      }
      const comparability = frameComparability(geometryA.frame, geometryB.frame);

      if (!comparability.comparable) {
        if (comparability.reason === "rotated") {
          findings.push(
            makeFinding({
              code: "OVERLAP_FORBIDDEN",
              outcome: "UNEVALUABLE",
              profile,
              subject: { kind: "object", objectId: a.objectId },
              related: [{ kind: "object", objectId: b.objectId }],
              detail: `same-class objects ${a.objectId} and ${b.objectId} share space ${sharedSpace} but their co-planar frames are rotated — the overlap invariant cannot be established`,
            }),
          );
        }
        // Different planes: zero-thickness rectangles in distinct
        // planes cannot overlap with positive area (geometric
        // theorem — not an absence interpretation). No finding.
        continue;
      }

      const projection = projectRectangleInto(geometryB, geometryA.frame);
      if (projection === undefined) {
        continue; // defensive: comparability already established
      }
      const intervalA = {
        uMin: geometryA.rectangle.uMin,
        uMax: geometryA.rectangle.uMax,
        vMin: geometryA.rectangle.vMin,
        vMax: geometryA.rectangle.vMax,
      };
      const identical =
        intervalA.uMin === projection.uMin &&
        intervalA.uMax === projection.uMax &&
        intervalA.vMin === projection.vMin &&
        intervalA.vMax === projection.vMax;
      if (identical) {
        findings.push(
          makeFinding({
            code: "DUPLICATE_REPRESENTATION",
            outcome: "CONTRADICTION",
            profile,
            subject: { kind: "object", objectId: a.objectId },
            related: [{ kind: "object", objectId: b.objectId }],
            expected: "one canonical object per physical entity",
            actual: `identical ${a.objectClass} geometry in space ${sharedSpace}`,
            detail: `${a.objectClass} ${a.objectId} and ${b.objectId} declare identical geometry in space ${sharedSpace} — a duplicate representation of one physical object (identity rules require exactly one)`,
          }),
        );
        continue;
      }
      const overlaps =
        intervalA.uMin < projection.uMax &&
        intervalA.uMax > projection.uMin &&
        intervalA.vMin < projection.vMax &&
        intervalA.vMax > projection.vMin;
      if (overlaps) {
        findings.push(
          makeFinding({
            code: "OVERLAP_FORBIDDEN",
            outcome: "CONTRADICTION",
            profile,
            subject: { kind: "object", objectId: a.objectId },
            related: [{ kind: "object", objectId: b.objectId }],
            expected: `disjoint planar extents for same-class objects in space ${sharedSpace}`,
            actual: "overlapping rectangles",
            detail: `${a.objectClass} ${a.objectId} and ${b.objectId} overlap in space ${sharedSpace} — two same-class objects cannot occupy one planar region`,
          }),
        );
      }
    }
  }
  return findings;
}

// --- Opening/host rectangle containment ---------------------------------------------

function checkOpeningContainment(
  view: QaView,
  profile: AssuranceProfile,
): readonly QaFinding[] {
  const findings: QaFinding[] = [];
  for (const opening of view.graph.objects) {
    if (opening.objectClass !== "DOOR" && opening.objectClass !== "WINDOW") {
      continue;
    }
    const geometry = opening.geometry?.structured;
    const hosts = view.hostsOf.get(opening.objectId) ?? [];
    const hostId = hosts[0];
    const host = hosts.length === 1 && hostId !== undefined ? view.objectById.get(hostId) : undefined;
    const hostGeometry = host?.geometry?.structured;
    if (geometry === undefined || host === undefined || hostGeometry === undefined) {
      findings.push(
        makeFinding({
          code: "OPENING_OUTSIDE_HOST",
          outcome: "UNEVALUABLE",
          profile,
          subject: { kind: "object", objectId: opening.objectId },
          related: [{ kind: "object", objectId: hostId ?? opening.objectId }],
          detail: `the opening-containment invariant cannot be established for ${opening.objectId} (missing opening or host geometry)`,
        }),
      );
      continue;
    }
    if (!structurallyValid(geometry) || !structurallyValid(hostGeometry)) {
      continue; // structural invalidity is already GEOMETRY_INVALID-flagged
    }
    const comparability = frameComparability(geometry.frame, hostGeometry.frame);
    if (!comparability.comparable) {
      if (comparability.reason === "plane-mismatch") {
        findings.push(
          makeFinding({
            code: "OPENING_OUTSIDE_HOST",
            outcome: "CONTRADICTION",
            profile,
            subject: { kind: "object", objectId: opening.objectId },
            related: [{ kind: "object", objectId: host.objectId }],
            expected: `the opening's plane equals its host wall's plane`,
            actual: "the opening's plane differs from the host wall's plane",
            detail: `${opening.objectClass} ${opening.objectId} does not lie in its host wall ${host.objectId}'s plane — an opening outside its wall's plane is definitionally not in that wall`,
          }),
        );
      } else {
        findings.push(
          makeFinding({
            code: "OPENING_OUTSIDE_HOST",
            outcome: "UNEVALUABLE",
            profile,
            subject: { kind: "object", objectId: opening.objectId },
            related: [{ kind: "object", objectId: host.objectId }],
            detail: `the opening-containment invariant cannot be established for ${opening.objectId}: its frame is rotated within the host plane`,
          }),
        );
      }
      continue;
    }
    const projection = projectRectangleInto(geometry, hostGeometry.frame);
    if (projection === undefined) {
      continue; // defensive: comparability already established
    }
    const hostRect = hostGeometry.rectangle;
    const inside =
      projection.uMin >= hostRect.uMin - PLANE_TOLERANCE &&
      projection.uMax <= hostRect.uMax + PLANE_TOLERANCE &&
      projection.vMin >= hostRect.vMin - PLANE_TOLERANCE &&
      projection.vMax <= hostRect.vMax + PLANE_TOLERANCE;
    if (!inside) {
      findings.push(
        makeFinding({
          code: "OPENING_OUTSIDE_HOST",
          outcome: "CONTRADICTION",
          profile,
          subject: { kind: "object", objectId: opening.objectId },
          related: [{ kind: "object", objectId: host.objectId }],
          expected: "opening rectangle within host wall rectangle",
          actual: `u ∈ [${Number(projection.uMin.toFixed(6))}, ${Number(projection.uMax.toFixed(6))}], v ∈ [${Number(projection.vMin.toFixed(6))}, ${Number(projection.vMax.toFixed(6))}] vs host u ∈ [${Number(hostRect.uMin.toFixed(6))}, ${Number(hostRect.uMax.toFixed(6))}], v ∈ [${Number(hostRect.vMin.toFixed(6))}, ${Number(hostRect.vMax.toFixed(6))}]`,
          detail: `${opening.objectClass} ${opening.objectId}'s rectangle is not contained in its host wall ${host.objectId}'s rectangle`,
        }),
      );
    }
  }
  return findings;
}

// --- Floor/ceiling elevation ordering ------------------------------------------------

function checkFloorCeilingOrder(view: QaView, profile: AssuranceProfile): readonly QaFinding[] {
  const findings: QaFinding[] = [];
  const floors = view.graph.objects.filter(
    (object) =>
      object.objectClass === "FLOOR" &&
      object.geometry?.structured?.elevation !== undefined,
  );
  const ceilings = view.graph.objects.filter(
    (object) =>
      object.objectClass === "CEILING" &&
      object.geometry?.structured?.elevation !== undefined,
  );
  for (const floor of floors) {
    for (const ceiling of ceilings) {
      const floorContainers = view.containersOf.get(floor.objectId) ?? [];
      const ceilingContainers = view.containersOf.get(ceiling.objectId) ?? [];
      const sharedSpace = floorContainers.find((spaceId) => ceilingContainers.includes(spaceId));
      if (sharedSpace === undefined) {
        continue;
      }
      const floorElevation = floor.geometry!.structured!.elevation!;
      const ceilingElevation = ceiling.geometry!.structured!.elevation!;
      const floorSi = lengthToSiMeters(floorElevation.value, floorElevation.unit);
      const ceilingSi = lengthToSiMeters(ceilingElevation.value, ceilingElevation.unit);
      if (floorSi >= ceilingSi) {
        findings.push(
          makeFinding({
            code: "FLOOR_CEILING_ELEVATION_REVERSED",
            outcome: "CONTRADICTION",
            profile,
            subject: { kind: "object", objectId: floor.objectId },
            related: [{ kind: "object", objectId: ceiling.objectId }],
            expected: `floor elevation < ceiling elevation (${formatQuantity(ceilingSi, "meter")})`,
            actual: `floor at ${formatQuantity(floorSi, "meter")}`,
            detail: `floor ${floor.objectId} is at or above ceiling ${ceiling.objectId} in space ${sharedSpace} — the room has non-positive height`,
          }),
        );
      }
    }
  }
  return findings;
}

// --- Projection helper ---------------------------------------------------------------

/**
 * Projects `geometry`'s rectangle into `target`'s frame as exact
 * intervals (requires parallel axes — established by
 * `frameComparability` before this is called). With anti-parallel
 * axes the interval endpoints swap, which the projection handles
 * exactly.
 */
function projectRectangleInto(
  geometry: StructuredPlanarGeometry,
  target: PlaneFrame,
): { uMin: number; uMax: number; vMin: number; vMax: number } | undefined {
  const uSign = Math.abs(dot(geometry.frame.axisU, target.axisU)) > 1 - PLANE_TOLERANCE
    ? Math.sign(dot(geometry.frame.axisU, target.axisU))
    : 0;
  const vSign = Math.abs(dot(geometry.frame.axisV, target.axisV)) > 1 - PLANE_TOLERANCE
    ? Math.sign(dot(geometry.frame.axisV, target.axisV))
    : 0;
  if (uSign === 0 || vSign === 0) {
    return undefined;
  }
  const offset = {
    x: geometry.frame.planePoint.x - target.planePoint.x,
    y: geometry.frame.planePoint.y - target.planePoint.y,
    z: geometry.frame.planePoint.z - target.planePoint.z,
  };
  const uOffset = dot(offset, target.axisU);
  const vOffset = dot(offset, target.axisV);
  const uValues = [geometry.rectangle.uMin, geometry.rectangle.uMax].map((value) => uOffset + uSign * value);
  const vValues = [geometry.rectangle.vMin, geometry.rectangle.vMax].map((value) => vOffset + vSign * value);
  return {
    uMin: Math.min(...uValues),
    uMax: Math.max(...uValues),
    vMin: Math.min(...vValues),
    vMax: Math.max(...vValues),
  };
}

function dot(a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

export type { RealityObject };
