/**
 * GEOMETRY consistency checks (AISE-014 family 1).
 *
 * Detects, using the model's own validation primitives and exact
 * SI arithmetic:
 *
 * - invalid/non-finite geometry (the AISE-011 whole-graph
 *   validator does not validate geometry, so this is the
 *   first-line structural gate over committed content);
 * - non-positive dimensions (impossible dimensions);
 * - degenerate geometry (empty rectangles — via the model's own
 *   constructor validation);
 * - contradictory extents (width/height vs rectangle extents);
 * - incompatible geometric quantities (area vs width × height);
 * - elevation contradictions (declared elevation vs the geometry
 *   plane's height along the containing space's up axis);
 * - structural-assumption violations against the space's declared
 *   coordinate frame (floor/ceiling planes normal to up; wall and
 *   opening planes perpendicular to up);
 * - opening-vs-host dimension and position contradictions (an
 *   opening wider/taller than its host wall; head/sill heights
 *   disagreeing with the opening's rectangle position).
 *
 * Comparison discipline: cross-unit comparisons convert through
 * exact SI factors with a relative tolerance (1e-9) mirroring
 * float arithmetic in the deterministic extraction chain; the
 * frame/axis orthogonality checks use the model's own absolute
 * tolerance (1e-6). A check that cannot establish its invariant
 * on the given content (missing space frame, missing host
 * geometry, incomparable frames) reports UNEVALUABLE — it never
 * interprets missing data as absence.
 */
import {
  geometryAssetRef,
  structuredPlanarGeometry,
  type PlaneFrame,
  type RealityObject,
  type StructuredPlanarGeometry,
} from "@aise/engineering-model";
import { makeFinding, type QaFinding } from "../findings.js";
import type { QaView } from "../view.js";
import type { AssuranceProfile } from "@aise/shared-contracts";
import { formatQuantity, lengthToSiMeters } from "../units.js";

/** Relative tolerance for cross-quantity float comparisons. */
const RELATIVE_TOLERANCE = 1e-9;
/** Absolute tolerance for plane/axis geometry (the model's own). */
const PLANE_TOLERANCE = 1e-6;
/** Runs all geometry-family checks over the view. */
export function runGeometryChecks(view: QaView, profile: AssuranceProfile): readonly QaFinding[] {
  const findings: QaFinding[] = [];
  const invalidGeometry = checkGeometryValidity(view, profile);
  findings.push(...invalidGeometry);
  // Objects whose geometry is structurally invalid are already
  // CONTRADICTION-flagged; deeper dimensional analysis over
  // invalid content is skipped honestly (the structural finding
  // subsumes it — never "passed by absence").
  const invalidIds = new Set(invalidGeometry.map((finding) => finding.subject.kind === "object" ? finding.subject.objectId : ""));
  const valid = (objectId: string): boolean => !invalidIds.has(objectId);
  findings.push(
    ...checkDimensions(view, profile, valid),
    ...checkExtentsAndArea(view, profile, valid),
    ...checkElevation(view, profile, valid),
    ...checkStructuralAssumptions(view, profile, valid),
    ...checkOpeningsAgainstHosts(view, profile, valid),
  );
  return findings;
}

// --- Structural validity of committed geometry --------------------------------

function checkGeometryValidity(view: QaView, profile: AssuranceProfile): readonly QaFinding[] {
  const findings: QaFinding[] = [];
  for (const object of view.graph.objects) {
    const geometry = object.geometry;
    if (geometry === undefined) {
      continue; // no geometry is a legal state (existence-only objects)
    }
    if (geometry.structured !== undefined) {
      try {
        structuredPlanarGeometry(geometry.structured);
      } catch (error) {
        findings.push(
          makeFinding({
            code: "GEOMETRY_INVALID",
            outcome: "CONTRADICTION",
            profile,
            subject: { kind: "object", objectId: object.objectId },
            detail: `structured geometry is invalid: ${error instanceof Error ? error.message : String(error)}`,
          }),
        );
      }
    }
    for (const ref of geometry.assetRefs ?? []) {
      try {
        geometryAssetRef(ref);
      } catch (error) {
        findings.push(
          makeFinding({
            code: "GEOMETRY_INVALID",
            outcome: "CONTRADICTION",
            profile,
            subject: { kind: "object", objectId: object.objectId },
            detail: `geometry asset reference is invalid: ${error instanceof Error ? error.message : String(error)}`,
          }),
        );
      }
    }
  }
  return findings;
}

// --- Impossible dimensions ------------------------------------------------------

function checkDimensions(view: QaView, profile: AssuranceProfile, valid: (objectId: string) => boolean): readonly QaFinding[] {
  const findings: QaFinding[] = [];
  for (const object of view.graph.objects) {
    const geometry = object.geometry?.structured;
    if (geometry === undefined || !valid(object.objectId)) {
      continue;
    }
    for (const dim of ["width", "height", "area"] as const) {
      if (geometry[dim].value <= 0) {
        findings.push(
          makeFinding({
            code: "GEOMETRY_DIMENSION_NON_POSITIVE",
            outcome: "CONTRADICTION",
            profile,
            subject: { kind: "object", objectId: object.objectId },
            expected: "> 0",
            actual: formatQuantity(geometry[dim].value, geometry[dim].unit),
            detail: `${object.objectClass} ${object.objectId} declares a non-positive ${dim}`,
          }),
        );
      }
    }
    // sill must be strictly below head (window discipline).
    if (geometry.sillHeight !== undefined && geometry.headHeight !== undefined) {
      const sill = lengthToSiMeters(geometry.sillHeight.value, geometry.sillHeight.unit);
      const head = lengthToSiMeters(geometry.headHeight.value, geometry.headHeight.unit);
      if (sill >= head) {
        findings.push(
          makeFinding({
            code: "GEOMETRY_SILL_HEAD_INCONSISTENT",
            outcome: "CONTRADICTION",
            profile,
            subject: { kind: "object", objectId: object.objectId },
            expected: `sill < head (${formatQuantity(sill, "meter")} < ${formatQuantity(head, "meter")})`,
            actual: `sill = ${formatQuantity(sill, "meter")}, head = ${formatQuantity(head, "meter")}`,
            detail: `window ${object.objectId} sill height is not strictly below its head height`,
          }),
        );
      }
    }
  }
  return findings;
}

// --- Contradictory extents / incompatible quantities ---------------------------

function checkExtentsAndArea(view: QaView, profile: AssuranceProfile, valid: (objectId: string) => boolean): readonly QaFinding[] {
  const findings: QaFinding[] = [];
  for (const object of view.graph.objects) {
    const geometry = object.geometry?.structured;
    if (geometry === undefined || !valid(object.objectId)) {
      continue;
    }
    const spaceFrame = containingSpaceFrame(view, object.objectId);

    // width/height vs rectangle extents (extents carry the space's
    // declared coordinate unit; no declared frame → UNEVALUABLE).
    for (const dim of ["width", "height"] as const) {
      const quantity = geometry[dim];
      const extents =
        dim === "width"
          ? geometry.rectangle.uMax - geometry.rectangle.uMin
          : geometry.rectangle.vMax - geometry.rectangle.vMin;
      if (spaceFrame === undefined) {
        findings.push(
          makeFinding({
            code: "GEOMETRY_EXTENTS_MISMATCH",
            outcome: "UNEVALUABLE",
            profile,
            subject: { kind: "object", objectId: object.objectId },
            detail: `the containing space declares no coordinate frame — the ${dim}-vs-extents invariant cannot be established for ${object.objectId}`,
          }),
        );
        continue;
      }
      const declaredSi = lengthToSiMeters(quantity.value, quantity.unit);
      const extentsSi = lengthToSiMeters(extents, spaceFrame.unit);
      if (!withinTolerance(declaredSi, extentsSi)) {
        findings.push(
          makeFinding({
            code: "GEOMETRY_EXTENTS_MISMATCH",
            outcome: "CONTRADICTION",
            profile,
            subject: { kind: "object", objectId: object.objectId },
            expected: `${dim} = ${formatQuantity(extentsSi, "meter")} (rectangle extents)`,
            actual: `${dim} = ${formatQuantity(declaredSi, "meter")}`,
            detail: `${object.objectClass} ${object.objectId} declares a ${dim} that disagrees with its rectangle extents`,
          }),
        );
      }
    }

    // area vs width × height (pure quantity comparison).
    const widthSi = lengthToSiMeters(geometry.width.value, geometry.width.unit);
    const heightSi = lengthToSiMeters(geometry.height.value, geometry.height.unit);
    const areaSi = areaSiOf(geometry);
    if (!withinTolerance(areaSi, widthSi * heightSi)) {
      findings.push(
        makeFinding({
          code: "GEOMETRY_AREA_MISMATCH",
          outcome: "CONTRADICTION",
          profile,
          subject: { kind: "object", objectId: object.objectId },
          expected: `area = ${formatQuantity(widthSi * heightSi, "square_meter")} (width × height)`,
          actual: `area = ${formatQuantity(areaSi, "square_meter")}`,
          detail: `${object.objectClass} ${object.objectId} declares an area that disagrees with width × height`,
        }),
      );
    }
  }
  return findings;
}

// --- Elevation consistency ------------------------------------------------------

function checkElevation(view: QaView, profile: AssuranceProfile, valid: (objectId: string) => boolean): readonly QaFinding[] {
  const findings: QaFinding[] = [];
  for (const object of view.graph.objects) {
    const geometry = object.geometry?.structured;
    if (geometry === undefined || geometry.elevation === undefined || !valid(object.objectId)) {
      continue;
    }
    const spaceFrame = containingSpaceFrame(view, object.objectId);
    if (spaceFrame === undefined) {
      findings.push(
        makeFinding({
          code: "GEOMETRY_ELEVATION_MISMATCH",
          outcome: "UNEVALUABLE",
          profile,
          subject: { kind: "object", objectId: object.objectId },
          detail: `the containing space declares no coordinate frame — the elevation invariant cannot be established for ${object.objectId}`,
        }),
      );
      continue;
    }
    const elevationSi = lengthToSiMeters(geometry.elevation.value, geometry.elevation.unit);
    const planeHeightSi = planeHeightAlongUp(geometry.frame, spaceFrame);
    if (planeHeightSi === undefined) {
      // The plane is not perpendicular to the up axis on a
      // FLOOR/CEILING-class object — that is a structural violation
      // reported by the structural-assumption check; elevation is
      // then not comparable.
      continue;
    }
    if (!withinTolerance(elevationSi, planeHeightSi)) {
      findings.push(
        makeFinding({
          code: "GEOMETRY_ELEVATION_MISMATCH",
          outcome: "CONTRADICTION",
          profile,
          subject: { kind: "object", objectId: object.objectId },
          expected: `elevation = ${formatQuantity(planeHeightSi, "meter")} (plane height along up)`,
          actual: `elevation = ${formatQuantity(elevationSi, "meter")}`,
          detail: `${object.objectClass} ${object.objectId} declares an elevation that disagrees with its geometry plane's height along the space up axis`,
        }),
      );
    }
  }
  return findings;
}

// --- Declared structural assumptions vs the space coordinate frame --------------

function checkStructuralAssumptions(
  view: QaView,
  profile: AssuranceProfile,
  valid: (objectId: string) => boolean,
): readonly QaFinding[] {
  const findings: QaFinding[] = [];
  for (const object of view.graph.objects) {
    const geometry = object.geometry?.structured;
    if (geometry === undefined || !valid(object.objectId)) {
      continue;
    }
    const spaceFrame = containingSpaceFrame(view, object.objectId);
    if (spaceFrame === undefined) {
      findings.push(
        makeFinding({
          code: "GEOMETRY_ELEVATION_MISMATCH",
          outcome: "UNEVALUABLE",
          profile,
          subject: { kind: "object", objectId: object.objectId },
          detail: `the containing space declares no coordinate frame — the structural-orientation invariant cannot be established for ${object.objectId}`,
        }),
      );
      continue;
    }
    const up = spaceFrame.up;
    const normal = geometry.frame.normal;
    const alignment = Math.abs(dot(normal, up));
    const horizontal = object.objectClass === "FLOOR" || object.objectClass === "CEILING";
    const expected = horizontal ? 1 : 0;
    if (Math.abs(alignment - expected) > PLANE_TOLERANCE) {
      findings.push(
        makeFinding({
          code: "GEOMETRY_INVALID",
          outcome: "CONTRADICTION",
          profile,
          subject: { kind: "object", objectId: object.objectId },
          expected: horizontal
            ? `plane normal parallel to the space up axis (${vectorText(up)})`
            : `plane normal orthogonal to the space up axis (${vectorText(up)})`,
          actual: `|normal · up| = ${Number(alignment.toFixed(9))}`,
          detail: `${object.objectClass} ${object.objectId} violates the declared structural assumption: its plane is ${horizontal ? "not horizontal" : "not vertical"} in the containing space's coordinate frame`,
        }),
      );
    }
  }
  return findings;
}

// --- Openings vs host walls ------------------------------------------------------

function checkOpeningsAgainstHosts(
  view: QaView,
  profile: AssuranceProfile,
  valid: (objectId: string) => boolean,
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
    if (
      geometry === undefined ||
      host === undefined ||
      hostGeometry === undefined ||
      !valid(opening.objectId) ||
      !valid(host.objectId)
    ) {
      findings.push(
        makeFinding({
          code: "OPENING_EXCEEDS_HOST",
          outcome: "UNEVALUABLE",
          profile,
          subject: { kind: "object", objectId: opening.objectId },
          related: [{ kind: "object", objectId: hostId ?? opening.objectId }],
          detail: `the opening-vs-host dimension invariant cannot be established for ${opening.objectId} (missing or invalid opening/host geometry)`,
        }),
      );
      continue;
    }
    const openingWidthSi = lengthToSiMeters(geometry.width.value, geometry.width.unit);
    const hostWidthSi = lengthToSiMeters(hostGeometry.width.value, hostGeometry.width.unit);
    if (openingWidthSi > hostWidthSi * (1 + RELATIVE_TOLERANCE)) {
      findings.push(
        makeFinding({
          code: "OPENING_EXCEEDS_HOST",
          outcome: "CONTRADICTION",
          profile,
          subject: { kind: "object", objectId: opening.objectId },
          related: [{ kind: "object", objectId: host.objectId }],
          expected: `opening width ≤ host width (${formatQuantity(hostWidthSi, "meter")})`,
          actual: formatQuantity(openingWidthSi, "meter"),
          detail: `${opening.objectClass} ${opening.objectId} is wider than its host wall ${host.objectId}`,
        }),
      );
    }
    if (
      geometry.headHeight !== undefined &&
      hostGeometry.height !== undefined
    ) {
      const headSi = lengthToSiMeters(geometry.headHeight.value, geometry.headHeight.unit);
      const hostHeightSi = lengthToSiMeters(hostGeometry.height.value, hostGeometry.height.unit);
      if (headSi > hostHeightSi * (1 + RELATIVE_TOLERANCE)) {
        findings.push(
          makeFinding({
            code: "OPENING_EXCEEDS_HOST",
            outcome: "CONTRADICTION",
            profile,
            subject: { kind: "object", objectId: opening.objectId },
            related: [{ kind: "object", objectId: host.objectId }],
            expected: `head height ≤ host height (${formatQuantity(hostHeightSi, "meter")})`,
            actual: formatQuantity(headSi, "meter"),
            detail: `${opening.objectClass} ${opening.objectId} head height exceeds its host wall ${host.objectId} height`,
          }),
        );
      }
      // head/sill vs the opening's rectangle position, when the
      // opening lives in the host's plane with parallel axes.
      const comparability = frameComparability(geometry.frame, hostGeometry.frame);
      if (!comparability.comparable) {
        findings.push(
          makeFinding({
            code: "OPENING_MISPLACED",
            outcome: "UNEVALUABLE",
            profile,
            subject: { kind: "object", objectId: opening.objectId },
            related: [{ kind: "object", objectId: host.objectId }],
            detail: `the opening-position invariant cannot be established for ${opening.objectId}: its frame is not comparable with the host's (rotated in the host plane)`,
          }),
        );
      } else {
        const openingPosition = rectangleOffsetsInHost(geometry, hostGeometry);
        if (openingPosition !== undefined) {
          const vOffsetFromHostBottom = openingPosition.vMaxFromHostMin;
          if (!withinTolerance(headSi, vOffsetFromHostBottom)) {
            findings.push(
              makeFinding({
                code: "OPENING_MISPLACED",
                outcome: "CONTRADICTION",
                profile,
                subject: { kind: "object", objectId: opening.objectId },
                related: [{ kind: "object", objectId: host.objectId }],
                expected: `head height = rectangle top offset (${formatQuantity(vOffsetFromHostBottom, "meter")})`,
                actual: formatQuantity(headSi, "meter"),
                detail: `${opening.objectClass} ${opening.objectId} head height disagrees with its rectangle's position in host wall ${host.objectId}`,
              }),
            );
          }
          if (geometry.sillHeight !== undefined) {
            const sillSi = lengthToSiMeters(geometry.sillHeight.value, geometry.sillHeight.unit);
            const vOffsetFromHostBottomMin = openingPosition.vMinFromHostMin;
            if (!withinTolerance(sillSi, vOffsetFromHostBottomMin)) {
              findings.push(
                makeFinding({
                  code: "OPENING_MISPLACED",
                  outcome: "CONTRADICTION",
                  profile,
                  subject: { kind: "object", objectId: opening.objectId },
                  related: [{ kind: "object", objectId: host.objectId }],
                  expected: `sill height = rectangle bottom offset (${formatQuantity(vOffsetFromHostBottomMin, "meter")})`,
                  actual: formatQuantity(sillSi, "meter"),
                  detail: `window ${opening.objectId} sill height disagrees with its rectangle's position in host wall ${host.objectId}`,
                }),
              );
            }
          }
        }
      }
    }
  }
  return findings;
}

// --- Helpers ----------------------------------------------------------------------

/** The containing space's declared coordinate frame, if any. */
function containingSpaceFrame(
  view: QaView,
  objectId: string,
): { up: { x: number; y: number; z: number }; unit: "meter" | "millimeter" | "centimeter" | "inch" | "foot" } | undefined {
  const containers = view.containersOf.get(objectId) ?? [];
  if (containers.length !== 1) {
    return undefined;
  }
  const containerId = containers[0];
  if (containerId === undefined) {
    return undefined;
  }
  const space = view.spaceById.get(containerId);
  return space?.frame;
}

/** Height of a plane point along the up axis (SI metres), when defined. */
function planeHeightAlongUp(
  frame: PlaneFrame,
  spaceFrame: { up: { x: number; y: number; z: number }; unit: string },
): number | undefined {
  const up = normalize(spaceFrame.up);
  const height = dot(frame.planePoint, up);
  // Coordinates are in the space's declared unit.
  const factor = lengthFactorOf(spaceFrame.unit);
  return height * factor;
}

/** Frame comparability for in-plane comparisons. */
type FrameComparability =
  | { comparable: true; samePlane: boolean }
  | { comparable: false; samePlane: true; reason: "rotated" }
  | { comparable: false; samePlane: false; reason: "plane-mismatch" }
  | { comparable: false; samePlane: false; reason: "incomparable" };

/**
 * Determines whether two plane frames admit deterministic
 * in-plane rectangle comparison:
 *
 * - parallel normals + parallel axes + same plane → comparable;
 * - parallel normals + non-parallel axes (same plane) → rotated
 *   (incomparable for interval logic);
 * - anything else → incomparable, with plane mismatch noted.
 */
export function frameComparability(a: PlaneFrame, b: PlaneFrame): FrameComparability {
  const normalParallel = Math.abs(dot(a.normal, b.normal)) > 1 - PLANE_TOLERANCE;
  const axisUParallel = Math.abs(dot(a.axisU, b.axisU)) > 1 - PLANE_TOLERANCE;
  const axisVParallel = Math.abs(dot(a.axisV, b.axisV)) > 1 - PLANE_TOLERANCE;
  const offset = {
    x: b.planePoint.x - a.planePoint.x,
    y: b.planePoint.y - a.planePoint.y,
    z: b.planePoint.z - a.planePoint.z,
  };
  const samePlane = Math.abs(dot(offset, a.normal)) <= PLANE_TOLERANCE;
  if (!normalParallel || !axisUParallel || !axisVParallel) {
    return samePlane
      ? { comparable: false, samePlane: true, reason: "rotated" }
      : { comparable: false, samePlane: false, reason: "plane-mismatch" };
  }
  if (!samePlane) {
    return { comparable: false, samePlane: false, reason: "plane-mismatch" };
  }
  return { comparable: true, samePlane: true };
}

/** Rectangle interval positions of an opening inside its host frame. */
function rectangleOffsetsInHost(
  opening: StructuredPlanarGeometry,
  host: StructuredPlanarGeometry,
): { vMinFromHostMin: number; vMaxFromHostMin: number } | undefined {
  // Project the host's V axis onto the opening frame's axes; with
  // parallel axes both frames share (up to sign) the same axes,
  // and the projection is exact.
  const vSign = signOf(dot(host.frame.axisV, opening.frame.axisV));
  if (vSign === 0) {
    return undefined;
  }
  const hostVInOpening = (value: number): number =>
    vSign * value + dot(
      {
        x: host.frame.planePoint.x - opening.frame.planePoint.x,
        y: host.frame.planePoint.y - opening.frame.planePoint.y,
        z: host.frame.planePoint.z - opening.frame.planePoint.z,
      },
      opening.frame.axisV,
    );
  const hostVMinInOpening = hostVInOpening(vSign > 0 ? host.rectangle.vMin : host.rectangle.vMax);
  const openingVMin = opening.rectangle.vMin;
  const openingVMax = opening.rectangle.vMax;
  return {
    vMinFromHostMin: openingVMin - hostVMinInOpening,
    vMaxFromHostMin: openingVMax - hostVMinInOpening,
  };
}

function areaSiOf(geometry: StructuredPlanarGeometry): number {
  const area = geometry.area;
  switch (area.unit) {
    case "square_meter":
      return area.value;
    case "square_millimeter":
      return area.value * 1e-6;
    case "square_centimeter":
      return area.value * 1e-4;
    case "square_inch":
      return area.value * 0.0254 * 0.0254;
    case "square_foot":
      return area.value * 0.3048 * 0.3048;
    default:
      return Number.NaN;
  }
}

function lengthFactorOf(unit: string): number {
  switch (unit) {
    case "meter":
      return 1;
    case "millimeter":
      return 0.001;
    case "centimeter":
      return 0.01;
    case "inch":
      return 0.0254;
    case "foot":
      return 0.3048;
    default:
      return Number.NaN;
  }
}

function withinTolerance(actual: number, expected: number): boolean {
  if (!Number.isFinite(actual) || !Number.isFinite(expected)) {
    return false;
  }
  const scale = Math.max(Math.abs(actual), Math.abs(expected), 1);
  return Math.abs(actual - expected) <= RELATIVE_TOLERANCE * scale + 1e-12;
}

function dot(
  a: { x: number; y: number; z: number },
  b: { x: number; y: number; z: number },
): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

function normalize(v: { x: number; y: number; z: number }): { x: number; y: number; z: number } {
  const magnitude = Math.sqrt(dot(v, v));
  if (magnitude === 0) {
    return { x: 0, y: 0, z: 0 };
  }
  return { x: v.x / magnitude, y: v.y / magnitude, z: v.z / magnitude };
}

function signOf(value: number): number {
  return value > PLANE_TOLERANCE ? 1 : value < -PLANE_TOLERANCE ? -1 : 0;
}

function vectorText(v: { x: number; y: number; z: number }): string {
  return `[${Number(v.x.toFixed(6))}, ${Number(v.y.toFixed(6))}, ${Number(v.z.toFixed(6))}]`;
}

export type { RealityObject };
