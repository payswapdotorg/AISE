/**
 * WORLD-P0-B — the FIELD substitution DOUBLES (`src/field/`).
 *
 * Two INDEPENDENT in-memory providers of the `FieldComputationProvider`
 * port — the substitution proof that the contract is implementable
 * WITHOUT ParaView/VTK (P0 defines contracts, not integration; the real
 * engines are future occupants of the port):
 *
 *  - `referenceFieldDouble` — DIRECT closed-form discrete kernels:
 *    per-operation expressions written directly (single-pass min/max,
 *    loop sum over count, loop-accumulated absolute sum, the direct
 *    sqrt(u²+v²), the centered-difference quotient, the per-cell
 *    corner-average integral);
 *  - `alternateFieldDouble` — a GENERIC ARRAY-KERNEL decomposition:
 *    every operation routes through a tiny fold/tree micro-kernel
 *    (pairwise tree sum, spread min/max, map-reduce abs, Math.hypot,
 *    kernel-composed difference quotients, the composite edge-weight
 *    trapezoid) — no per-operation loop shapes, an independent code
 *    path.
 *
 * Both compute the SAME committed fixture (`FIELD_FIXTURE_GRID` +
 * `FIELD_FIXTURE_SCALAR_FIELD` + `FIELD_FIXTURE_VECTOR_FIELD`) and MUST
 * produce byte-identical canonical computation content at every
 * comparison point (measurement values + operand labels, predicate
 * verdicts + signed margins, applied tolerance, model digest, the AISE
 * mapping seeds) — only the provider identity
 * (provenance/methodVersion) differs, exactly as a VTK filter-chain
 * adapter and a hand-rolled array adapter would differ. That
 * equivalence is asserted by the colocated tests (the
 * substitution-contract §4.2 semantic-equivalence requirement, at this
 * lane's comparison points).
 *
 * EXACTNESS DISCIPLINE (why byte-identity is achievable at all): every
 * fixture sample is an integer and every derived quantity composes by
 * sums, differences, products and dyadic divisions (halves, quarters)
 * — all EXACT in IEEE-754 double arithmetic. Where the two kernels
 * arrange the arithmetic differently (tree vs sequential sums,
 * per-cell vs edge-weight trapezoid, sqrt(u²+v²) vs Math.hypot), the
 * fixture's exactness guarantees identical bits: sequential 0+3+6+4+7
 * +10+8+11+14 and every pairwise tree arrangement both accumulate the
 * exact integer 63; Math.hypot(4,3) and Math.sqrt(4*4+3*3) both return
 * the exact 5; ¼-corner/½-edge/1-interior weights and per-cell
 * corner-averages both total the exact 28. The near-threshold probe's
 * 6 − 5.999 subtraction is the one rounding-sensitive input — the
 * VERDICT BAND (not the margin bits) is the asserted contract there.
 *
 * HONESTY OF THE DOUBLES (no fabrication):
 *
 *  - the doubles read the fixture's DECLARED grid and sample tables and
 *    consume exactly the node indices each operation names — no sample
 *    is invented, no value is sensed, no layout is guessed;
 *  - tolerances are the request's DECLARATION, carried VERBATIM into
 *    `appliedTolerance` and used ONLY for the near-threshold verdict
 *    band (never silently folded into a value);
 *  - derived units compose from the DECLARED value/coordinate units
 *    (K, K/m, K/m2, K.m2), never from a sensed unit table;
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
  FIELD_RESULT_KIND,
  FIELD_RESULT_SCHEMA_VERSION,
  fieldDerivationParameters,
  fieldModelDigestOf,
  fieldProvenanceOf,
  fieldRefused,
  validateFieldComputationRequest,
  type FieldComputationProvider,
  type FieldComputationRequest,
  type FieldComputationResult,
  type FieldMeasurementRecord,
  type FieldOperation,
  type FieldPredicateRecord,
  type FieldQuantityKind,
  type FieldVector2,
} from "./contract";

/* ------------------------------------------------------------------ */
/* The two provider descriptors                                         */
/* ------------------------------------------------------------------ */

/** The reference double's port-occupant identity. */
export const REFERENCE_FIELD_DOUBLE_DESCRIPTOR: SubstrateProviderDescriptor = {
  providerId: "understanding-substrate.field.reference-double",
  family: "field",
  technologyVersion: "field-reference-double/1.0.0",
  engineNote:
    "in-memory substitution double — direct closed-form discrete kernels; " +
    "NO substrate integrated (P0 defines contracts; ParaView/VTK are future occupants)",
  laneStatement: UNDERSTANDING_LANE_STATEMENT,
};

/** The alternate double's port-occupant identity (independent code path). */
export const ALTERNATE_FIELD_DOUBLE_DESCRIPTOR: SubstrateProviderDescriptor = {
  providerId: "understanding-substrate.field.alternate-double",
  family: "field",
  technologyVersion: "field-alternate-double/1.0.0",
  engineNote:
    "in-memory substitution double — generic array-kernel decomposition; " +
    "NO substrate integrated (P0 defines contracts; ParaView/VTK are future occupants)",
  laneStatement: UNDERSTANDING_LANE_STATEMENT,
};

/* ------------------------------------------------------------------ */
/* Shared law helpers (labels, units, quantities)                        */
/* ------------------------------------------------------------------ */

/** Composes the unit symbol from the DECLARED units (never sensed). */
export function fieldQuantityUnitOf(
  quantity: FieldQuantityKind,
  units: { readonly value: string; readonly coordinate: string },
): string {
  switch (quantity) {
    case "extent":
      return units.value;
    case "mean":
      return units.value;
    case "norm":
      return units.value;
    case "magnitude":
      return `${units.value}/${units.coordinate}`;
    case "divergence":
      return `${units.value}/${units.coordinate}2`;
    case "integral":
      return `${units.value}.${units.coordinate}2`;
  }
}

/** The measurement-quantity kind each operation computes. */
const OPERATION_TO_QUANTITY: Readonly<
  Record<Exclude<FieldOperation["operation"], "field-above-threshold">, FieldQuantityKind>
> = {
  "field-extent": "extent",
  "field-mean": "mean",
  "field-norm-l1": "norm",
  "field-vector-magnitude": "magnitude",
  "field-divergence": "divergence",
  "field-integral": "integral",
};

/** One VTK data-object label (null names carried as null). */
function dataObjectLabel(name: string | null): NamespacedExternalLabel | null {
  return name === null ? null : { namespace: "vtk-dataobject", value: name };
}

function labelsOf(labels: readonly (NamespacedExternalLabel | null)[]): NamespacedExternalLabel[] {
  const out: NamespacedExternalLabel[] = [];
  for (const label of labels) {
    if (label !== null) {
      out.push(label);
    }
  }
  return out;
}

/** One grid node's label (`<grid-name>/node-<i>`, null grid name → null). */
function nodeLabelOf(grid: { readonly name: string | null }, index: number): NamespacedExternalLabel | null {
  return grid.name === null ? null : { namespace: "vtk-dataobject", value: `${grid.name}/node-${index}` };
}

/* ================================================================== */
/* PART 1 — the REFERENCE kernels (direct discrete expressions)         */
/* ================================================================== */

/** max − min in a single pass over the scalar samples. */
function refExtent(values: readonly number[]): number {
  let minimum = Infinity;
  let maximum = -Infinity;
  for (const value of values) {
    if (value < minimum) {
      minimum = value;
    }
    if (value > maximum) {
      maximum = value;
    }
  }
  return maximum - minimum;
}

/** The arithmetic mean: loop sum, then divide by the count. */
function refMean(values: readonly number[]): number {
  let sum = 0;
  for (const value of values) {
    sum += value;
  }
  return sum / values.length;
}

/** Σ|v| as a loop-accumulated absolute sum. */
function refNormL1(values: readonly number[]): number {
  let sum = 0;
  for (const value of values) {
    sum += Math.abs(value);
  }
  return sum;
}

/** |(u,v)| = sqrt(u² + v²), written directly. */
function refMagnitude(sample: FieldVector2): number {
  return Math.sqrt(sample.u * sample.u + sample.v * sample.v);
}

/** The centered-difference divergence at an interior node (law #5). */
function refDivergence(
  samples: readonly FieldVector2[],
  node: number,
  spacing: { readonly x: number; readonly y: number },
  nx: number,
): number {
  const du = (samples[node + 1]!.u - samples[node - 1]!.u) / (2 * spacing.x);
  const dv = (samples[node + nx]!.v - samples[node - nx]!.v) / (2 * spacing.y);
  return du + dv;
}

/** The per-cell corner-average trapezoidal integral over the domain. */
function refIntegral(
  values: readonly number[],
  nx: number,
  ny: number,
  spacing: { readonly x: number; readonly y: number },
): number {
  const cellArea = spacing.x * spacing.y;
  let total = 0;
  for (let y = 0; y < ny - 1; y += 1) {
    for (let x = 0; x < nx - 1; x += 1) {
      const i00 = y * nx + x;
      const i10 = i00 + 1;
      const i01 = i00 + nx;
      const i11 = i10 + nx;
      const cornerAverage = (values[i00]! + values[i10]! + values[i01]! + values[i11]!) / 4;
      total += cornerAverage * cellArea;
    }
  }
  return total;
}

/** The reference kernel: computes every requested record directly. */
function refCompute(request: FieldComputationRequest): {
  readonly measurements: readonly FieldMeasurementRecord[];
  readonly predicates: readonly FieldPredicateRecord[];
} {
  const measurements: FieldMeasurementRecord[] = [];
  const predicates: FieldPredicateRecord[] = [];
  const scalarLabel = dataObjectLabel(request.scalarField.name);
  const vectorLabel = dataObjectLabel(request.vectorField.name);
  for (const operation of request.operations) {
    switch (operation.operation) {
      case "field-extent": {
        measurements.push(
          record(request, operation, [scalarLabel], refExtent(request.scalarField.values)),
        );
        break;
      }
      case "field-mean": {
        measurements.push(
          record(request, operation, [scalarLabel], refMean(request.scalarField.values)),
        );
        break;
      }
      case "field-norm-l1": {
        measurements.push(
          record(request, operation, [scalarLabel], refNormL1(request.scalarField.values)),
        );
        break;
      }
      case "field-vector-magnitude": {
        const sample = request.vectorField.samples[operation.node]!;
        measurements.push(
          record(request, operation, [vectorLabel], refMagnitude(sample)),
        );
        break;
      }
      case "field-divergence": {
        measurements.push(
          record(
            request,
            operation,
            [vectorLabel],
            refDivergence(
              request.vectorField.samples,
              operation.node,
              request.grid.spacing,
              request.grid.nx,
            ),
          ),
        );
        break;
      }
      case "field-integral": {
        measurements.push(
          record(
            request,
            operation,
            [scalarLabel],
            refIntegral(
              request.scalarField.values,
              request.grid.nx,
              request.grid.ny,
              request.grid.spacing,
            ),
          ),
        );
        break;
      }
      case "field-above-threshold": {
        predicates.push(
          predicateRecord(request, operation, scalarLabel, request.scalarField.values[operation.node]!),
        );
        break;
      }
    }
  }
  return { measurements, predicates };
}

/* ================================================================== */
/* PART 2 — the ALTERNATE kernel (generic array-kernel decomposition)   */
/* ================================================================== */

/** Pairwise tree sum: the kernel's accumulation core (any arrangement). */
function treeSum(values: readonly number[]): number {
  if (values.length === 0) {
    return 0;
  }
  if (values.length === 1) {
    return values[0]!;
  }
  const half = Math.floor(values.length / 2);
  return treeSum(values.slice(0, half)) + treeSum(values.slice(half));
}

/** Extent via the spread min / spread max kernels (two full passes). */
function altExtent(values: readonly number[]): number {
  return Math.max(...values) - Math.min(...values);
}

/** Mean via the tree-sum kernel. */
function altMean(values: readonly number[]): number {
  return treeSum(values) / values.length;
}

/** Σ|v| via map-then-reduce (abs composed into the fold). */
function altNormL1(values: readonly number[]): number {
  return values.map(Math.abs).reduce((left, right) => left + right, 0);
}

/** |(u,v)| via Math.hypot (the scaled-magnitude kernel — a different path). */
function altMagnitude(sample: FieldVector2): number {
  return Math.hypot(sample.u, sample.v);
}

function altDifference(a: number, b: number): number {
  return b - a;
}

function altQuotient(numerator: number, denominator: number): number {
  return numerator * (1 / denominator);
}

/** The kernel-composed centered-difference divergence. */
function altDivergence(
  samples: readonly FieldVector2[],
  node: number,
  spacing: { readonly x: number; readonly y: number },
  nx: number,
): number {
  const du = altQuotient(
    altDifference(samples[node - 1]!.u, samples[node + 1]!.u),
    2 * spacing.x,
  );
  const dv = altQuotient(
    altDifference(samples[node - nx]!.v, samples[node + nx]!.v),
    2 * spacing.y,
  );
  return du + dv;
}

/** The 1D composite-trapezoid node weight (½ endpoints, 1 interior). */
function trapazoidWeight(index: number, count: number): number {
  return index === 0 || index === count - 1 ? 0.5 : 1;
}

/** The composite edge-weight trapezoidal integral (wx·wy weights). */
function altIntegral(
  values: readonly number[],
  nx: number,
  ny: number,
  spacing: { readonly x: number; readonly y: number },
): number {
  const cellArea = spacing.x * spacing.y;
  let total = 0;
  for (let y = 0; y < ny; y += 1) {
    for (let x = 0; x < nx; x += 1) {
      const weight = trapazoidWeight(x, nx) * trapazoidWeight(y, ny);
      total += values[y * nx + x]! * weight;
    }
  }
  return total * cellArea;
}

/** The alternate kernel: computes every requested record through the kernels. */
function altCompute(request: FieldComputationRequest): {
  readonly measurements: readonly FieldMeasurementRecord[];
  readonly predicates: readonly FieldPredicateRecord[];
} {
  const measurements: FieldMeasurementRecord[] = [];
  const predicates: FieldPredicateRecord[] = [];
  const scalarLabel = dataObjectLabel(request.scalarField.name);
  const vectorLabel = dataObjectLabel(request.vectorField.name);
  for (const operation of request.operations) {
    switch (operation.operation) {
      case "field-extent": {
        measurements.push(
          record(request, operation, [scalarLabel], altExtent(request.scalarField.values)),
        );
        break;
      }
      case "field-mean": {
        measurements.push(
          record(request, operation, [scalarLabel], altMean(request.scalarField.values)),
        );
        break;
      }
      case "field-norm-l1": {
        measurements.push(
          record(request, operation, [scalarLabel], altNormL1(request.scalarField.values)),
        );
        break;
      }
      case "field-vector-magnitude": {
        const sample = request.vectorField.samples[operation.node]!;
        measurements.push(
          record(request, operation, [vectorLabel], altMagnitude(sample)),
        );
        break;
      }
      case "field-divergence": {
        measurements.push(
          record(
            request,
            operation,
            [vectorLabel],
            altDivergence(
              request.vectorField.samples,
              operation.node,
              request.grid.spacing,
              request.grid.nx,
            ),
          ),
        );
        break;
      }
      case "field-integral": {
        measurements.push(
          record(
            request,
            operation,
            [scalarLabel],
            altIntegral(
              request.scalarField.values,
              request.grid.nx,
              request.grid.ny,
              request.grid.spacing,
            ),
          ),
        );
        break;
      }
      case "field-above-threshold": {
        predicates.push(
          predicateRecord(request, operation, scalarLabel, request.scalarField.values[operation.node]!),
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
  request: FieldComputationRequest,
  operation: Exclude<FieldOperation, { readonly operation: "field-above-threshold" }>,
  operands: readonly (NamespacedExternalLabel | null)[],
  value: number,
): FieldMeasurementRecord {
  const quantity = OPERATION_TO_QUANTITY[operation.operation];
  return {
    operation: operation.operation,
    operands: labelsOf(operands),
    quantity,
    value,
    unit: fieldQuantityUnitOf(quantity, request.units),
  };
}

function predicateRecord(
  request: FieldComputationRequest,
  operation: Extract<FieldOperation, { readonly operation: "field-above-threshold" }>,
  fieldLabel: NamespacedExternalLabel | null,
  value: number,
): FieldPredicateRecord {
  const signedMargin = value - operation.threshold;
  const nearThreshold = Math.abs(signedMargin) <= request.tolerance.value;
  return {
    operation: "field-above-threshold",
    node: nodeLabelOf(request.grid, operation.node),
    field: fieldLabel,
    predicate: "field-above-threshold",
    verdict: nearThreshold ? "within-tolerance" : value >= operation.threshold,
    signedMargin,
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
 * VTK adapters will compute with different engines and obey this same
 * mapping discipline; the doubles prove exactly that shape.
 *
 * FIELD LAW #6: `realityObjects` is EMPTY — field fabricates no reality
 * identity; the assertions and measurements bind to the request's
 * DECLARED `subjectRef`.
 */
function buildFieldAiseMapping(
  computation: {
    readonly measurements: readonly FieldMeasurementRecord[];
    readonly predicates: readonly FieldPredicateRecord[];
  },
  request: FieldComputationRequest,
  methodVersion: string,
): AiseMappingBlock {
  const inputDigest = fieldModelDigestOf(request);
  const parameters = fieldDerivationParameters(request);
  const parametersDigest = canonicalDigestOf(parameters);

  const derivation: Derivation = {
    contractVersion: CONTRACT_VERSION,
    derivationId: canonicalDigestOf({
      candidate: "derivation",
      family: "field",
      method: "field.scientific",
      inputDigest,
      parametersDigest,
      evidenceContentId: request.evidenceContentId,
    }),
    outputContentId: canonicalDigestOf({
      measurements: computation.measurements,
      predicates: computation.predicates,
    }),
    inputEvidenceContentIds: [request.evidenceContentId],
    method: "field.scientific",
    methodVersion,
    parameters,
    createdAt: request.recordedAt,
  };

  const propertyAssertions: PropertyAssertion[] = computation.predicates.map((predicate) => ({
    contractVersion: CONTRACT_VERSION,
    assertionId: canonicalDigestOf({
      candidate: "property-assertion",
      family: "field",
      subject: request.subjectRef,
      predicate: predicate.predicate,
      node: predicate.node === null ? null : predicate.node.value,
      field: predicate.field === null ? null : predicate.field.value,
      verdict: predicate.verdict,
    }),
    subjectRef: request.subjectRef,
    property: predicate.predicate,
    value: predicate.verdict,
    unit: null,
    status: "INFERRED",
    method: "field.scientific",
    source_evidence: [request.evidenceContentId],
    verified_by: null,
    verified_at: null,
  }));

  const measurements: Measurement[] = computation.measurements.map((measurement) => ({
    contractVersion: CONTRACT_VERSION,
    measurementId: canonicalDigestOf({
      candidate: "measurement",
      family: "field",
      subject: request.subjectRef,
      operation: measurement.operation,
      value: measurement.value,
    }),
    subjectRef: request.subjectRef,
    quantity: measurement.quantity,
    value: measurement.value,
    unit: measurement.unit,
    status: "INFERRED",
    method: "field.scientific",
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
 * `contract-mismatch` refusal — the tolerance-must-be-declared and
 * sample-count-must-match laws ride here), per-double computation, the
 * mapping block, the provenance and the sealed result id (content
 * digest over the result minus its own id, with the DECLARED tolerance
 * carried VERBATIM as `appliedTolerance`).
 */
function doubleCompute(
  descriptor: SubstrateProviderDescriptor,
  request: FieldComputationRequest,
  computeFn: (request: FieldComputationRequest) => {
    readonly measurements: readonly FieldMeasurementRecord[];
    readonly predicates: readonly FieldPredicateRecord[];
  },
): SubstrateOutcome<FieldComputationResult> {
  const validation = validateFieldComputationRequest(request);
  if (!validation.ok) {
    return fieldRefused(
      "contract-mismatch",
      `request validation refused: ${validation.failures
        .map((failure) => `${failure.path} (${failure.kind}): ${failure.detail}`)
        .join("; ")}`,
    );
  }
  const frozen = deepFreeze(request);
  const computation = computeFn(frozen);
  const aise = buildFieldAiseMapping(computation, frozen, descriptor.technologyVersion);
  const provenance = fieldProvenanceOf(descriptor, frozen);
  const body = {
    kind: FIELD_RESULT_KIND,
    schemaVersion: FIELD_RESULT_SCHEMA_VERSION,
    modelDigest: fieldModelDigestOf(frozen),
    appliedTolerance: frozen.tolerance,
    measurements: computation.measurements,
    predicates: computation.predicates,
    aise,
    provenance,
  };
  const result: FieldComputationResult = { ...body, resultId: canonicalDigestOf(body) };
  return { ok: true, value: result };
}

/* The two governed providers. */
export const referenceFieldDouble: FieldComputationProvider = {
  descriptor: REFERENCE_FIELD_DOUBLE_DESCRIPTOR,
  compute: (request) => doubleCompute(REFERENCE_FIELD_DOUBLE_DESCRIPTOR, request, refCompute),
};

export const alternateFieldDouble: FieldComputationProvider = {
  descriptor: ALTERNATE_FIELD_DOUBLE_DESCRIPTOR,
  compute: (request) => doubleCompute(ALTERNATE_FIELD_DOUBLE_DESCRIPTOR, request, altCompute),
};
