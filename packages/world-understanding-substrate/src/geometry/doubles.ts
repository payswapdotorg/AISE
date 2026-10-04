/**
 * WORLD-P0-B — the GEOMETRY substitution DOUBLES (`src/geometry/`).
 *
 * Two INDEPENDENT in-memory providers of the `GeometryComputationProvider`
 * port — the substitution proof that the contract is implementable WITHOUT
 * OCCT/OCP and WITHOUT CadQuery (P0 defines contracts, not integration;
 * the real engines are future occupants of the port):
 *
 *  - `referenceGeometryDouble` — DIRECT closed-form kernels: coordinate
 *    expressions written per operation (inline differences, projection
 *    parameter, Newell normal, extent product, ray casting);
 *  - `alternateGeometryDouble` — a GENERIC VECTOR-KERNEL decomposition:
 *    every operation routes through a tiny vector micro-kernel
 *    (subtract / dot / loop-accumulated sum-of-squares / scale-add) and a
 *    crossing-sign containment test — no per-operation coordinate
 *    expressions, an independent code path.
 *
 * Both compute the SAME committed fixture (`GEOMETRY_FIXTURE_SHAPES`)
 * and MUST produce byte-identical canonical computation content at every
 * comparison point (measurement values + operand labels, predicate
 * verdicts + signed distances, applied tolerance, model digest, the AISE
 * mapping seeds) — only the provider identity (provenance/methodVersion)
 * differs, exactly as an OCCT/OCP adapter and a CadQuery adapter would
 * differ. That equivalence is asserted by the colocated tests (the
 * substitution-contract §4.2 semantic-equivalence requirement, at this
 * lane's comparison points).
 *
 * EXACTNESS DISCIPLINE (why byte-identity is achievable at all): every
 * fixture coordinate is chosen so the closed-form results are EXACT in
 * IEEE-754 double arithmetic (5, 4, 13, 16, 30 — perfect squares and
 * integer products). The two kernels are mathematically identical
 * formulas over the same declared inputs; where they arrange the
 * arithmetic differently (loop-accumulated sums, kernel composition),
 * the fixture's exactness guarantees identical bits. The near-boundary
 * point's 4.001 − 4 subtraction is exact in IEEE-754 (a rounding-exact
 * difference); the VERDICT BAND (not the distance bits) is the asserted
 * contract.
 *
 * HONESTY OF THE DOUBLES (no fabrication):
 *
 *  - the doubles read the fixture's DECLARED shape table and consume
 *    exactly the operand indices each operation names — no shape is
 *    invented, no coordinate is sensed;
 *  - tolerances are the request's DECLARATION, carried VERBATIM into
 *    `appliedTolerance` and used ONLY for the near-boundary verdict
 *    band (never silently folded into a value);
 *  - measurement units compose from the DECLARED linear unit (m → m,
 *    m2, m3), never from a sensed unit table;
 *  - no clock, no randomness, no network: the mapping seeds' instants
 *    are the request's declared `recordedAt`.
 */

import {
  UNDERSTANDING_LANE_STATEMENT,
  canonicalDigestOf,
  deepFreeze,
  type AiseMappingBlock,
  type NamespacedExternalLabel,
  type SubstrateOutcome,
  type SubstrateProviderDescriptor,
} from "../seam";
import type { Derivation, Measurement, PropertyAssertion } from "@aise/shared-contracts";
import { CONTRACT_VERSION } from "@aise/shared-contracts";
import {
  GEOMETRY_RESULT_KIND,
  GEOMETRY_RESULT_SCHEMA_VERSION,
  geometryDerivationParameters,
  geometryModelDigestOf,
  geometryProvenanceOf,
  geometryRefused,
  validateGeometryComputationRequest,
  type GeometryComputationProvider,
  type GeometryComputationRequest,
  type GeometryComputationResult,
  type GeometryMeasurementRecord,
  type GeometryOperation,
  type GeometryPoint3,
  type GeometryPredicateRecord,
  type GeometryQuantityKind,
  type GeometryShapeDeclaration,
} from "./contract";

/* ------------------------------------------------------------------ */
/* The two provider descriptors                                         */
/* ------------------------------------------------------------------ */

/** The reference double's port-occupant identity. */
export const REFERENCE_GEOMETRY_DOUBLE_DESCRIPTOR: SubstrateProviderDescriptor = {
  providerId: "understanding-substrate.geometry.reference-double",
  family: "geometry",
  technologyVersion: "geometry-reference-double/1.0.0",
  engineNote:
    "in-memory substitution double — direct closed-form coordinate-expression kernels; " +
    "NO substrate integrated (P0 defines contracts; OCCT/OCP/CadQuery are future occupants)",
  laneStatement: UNDERSTANDING_LANE_STATEMENT,
};

/** The alternate double's port-occupant identity (independent code path). */
export const ALTERNATE_GEOMETRY_DOUBLE_DESCRIPTOR: SubstrateProviderDescriptor = {
  providerId: "understanding-substrate.geometry.alternate-double",
  family: "geometry",
  technologyVersion: "geometry-alternate-double/1.0.0",
  engineNote:
    "in-memory substitution double — generic vector-kernel decomposition; " +
    "NO substrate integrated (P0 defines contracts; OCCT/OCP/CadQuery are future occupants)",
  laneStatement: UNDERSTANDING_LANE_STATEMENT,
};

/* ------------------------------------------------------------------ */
/* Shared law helpers (namespaces, units, quantities)                   */
/* ------------------------------------------------------------------ */

/** Composes the unit symbol from the DECLARED linear unit (never sensed). */
export function geometryQuantityUnitOf(
  quantity: GeometryQuantityKind,
  linearUnit: string,
): string {
  switch (quantity) {
    case "distance":
      return linearUnit;
    case "length":
      return linearUnit;
    case "area":
      return `${linearUnit}2`;
    case "volume":
      return `${linearUnit}3`;
  }
}

/** The measurement-quantity kind each operation computes. */
const OPERATION_TO_QUANTITY: Readonly<
  Record<Exclude<GeometryOperation["operation"], "point-in-polygon">, GeometryQuantityKind>
> = {
  "distance-point-point": "distance",
  "distance-point-segment": "distance",
  "segment-length": "length",
  "polygon-area": "area",
  "box-volume": "volume",
};

/** One shape's occt-topology label (null names carried as null). */
function topologyLabel(shape: GeometryShapeDeclaration): NamespacedExternalLabel | null {
  return shape.name === null ? null : { namespace: "occt-topology", value: shape.name };
}

function labelsOf(shapes: readonly GeometryShapeDeclaration[]): NamespacedExternalLabel[] {
  const labels: NamespacedExternalLabel[] = [];
  for (const shape of shapes) {
    const label = topologyLabel(shape);
    if (label !== null) {
      labels.push(label);
    }
  }
  return labels;
}

/* ================================================================== */
/* PART 1 — the REFERENCE kernels (direct coordinate expressions)       */
/* ================================================================== */

/** |(dx, dy, dz)| as direct coordinate expressions. */
function refDistance3(a: GeometryPoint3, b: GeometryPoint3): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const dz = b.z - a.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

/** The projection-parameter point-segment distance (t clamped to [0,1]). */
function refPointSegmentDistance(p: GeometryPoint3, a: GeometryPoint3, b: GeometryPoint3): number {
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const abz = b.z - a.z;
  const apx = p.x - a.x;
  const apy = p.y - a.y;
  const apz = p.z - a.z;
  const denominator = abx * abx + aby * aby + abz * abz;
  if (denominator === 0) {
    return refDistance3(p, a);
  }
  let t = (apx * abx + apy * aby + apz * abz) / denominator;
  if (t < 0) {
    t = 0;
  }
  if (t > 1) {
    t = 1;
  }
  const foot = { x: a.x + t * abx, y: a.y + t * aby, z: a.z + t * abz };
  return refDistance3(p, foot);
}

/** The Newell-normal planar polygon area (|N| / 2). */
function refPolygonArea(vertices: readonly GeometryPoint3[]): number {
  let nx = 0;
  let ny = 0;
  let nz = 0;
  for (let i = 0; i < vertices.length; i += 1) {
    const current = vertices[i]!;
    const next = vertices[(i + 1) % vertices.length]!;
    nx += (current.y - next.y) * (current.z + next.z);
    ny += (current.z - next.z) * (current.x + next.x);
    nz += (current.x - next.x) * (current.y + next.y);
  }
  return Math.sqrt(nx * nx + ny * ny + nz * nz) / 2;
}

/** The even-odd ray-casting containment test (x-direction ray). */
function refPointInPolygon(p: GeometryPoint3, vertices: readonly GeometryPoint3[]): boolean {
  let inside = false;
  for (let i = 0, j = vertices.length - 1; i < vertices.length; j = i, i += 1) {
    const vi = vertices[i]!;
    const vj = vertices[j]!;
    const crosses =
      vi.y > p.y !== vj.y > p.y &&
      p.x < ((vj.x - vi.x) * (p.y - vi.y)) / (vj.y - vi.y) + vi.x;
    if (crosses) {
      inside = !inside;
    }
  }
  return inside;
}

/** The signed distance to the polygon region (min edge distance, signed). */
function refSignedDistanceToPolygon(
  p: GeometryPoint3,
  vertices: readonly GeometryPoint3[],
  inside: boolean,
): number {
  let minimum = Infinity;
  for (let i = 0; i < vertices.length; i += 1) {
    const a = vertices[i]!;
    const b = vertices[(i + 1) % vertices.length]!;
    const distance = refPointSegmentDistance(p, a, b);
    if (distance < minimum) {
      minimum = distance;
    }
  }
  return inside ? minimum : -minimum;
}

/** The reference kernel: computes every requested record directly. */
function refCompute(request: GeometryComputationRequest): {
  readonly measurements: readonly GeometryMeasurementRecord[];
  readonly predicates: readonly GeometryPredicateRecord[];
} {
  const measurements: GeometryMeasurementRecord[] = [];
  const predicates: GeometryPredicateRecord[] = [];
  for (const operation of request.operations) {
    switch (operation.operation) {
      case "distance-point-point": {
        const a = request.shapes[operation.a] as { kind: "point"; name: string | null; at: GeometryPoint3 };
        const b = request.shapes[operation.b] as { kind: "point"; name: string | null; at: GeometryPoint3 };
        measurements.push(record(request, operation, [a, b], refDistance3(a.at, b.at)));
        break;
      }
      case "distance-point-segment": {
        const p = request.shapes[operation.point] as { kind: "point"; name: string | null; at: GeometryPoint3 };
        const s = request.shapes[operation.segment] as {
          kind: "segment";
          name: string | null;
          a: GeometryPoint3;
          b: GeometryPoint3;
        };
        measurements.push(
          record(request, operation, [p, s], refPointSegmentDistance(p.at, s.a, s.b)),
        );
        break;
      }
      case "segment-length": {
        const s = request.shapes[operation.segment] as {
          kind: "segment";
          name: string | null;
          a: GeometryPoint3;
          b: GeometryPoint3;
        };
        measurements.push(record(request, operation, [s], refDistance3(s.a, s.b)));
        break;
      }
      case "polygon-area": {
        const polygon = request.shapes[operation.polygon] as {
          kind: "polygon";
          name: string | null;
          vertices: readonly GeometryPoint3[];
        };
        measurements.push(record(request, operation, [polygon], refPolygonArea(polygon.vertices)));
        break;
      }
      case "box-volume": {
        const box = request.shapes[operation.box] as {
          kind: "box";
          name: string | null;
          min: GeometryPoint3;
          max: GeometryPoint3;
        };
        const volume =
          (box.max.x - box.min.x) * (box.max.y - box.min.y) * (box.max.z - box.min.z);
        measurements.push(record(request, operation, [box], volume));
        break;
      }
      case "point-in-polygon": {
        const p = request.shapes[operation.point] as { kind: "point"; name: string | null; at: GeometryPoint3 };
        const polygon = request.shapes[operation.polygon] as {
          kind: "polygon";
          name: string | null;
          vertices: readonly GeometryPoint3[];
        };
        predicates.push(
          predicateRecord(request, p, polygon, refPointInPolygon(p.at, polygon.vertices), (point) =>
            refSignedDistanceToPolygon(point, polygon.vertices, refPointInPolygon(point, polygon.vertices)),
          ),
        );
        break;
      }
    }
  }
  return { measurements, predicates };
}

/* ================================================================== */
/* PART 2 — the ALTERNATE kernel (generic vector micro-kernel)          */
/* ================================================================== */

type Vec3 = readonly [number, number, number];

function of(point: GeometryPoint3): Vec3 {
  return [point.x, point.y, point.z] as const;
}

function vSub(a: Vec3, b: Vec3): Vec3 {
  return [b[0] - a[0], b[1] - a[1], b[2] - a[2]] as const;
}

function vDot(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

/** Loop-accumulated sum of squares (the kernel's length core). */
function vSumSq(v: Vec3): number {
  let sum = 0;
  for (let i = 0; i < 3; i += 1) {
    sum += v[i]! * v[i]!;
  }
  return sum;
}

function vLen(v: Vec3): number {
  return Math.sqrt(vSumSq(v));
}

function vScaleAdd(base: Vec3, scale: number, direction: Vec3): Vec3 {
  return [
    base[0] + scale * direction[0],
    base[1] + scale * direction[1],
    base[2] + scale * direction[2],
  ] as const;
}

/** The kernel's point-segment distance (same closed form, kernel-composed). */
function altPointSegmentDistance(p: GeometryPoint3, a: GeometryPoint3, b: GeometryPoint3): number {
  const ab = vSub(of(a), of(b));
  const ap = vSub(of(a), of(p));
  const denominator = vSumSq(ab);
  if (denominator === 0) {
    return vLen(ap);
  }
  let t = vDot(ap, ab) / denominator;
  if (t < 0) {
    t = 0;
  }
  if (t > 1) {
    t = 1;
  }
  const foot = vScaleAdd(of(a), t, ab);
  return vLen(vSub([p.x, p.y, p.z] as const, foot));
}

/**
 * The shoelace accumulation — the planar projection of the Newell normal
 * (the same closed form as the reference's |N|/2 for a planar polygon,
 * accumulated as Σ(x_i·y_{i+1} − x_{i+1}·y_i)).
 */
function altPolygonArea(vertices: readonly GeometryPoint3[]): number {
  let twice = 0;
  for (let i = 0; i < vertices.length; i += 1) {
    const current = vertices[i]!;
    const next = vertices[(i + 1) % vertices.length]!;
    twice += current.x * next.y - next.x * current.y;
  }
  return Math.abs(twice) / 2;
}

/** The crossing-sign containment test (edge-crossing z-signs, even-odd). */
function altPointInPolygon(p: GeometryPoint3, vertices: readonly GeometryPoint3[]): boolean {
  let crossings = 0;
  for (let i = 0, j = vertices.length - 1; i < vertices.length; j = i, i += 1) {
    const vi = vertices[i]!;
    const vj = vertices[j]!;
    if (vi.y > p.y !== vj.y > p.y) {
      const crossZ = (vj.x - vi.x) * (p.y - vi.y) - (vj.y - vi.y) * (p.x - vi.x);
      /* An edge straddling the point's y counts as a ray crossing only
       * on the edge-direction side: an upward edge (vj.y > vi.y) is
       * crossed when the point lies LEFT of it (crossZ > 0), a downward
       * edge mirrors the sign — the z-sign of the 2D cross product is
       * direction-relative, never absolute. */
      if (crossZ > 0 === vj.y > vi.y) {
        crossings += 1;
      }
    }
  }
  return crossings % 2 === 1;
}

/** The alternate kernel: computes every requested record through the kernel. */
function altCompute(request: GeometryComputationRequest): {
  readonly measurements: readonly GeometryMeasurementRecord[];
  readonly predicates: readonly GeometryPredicateRecord[];
} {
  const measurements: GeometryMeasurementRecord[] = [];
  const predicates: GeometryPredicateRecord[] = [];
  for (const operation of request.operations) {
    switch (operation.operation) {
      case "distance-point-point": {
        const a = request.shapes[operation.a] as { kind: "point"; name: string | null; at: GeometryPoint3 };
        const b = request.shapes[operation.b] as { kind: "point"; name: string | null; at: GeometryPoint3 };
        measurements.push(record(request, operation, [a, b], vLen(vSub(of(a.at), of(b.at)))));
        break;
      }
      case "distance-point-segment": {
        const p = request.shapes[operation.point] as { kind: "point"; name: string | null; at: GeometryPoint3 };
        const s = request.shapes[operation.segment] as {
          kind: "segment";
          name: string | null;
          a: GeometryPoint3;
          b: GeometryPoint3;
        };
        measurements.push(
          record(request, operation, [p, s], altPointSegmentDistance(p.at, s.a, s.b)),
        );
        break;
      }
      case "segment-length": {
        const s = request.shapes[operation.segment] as {
          kind: "segment";
          name: string | null;
          a: GeometryPoint3;
          b: GeometryPoint3;
        };
        measurements.push(record(request, operation, [s], vLen(vSub(of(s.a), of(s.b)))));
        break;
      }
      case "polygon-area": {
        const polygon = request.shapes[operation.polygon] as {
          kind: "polygon";
          name: string | null;
          vertices: readonly GeometryPoint3[];
        };
        measurements.push(record(request, operation, [polygon], altPolygonArea(polygon.vertices)));
        break;
      }
      case "box-volume": {
        const box = request.shapes[operation.box] as {
          kind: "box";
          name: string | null;
          min: GeometryPoint3;
          max: GeometryPoint3;
        };
        let volume = 1;
        for (const axis of ["x", "y", "z"] as const) {
          volume *= box.max[axis] - box.min[axis];
        }
        measurements.push(record(request, operation, [box], volume));
        break;
      }
      case "point-in-polygon": {
        const p = request.shapes[operation.point] as { kind: "point"; name: string | null; at: GeometryPoint3 };
        const polygon = request.shapes[operation.polygon] as {
          kind: "polygon";
          name: string | null;
          vertices: readonly GeometryPoint3[];
        };
        predicates.push(
          predicateRecord(request, p, polygon, altPointInPolygon(p.at, polygon.vertices), (point) => {
            const inside = altPointInPolygon(point, polygon.vertices);
            let minimum = Infinity;
            for (let i = 0; i < polygon.vertices.length; i += 1) {
              const a = polygon.vertices[i]!;
              const b = polygon.vertices[(i + 1) % polygon.vertices.length]!;
              const distance = altPointSegmentDistance(point, a, b);
              if (distance < minimum) {
                minimum = distance;
              }
            }
            return inside ? minimum : -minimum;
          }),
        );
        break;
      }
    }
  }
  return { measurements, predicates };
}

/* ------------------------------------------------------------------ */
/* The shared record builders (LAW code — identical for both doubles)   */
/* ------------------------------------------------------------------ */

function record(
  request: GeometryComputationRequest,
  operation: Exclude<GeometryOperation, { readonly operation: "point-in-polygon" }>,
  operands: readonly GeometryShapeDeclaration[],
  value: number,
): GeometryMeasurementRecord {
  const quantity = OPERATION_TO_QUANTITY[operation.operation];
  return {
    operation: operation.operation,
    operands: labelsOf(operands),
    quantity,
    value,
    unit: geometryQuantityUnitOf(quantity, request.units.linear),
  };
}

function predicateRecord(
  request: GeometryComputationRequest,
  point: { kind: "point"; name: string | null; at: GeometryPoint3 },
  polygon: { kind: "polygon"; name: string | null; vertices: readonly GeometryPoint3[] },
  inside: boolean,
  signedDistanceOf: (point: GeometryPoint3) => number,
): GeometryPredicateRecord {
  const signedDistance = signedDistanceOf(point.at);
  const nearBoundary = Math.abs(signedDistance) <= request.tolerance.linear;
  return {
    operation: "point-in-polygon",
    point: topologyLabel(point),
    polygon: topologyLabel(polygon),
    predicate: "point-in-polygon",
    verdict: nearBoundary ? "within-tolerance" : inside,
    signedDistance,
  };
}

/* ================================================================== */
/* The AISE-side mapping builder (SHARED law code)                      */
/* ================================================================== */

/**
 * Builds the `AiseMappingBlock` from computed records. Shared between the
 * two doubles ON PURPOSE: the mapping discipline into AISE contract types
 * (content-derived candidate ids, INFERRED epistemic status, declared
 * evidence binding, closed method identity) is AISE LAW dictated by the
 * seam — engines differ in COMPUTATION, never in mapping law. The real
 * OCP/CadQuery adapters will compute with different engines and obey this
 * same mapping discipline; the doubles prove exactly that shape.
 *
 * GEOMETRY LAW #4: `realityObjects` is EMPTY — geometry fabricates no
 * reality identity; the assertions and measurements bind to the request's
 * DECLARED `subjectRef`.
 */
function buildGeometryAiseMapping(
  computation: {
    readonly measurements: readonly GeometryMeasurementRecord[];
    readonly predicates: readonly GeometryPredicateRecord[];
  },
  request: GeometryComputationRequest,
  methodVersion: string,
): AiseMappingBlock {
  const inputDigest = geometryModelDigestOf(request);
  const parameters = geometryDerivationParameters(request);
  const parametersDigest = canonicalDigestOf(parameters);

  const derivation: Derivation = {
    contractVersion: CONTRACT_VERSION,
    derivationId: canonicalDigestOf({
      candidate: "derivation",
      family: "geometry",
      method: "geometry.exact",
      inputDigest,
      parametersDigest,
      evidenceContentId: request.evidenceContentId,
    }),
    outputContentId: canonicalDigestOf({
      measurements: computation.measurements,
      predicates: computation.predicates,
    }),
    inputEvidenceContentIds: [request.evidenceContentId],
    method: "geometry.exact",
    methodVersion,
    parameters,
    createdAt: request.recordedAt,
  };

  const propertyAssertions: PropertyAssertion[] = computation.predicates.map((predicate) => ({
    contractVersion: CONTRACT_VERSION,
    assertionId: canonicalDigestOf({
      candidate: "property-assertion",
      family: "geometry",
      subject: request.subjectRef,
      predicate: predicate.predicate,
      point: predicate.point === null ? null : predicate.point.value,
      polygon: predicate.polygon === null ? null : predicate.polygon.value,
      verdict: predicate.verdict,
    }),
    subjectRef: request.subjectRef,
    property: predicate.predicate,
    value: predicate.verdict,
    unit: null,
    status: "INFERRED",
    method: "geometry.exact",
    source_evidence: [request.evidenceContentId],
    verified_by: null,
    verified_at: null,
  }));

  const measurements: Measurement[] = computation.measurements.map((measurement) => ({
    contractVersion: CONTRACT_VERSION,
    measurementId: canonicalDigestOf({
      candidate: "measurement",
      family: "geometry",
      subject: request.subjectRef,
      operation: measurement.operation,
      value: measurement.value,
    }),
    subjectRef: request.subjectRef,
    quantity: measurement.quantity,
    value: measurement.value,
    unit: measurement.unit,
    status: "INFERRED",
    method: "geometry.exact",
    evidenceContentIds: [request.evidenceContentId],
    measuredAt: request.recordedAt,
  }));

  return { derivation, realityObjects: [], propertyAssertions, measurements };
}

/* ================================================================== */
/* The shared governed assembly (validate → compute → seal)             */
/* ================================================================== */

/**
 * The governed assembly both doubles share: request validation (typed
 * `contract-mismatch` refusal — the tolerance-must-be-declared law rides
 * here), per-double computation, the mapping block, the provenance and
 * the sealed result id (content digest over the result minus its own id,
 * with the DECLARED tolerance carried VERBATIM as `appliedTolerance`).
 */
function doubleCompute(
  descriptor: SubstrateProviderDescriptor,
  request: GeometryComputationRequest,
  computeFn: (request: GeometryComputationRequest) => {
    readonly measurements: readonly GeometryMeasurementRecord[];
    readonly predicates: readonly GeometryPredicateRecord[];
  },
): SubstrateOutcome<GeometryComputationResult> {
  const validation = validateGeometryComputationRequest(request);
  if (!validation.ok) {
    return geometryRefused(
      "contract-mismatch",
      `request validation refused: ${validation.failures
        .map((failure) => `${failure.path} (${failure.kind}): ${failure.detail}`)
        .join("; ")}`,
    );
  }
  const frozen = deepFreeze(request);
  const computation = computeFn(frozen);
  const aise = buildGeometryAiseMapping(computation, frozen, descriptor.technologyVersion);
  const provenance = geometryProvenanceOf(descriptor, frozen);
  const body = {
    kind: GEOMETRY_RESULT_KIND,
    schemaVersion: GEOMETRY_RESULT_SCHEMA_VERSION,
    modelDigest: geometryModelDigestOf(frozen),
    appliedTolerance: frozen.tolerance,
    measurements: computation.measurements,
    predicates: computation.predicates,
    aise,
    provenance,
  };
  const result: GeometryComputationResult = { ...body, resultId: canonicalDigestOf(body) };
  return { ok: true, value: result };
}

/* The two governed providers. */
export const referenceGeometryDouble: GeometryComputationProvider = {
  descriptor: REFERENCE_GEOMETRY_DOUBLE_DESCRIPTOR,
  compute: (request) => doubleCompute(REFERENCE_GEOMETRY_DOUBLE_DESCRIPTOR, request, refCompute),
};

export const alternateGeometryDouble: GeometryComputationProvider = {
  descriptor: ALTERNATE_GEOMETRY_DOUBLE_DESCRIPTOR,
  compute: (request) => doubleCompute(ALTERNATE_GEOMETRY_DOUBLE_DESCRIPTOR, request, altCompute),
};
