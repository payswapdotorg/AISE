/**
 * WORLD-P0-B — the provider-neutral SCIENTIFIC-FIELD PORT (`src/field/`).
 *
 * The contract for structured-grid field computation: extents, means,
 * norms, vector magnitudes, discrete divergences, domain integrals and
 * threshold predicates over DECLARED structured-grid sample data — mapped
 * INTO AISE contract types via the seam's `AiseMappingBlock`.
 *
 * REFERENCE IMPLEMENTATION NOTE (GBIM-FT-001, the recorded direction —
 * build ON it, do not re-litigate): ParaView/VTK is the recorded
 * field-processing engine decision for the desktop/server side. THE
 * CONTRACT IS THE DELIVERABLE: it is engine-neutral (that is the point of
 * the adapter) — proven here by the in-repo substitution doubles in
 * `doubles.ts`, which compute the same fixture with closed-form discrete
 * arithmetic and NO VTK at all.
 *
 * LAWS (this port, on top of the seam laws):
 *
 *  1. VTK DATA-OBJECT NAMES ARE NAMESPACED EXTERNAL LABELS
 *     (`namespace: "vtk-dataobject"`), never canonical AISE identity.
 *     Candidate ids in the mapping block are 64-hex content digests; a
 *     raw data-object name in an id field is a typed validation failure.
 *  2. TOLERANCES ARE DECLARED, NEVER IMPLICIT (the substitution contract
 *     law #2, made concrete): a computation request without a tolerance
 *     declaration is REFUSED (`tolerance-must-be-declared` through the
 *     validator; `contract-mismatch` through the port with the same
 *     reason code named). Results carry the applied tolerance VERBATIM
 *     (`appliedTolerance` is the request's declaration, byte-identical),
 *     and near-threshold predicates answer `"within-tolerance"` instead
 *     of a silent boolean — the tolerance decision stays with the
 *     consumer.
 *  3. OPERATIONS ARE A CLOSED VOCABULARY: an operation outside it is a
 *     typed validation failure, never an implicit default.
 *  4. SAMPLE TABLES MATCH THE DECLARED GRID: a scalar or vector sample
 *     table whose length differs from `nx * ny` is a typed validation
 *     failure (`sample-count-mismatch`) — the adapter never guesses a
 *     layout, never invents samples, never truncates.
 *  5. DIVERGENCE IS DECLARED AT INTERIOR NODES: centered differences
 *     need both in-row neighbors, so a `field-divergence` operation
 *     naming a boundary node is a typed validation failure
 *     (`value-out-of-range`) — the adapter never silently switches to
 *     one-sided differences.
 *  6. FIELD FABRICATES NO REALITY IDENTITY: the mapping block's
 *     `realityObjects` is EMPTY (the ifc family seeds identity from IFC
 *     elements; field data computes quantities ABOUT a declared subject
 *     — it never mints RealityObject candidates).
 */

import {
  isCanonicalDigest,
  isExternalLabelNamespace,
  isIfcGuidShaped,
  canonicalDigestOf,
  deepFreeze,
  providerDescriptorDigestOf,
  refused,
  type AiseMappingBlock,
  type NamespacedExternalLabel,
  type SubstrateOutcome,
  type SubstrateProviderDescriptor,
  type SubstrateResultProvenance,
} from "../seam";
import type { FailureKind } from "@aise/provider-registry";

/* ------------------------------------------------------------------ */
/* Sealed kinds + closed vocabularies                                   */
/* ------------------------------------------------------------------ */

export const FIELD_REQUEST_KIND = "field-computation-request" as const;
export const FIELD_REQUEST_SCHEMA_VERSION = "field-computation-request/1" as const;
export const FIELD_RESULT_KIND = "field-computation-result" as const;
export const FIELD_RESULT_SCHEMA_VERSION = "field-computation-result/1" as const;

/**
 * The closed operation vocabulary: six discrete closed-form measurements
 * plus one threshold predicate. Measurements: `field-extent` (max − min
 * of the scalar samples), `field-mean` (arithmetic mean), `field-norm-l1`
 * (Σ|v|), `field-vector-magnitude` (the L2 norm of one DECLARED vector
 * sample), `field-divergence` (centered-difference divergence at one
 * DECLARED interior node), `field-integral` (the composite trapezoidal
 * integral of the scalar field over the grid domain). Predicate:
 * `field-above-threshold` (scalar sample value ≥ declared threshold,
 * with the tolerance band around the boundary).
 */
export const FIELD_OPERATION_KINDS = [
  "field-extent",
  "field-mean",
  "field-norm-l1",
  "field-vector-magnitude",
  "field-divergence",
  "field-integral",
  "field-above-threshold",
] as const;
export type FieldOperationKind = (typeof FIELD_OPERATION_KINDS)[number];

/** The closed measurement-quantity vocabulary (the Measurement seeds). */
export const FIELD_QUANTITY_KINDS = [
  "extent",
  "mean",
  "norm",
  "magnitude",
  "divergence",
  "integral",
] as const;
export type FieldQuantityKind = (typeof FIELD_QUANTITY_KINDS)[number];

/** The reference-implementation note (GBIM-FT-001 recorded direction). */
export const FIELD_REFERENCE_IMPLEMENTATION_NOTE =
  "GBIM-FT-001 recorded direction (docs/geometry-follow-through-work-orders-2026-09-29.md): " +
  "ParaView/VTK ADAPTED behind the provider boundary as the field-processing engine; " +
  "never forked, never an authority. This contract is engine-neutral; the in-repo doubles " +
  "prove implementability with closed-form discrete arithmetic and no VTK at all; real " +
  "VTK adapters are future occupants of the port.";

/* ------------------------------------------------------------------ */
/* The request                                                          */
/* ------------------------------------------------------------------ */

/** One declared 2D point (finite coordinates — exact-field input). */
export interface FieldPoint2 {
  readonly x: number;
  readonly y: number;
}

/**
 * The DECLARED structured grid: `nx` nodes along x, `ny` nodes along y,
 * node (i, j) at `(origin.x + i·spacing.x, origin.y + j·spacing.y)`.
 * Samples are ROW-MAJOR with y-major ordering: node index =
 * `j·nx + i`. The optional `name` is the VTK data-object name — carried
 * as a `vtk-dataobject` namespaced EXTERNAL LABEL, never identity.
 */
export interface FieldGridDeclaration {
  readonly name: string | null;
  readonly nx: number;
  readonly ny: number;
  readonly origin: FieldPoint2;
  readonly spacing: FieldPoint2;
}

/** One declared 2D vector sample (finite components). */
export interface FieldVector2 {
  readonly u: number;
  readonly v: number;
}

/**
 * The DECLARED scalar field: one finite value per grid node
 * (`values.length` MUST equal `nx·ny` — law #4). The optional `name` is
 * the VTK point-data array name (an external label, never identity).
 */
export interface ScalarFieldDeclaration {
  readonly name: string | null;
  readonly values: readonly number[];
}

/**
 * The DECLARED vector field: one 2D sample per grid node
 * (`samples.length` MUST equal `nx·ny` — law #4).
 */
export interface VectorFieldDeclaration {
  readonly name: string | null;
  readonly samples: readonly FieldVector2[];
}

/**
 * The DECLARED tolerance (the seam law #4 carrier): a positive finite
 * value band. A request without this declaration is refused.
 */
export interface FieldToleranceDeclaration {
  readonly value: number;
}

/**
 * The DECLARED units: the unit of the scalar field values and the unit
 * of the grid coordinates. Derived units compose from these two
 * declarations (never sensed): magnitudes stay in `value` units, vector
 * magnitudes compose `value/coordinate`, divergence `value/coordinate2`,
 * integrals `value.coordinate2`.
 */
export interface FieldUnitDeclaration {
  readonly value: string;
  readonly coordinate: string;
}

/**
 * One requested computation. Node-bearing operations cite INDICES into
 * the row-major sample tables; `field-divergence` MUST name an interior
 * node (law #5); `field-above-threshold` carries its DECLARED threshold.
 */
export type FieldOperation =
  | { readonly operation: "field-extent" }
  | { readonly operation: "field-mean" }
  | { readonly operation: "field-norm-l1" }
  | { readonly operation: "field-vector-magnitude"; readonly node: number }
  | { readonly operation: "field-divergence"; readonly node: number }
  | { readonly operation: "field-integral" }
  | { readonly operation: "field-above-threshold"; readonly node: number; readonly threshold: number };

/**
 * The provider-neutral field computation request. `subjectRef` is the
 * DECLARED AISE-side subject (a 64-hex content id) the computed values
 * assert about — field never fabricates reality identity (law #6).
 * `evidenceContentId` is the DECLARED evidence binding (the AISE gateway
 * registered the source dataset as Evidence; the adapter never invents
 * evidence ids). `recordedAt` is a declared instant (no clock reads).
 */
export interface FieldComputationRequest {
  readonly kind: typeof FIELD_REQUEST_KIND;
  readonly schemaVersion: typeof FIELD_REQUEST_SCHEMA_VERSION;
  readonly subjectRef: string;
  readonly grid: FieldGridDeclaration;
  readonly scalarField: ScalarFieldDeclaration;
  readonly vectorField: VectorFieldDeclaration;
  readonly operations: readonly FieldOperation[];
  readonly tolerance: FieldToleranceDeclaration;
  readonly units: FieldUnitDeclaration;
  readonly evidenceContentId: string;
  readonly recordedAt: string;
}

/* ------------------------------------------------------------------ */
/* The computation result                                               */
/* ------------------------------------------------------------------ */

/** One discrete field measurement (the Measurement seed carrier). */
export interface FieldMeasurementRecord {
  readonly operation: Exclude<FieldOperationKind, "field-above-threshold">;
  /** The vtk-dataobject labels of the consumed field arrays (null names dropped). */
  readonly operands: readonly NamespacedExternalLabel[];
  readonly quantity: FieldQuantityKind;
  readonly value: number;
  readonly unit: string;
}

/**
 * One threshold predicate. The verdict is `true` / `false` — or
 * `"within-tolerance"` when the sample value sits inside the DECLARED
 * value-tolerance band around the threshold (the seam law #4: never a
 * silent boolean at the boundary). `signedMargin` is the signed distance
 * value − threshold (positive above) — the near-boundary evidence the
 * consumer decides with.
 */
export interface FieldPredicateRecord {
  readonly operation: "field-above-threshold";
  /** The vtk-dataobject label of the probed grid node (null name dropped). */
  readonly node: NamespacedExternalLabel | null;
  /** The vtk-dataobject label of the probed scalar array (null name dropped). */
  readonly field: NamespacedExternalLabel | null;
  readonly predicate: "field-above-threshold";
  readonly verdict: boolean | "within-tolerance";
  readonly signedMargin: number;
}

/**
 * The computation: every measurement and predicate the adapter computed,
 * plus the AISE mapping block and the provenance. `resultId` is the
 * 64-hex content digest over the canonical JSON of the result minus its
 * own id. `appliedTolerance` is the request's DECLARED tolerance carried
 * VERBATIM.
 */
export interface FieldComputationResult {
  readonly kind: typeof FIELD_RESULT_KIND;
  readonly schemaVersion: typeof FIELD_RESULT_SCHEMA_VERSION;
  readonly resultId: string;
  /** sha-256 over the canonical JSON of { grid, scalarField, vectorField }. */
  readonly modelDigest: string;
  readonly appliedTolerance: FieldToleranceDeclaration;
  readonly measurements: readonly FieldMeasurementRecord[];
  readonly predicates: readonly FieldPredicateRecord[];
  readonly aise: AiseMappingBlock;
  readonly provenance: SubstrateResultProvenance;
}

/* ------------------------------------------------------------------ */
/* Typed validation failures                                            */
/* ------------------------------------------------------------------ */

export const FIELD_VALIDATION_FAILURE_KINDS = [
  "not-an-object",
  "missing-field",
  "type-mismatch",
  "value-out-of-range",
  "vocabulary-violation",
  "digest-format",
  "tolerance-must-be-declared",
  "operand-index-out-of-range",
  "sample-count-mismatch",
  "label-namespace-violation",
] as const;
export type FieldValidationFailureKind = (typeof FIELD_VALIDATION_FAILURE_KINDS)[number];

export interface FieldValidationFailure {
  readonly kind: FieldValidationFailureKind;
  readonly path: string;
  readonly detail: string;
}

export type FieldRequestValidation =
  | { readonly ok: true; readonly request: FieldComputationRequest }
  | { readonly ok: false; readonly failures: readonly FieldValidationFailure[] };

export type FieldResultValidation =
  | { readonly ok: true; readonly result: FieldComputationResult }
  | { readonly ok: false; readonly failures: readonly FieldValidationFailure[] };

/* ------------------------------------------------------------------ */
/* Pure validators                                                      */
/* ------------------------------------------------------------------ */

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

const ISO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

function isPoint2(value: unknown): value is FieldPoint2 {
  if (!isRecord(value)) {
    return false;
  }
  for (const axis of ["x", "y"] as const) {
    const coordinate = value[axis];
    if (typeof coordinate !== "number" || !Number.isFinite(coordinate)) {
      return false;
    }
  }
  return true;
}

function isVector2(value: unknown): value is FieldVector2 {
  if (!isRecord(value)) {
    return false;
  }
  for (const component of ["u", "v"] as const) {
    const coordinate = value[component];
    if (typeof coordinate !== "number" || !Number.isFinite(coordinate)) {
      return false;
    }
  }
  return true;
}

/** Is `index` an interior node of the grid (law #5: both in-row neighbors)? */
function isInteriorNode(index: number, nx: number, ny: number): boolean {
  const x = index % nx;
  const y = Math.floor(index / nx);
  return x >= 1 && x <= nx - 2 && y >= 1 && y <= ny - 2;
}

/** Validates an unknown payload as a `FieldComputationRequest`. PURE. */
export function validateFieldComputationRequest(input: unknown): FieldRequestValidation {
  if (!isRecord(input)) {
    return {
      ok: false,
      failures: [{ kind: "not-an-object", path: "", detail: "the request must be an object" }],
    };
  }
  const failures: FieldValidationFailure[] = [];
  const fail = (kind: FieldValidationFailureKind, path: string, detail: string): void => {
    failures.push({ kind, path, detail });
  };

  if (input["kind"] !== FIELD_REQUEST_KIND) {
    fail("vocabulary-violation", "kind", `must be "${FIELD_REQUEST_KIND}"`);
  }
  if (input["schemaVersion"] !== FIELD_REQUEST_SCHEMA_VERSION) {
    fail("vocabulary-violation", "schemaVersion", `must be "${FIELD_REQUEST_SCHEMA_VERSION}"`);
  }
  if (!isCanonicalDigest(input["subjectRef"])) {
    fail("digest-format", "subjectRef", "must be the declared 64-hex AISE-side subject id");
  }

  /* --- the grid (law #4 carrier) ---------------------------------- */

  const grid = input["grid"];
  let nx = 0;
  let ny = 0;
  if (!isRecord(grid)) {
    fail("missing-field", "grid", "the structured grid declaration is required");
  } else {
    if (grid["name"] !== null && !isNonEmptyString(grid["name"])) {
      fail("type-mismatch", "grid.name", "the VTK data-object name must be a non-empty string or null");
    }
    for (const dimension of ["nx", "ny"] as const) {
      const count = grid[dimension];
      if (typeof count !== "number" || !Number.isInteger(count) || count < 2) {
        fail("value-out-of-range", `grid.${dimension}`, "the node count must be an integer >= 2");
      }
    }
    nx = typeof grid["nx"] === "number" ? grid["nx"] : 0;
    ny = typeof grid["ny"] === "number" ? grid["ny"] : 0;
    if (!isPoint2(grid["origin"])) {
      fail("type-mismatch", "grid.origin", "the grid origin needs finite x/y coordinates");
    }
    const spacing = grid["spacing"];
    if (!isPoint2(spacing)) {
      fail("type-mismatch", "grid.spacing", "the grid spacing needs finite x/y components");
    } else {
      if (spacing.x <= 0 || spacing.y <= 0) {
        fail("value-out-of-range", "grid.spacing", "the grid spacing must be strictly positive");
      }
    }
  }

  const nodeCount = nx * ny;

  /* --- the sample tables (law #4) ---------------------------------- */

  const scalarField = input["scalarField"];
  if (!isRecord(scalarField)) {
    fail("missing-field", "scalarField", "the scalar field declaration is required");
  } else {
    if (scalarField["name"] !== null && !isNonEmptyString(scalarField["name"])) {
      fail("type-mismatch", "scalarField.name", "the VTK array name must be a non-empty string or null");
    }
    const values = scalarField["values"];
    if (!Array.isArray(values)) {
      fail("type-mismatch", "scalarField.values", "the scalar sample table must be an array");
    } else {
      if (nodeCount > 0 && values.length !== nodeCount) {
        fail(
          "sample-count-mismatch",
          "scalarField.values",
          `the scalar sample table must hold exactly nx*ny = ${nodeCount} samples, found ${values.length}`,
        );
      }
      for (let index = 0; index < values.length; index += 1) {
        const value = values[index];
        if (typeof value !== "number" || !Number.isFinite(value)) {
          fail("type-mismatch", `scalarField.values[${index}]`, "each scalar sample must be a finite number");
        }
      }
    }
  }

  const vectorField = input["vectorField"];
  if (!isRecord(vectorField)) {
    fail("missing-field", "vectorField", "the vector field declaration is required");
  } else {
    if (vectorField["name"] !== null && !isNonEmptyString(vectorField["name"])) {
      fail("type-mismatch", "vectorField.name", "the VTK array name must be a non-empty string or null");
    }
    const samples = vectorField["samples"];
    if (!Array.isArray(samples)) {
      fail("type-mismatch", "vectorField.samples", "the vector sample table must be an array");
    } else {
      if (nodeCount > 0 && samples.length !== nodeCount) {
        fail(
          "sample-count-mismatch",
          "vectorField.samples",
          `the vector sample table must hold exactly nx*ny = ${nodeCount} samples, found ${samples.length}`,
        );
      }
      for (let index = 0; index < samples.length; index += 1) {
        if (!isVector2(samples[index])) {
          fail("type-mismatch", `vectorField.samples[${index}]`, "each vector sample needs finite u/v components");
        }
      }
    }
  }

  /* --- the operations (law #3, law #5) ------------------------------ */

  const operations = input["operations"];
  if (!Array.isArray(operations)) {
    fail("type-mismatch", "operations", "the requested operations must be an array");
  } else {
    for (let index = 0; index < operations.length; index += 1) {
      const operation = operations[index];
      const path = `operations[${index}]`;
      if (!isRecord(operation)) {
        fail("type-mismatch", path, "an operation request must be an object");
        continue;
      }
      const kind = operation["operation"] as string;
      if (!(FIELD_OPERATION_KINDS as readonly string[]).includes(kind)) {
        fail("vocabulary-violation", `${path}.operation`, `must be one of ${FIELD_OPERATION_KINDS.join(" | ")}`);
        continue;
      }
      if (kind === "field-vector-magnitude" || kind === "field-divergence" || kind === "field-above-threshold") {
        const node = operation["node"];
        if (typeof node !== "number" || !Number.isInteger(node) || node < 0) {
          fail("type-mismatch", `${path}.node`, "the node must be a non-negative row-major sample index");
          continue;
        }
        if (nodeCount > 0 && node >= nodeCount) {
          fail("operand-index-out-of-range", `${path}.node`, `node index ${node} is outside the declared grid`);
          continue;
        }
        if (kind === "field-divergence" && nx >= 2 && ny >= 2 && !isInteriorNode(node, nx, ny)) {
          fail(
            "value-out-of-range",
            `${path}.node`,
            `field-divergence needs an INTERIOR node (1 <= x <= nx-2, 1 <= y <= ny-2), node ${node} is on the boundary`,
          );
        }
      }
      if (kind === "field-above-threshold") {
        const threshold = operation["threshold"];
        if (typeof threshold !== "number" || !Number.isFinite(threshold)) {
          fail("type-mismatch", `${path}.threshold`, "the comparison threshold must be a declared finite number");
        }
      }
    }
  }

  /* --- the tolerance (law #2) --------------------------------------- */

  const tolerance = input["tolerance"];
  if (!isRecord(tolerance)) {
    fail("tolerance-must-be-declared", "tolerance", "the computation tolerance MUST be declared (never implicit)");
  } else {
    const value = tolerance["value"];
    if (typeof value !== "number" || !Number.isFinite(value)) {
      fail("tolerance-must-be-declared", "tolerance.value", "the tolerance band must be a declared finite number");
    } else if (value <= 0) {
      fail("value-out-of-range", "tolerance.value", "the tolerance band must be strictly positive");
    }
  }

  /* --- the units (declared, never sensed) ---------------------------- */

  const units = input["units"];
  if (!isRecord(units)) {
    fail("missing-field", "units", "the declared units are required");
  } else {
    if (!isNonEmptyString(units["value"])) {
      fail("type-mismatch", "units.value", "must be a non-empty unit symbol");
    }
    if (!isNonEmptyString(units["coordinate"])) {
      fail("type-mismatch", "units.coordinate", "must be a non-empty unit symbol");
    }
  }

  if (!isCanonicalDigest(input["evidenceContentId"])) {
    fail("digest-format", "evidenceContentId", "must be the declared 64-hex evidence content id");
  }
  if (typeof input["recordedAt"] !== "string" || !ISO_TIMESTAMP.test(input["recordedAt"])) {
    fail("type-mismatch", "recordedAt", "must be an ISO-8601 UTC millisecond instant");
  }

  if (failures.length > 0) {
    return { ok: false, failures };
  }
  return { ok: true, request: input as unknown as FieldComputationRequest };
}

/** Validates an unknown payload as a `FieldComputationResult`. PURE. */
export function validateFieldComputationResult(input: unknown): FieldResultValidation {
  if (!isRecord(input)) {
    return {
      ok: false,
      failures: [{ kind: "not-an-object", path: "", detail: "the result must be an object" }],
    };
  }
  const failures: FieldValidationFailure[] = [];
  const fail = (kind: FieldValidationFailureKind, path: string, detail: string): void => {
    failures.push({ kind, path, detail });
  };

  if (input["kind"] !== FIELD_RESULT_KIND) {
    fail("vocabulary-violation", "kind", `must be "${FIELD_RESULT_KIND}"`);
  }
  if (input["schemaVersion"] !== FIELD_RESULT_SCHEMA_VERSION) {
    fail("vocabulary-violation", "schemaVersion", `must be "${FIELD_RESULT_SCHEMA_VERSION}"`);
  }
  if (!isCanonicalDigest(input["resultId"])) {
    fail("digest-format", "resultId", "must be the 64-hex content-derived result id");
  }
  if (!isCanonicalDigest(input["modelDigest"])) {
    fail("digest-format", "modelDigest", "must be the 64-hex declared-grid-and-fields digest");
  }

  const tolerance = input["appliedTolerance"];
  if (!isRecord(tolerance)) {
    fail("missing-field", "appliedTolerance", "the applied tolerance must be carried VERBATIM");
  } else {
    const value = tolerance["value"];
    if (typeof value !== "number" || !Number.isFinite(value)) {
      fail("type-mismatch", "appliedTolerance.value", "the applied band must be a finite number");
    } else if (value <= 0) {
      fail("value-out-of-range", "appliedTolerance.value", "the applied band must be strictly positive");
    }
  }

  const checkLabel = (path: string, value: unknown): void => {
    if (!isRecord(value)) {
      fail("type-mismatch", path, "an external label must be an object");
      return;
    }
    if (!isExternalLabelNamespace(value["namespace"])) {
      fail("label-namespace-violation", `${path}.namespace`, "not a closed external-label namespace");
    }
    if (value["namespace"] === "ifc-guid") {
      if (!isIfcGuidShaped(value["value"])) {
        fail("type-mismatch", `${path}.value`, "an ifc-guid label must be 22 IFC-base64 characters");
      }
    } else if (!isNonEmptyString(value["value"])) {
      fail("type-mismatch", `${path}.value`, "the label value must be a non-empty string");
    }
  };

  const measurements = input["measurements"];
  if (!Array.isArray(measurements)) {
    fail("type-mismatch", "measurements", "must be an array");
  } else {
    for (let index = 0; index < measurements.length; index += 1) {
      const measurement = measurements[index];
      const path = `measurements[${index}]`;
      if (!isRecord(measurement)) {
        fail("type-mismatch", path, "a measurement record must be an object");
        continue;
      }
      const operation = measurement["operation"];
      if (
        typeof operation !== "string" ||
        !(FIELD_OPERATION_KINDS as readonly string[]).includes(operation) ||
        operation === "field-above-threshold"
      ) {
        fail("vocabulary-violation", `${path}.operation`, "must be one of the six measurement operations");
      }
      const operands = measurement["operands"];
      if (!Array.isArray(operands)) {
        fail("type-mismatch", `${path}.operands`, "the operand labels must be an array");
      } else {
        for (let o = 0; o < operands.length; o += 1) {
          checkLabel(`${path}.operands[${o}]`, operands[o]);
        }
      }
      if (!(FIELD_QUANTITY_KINDS as readonly string[]).includes(measurement["quantity"] as string)) {
        fail("vocabulary-violation", `${path}.quantity`, "not a closed measurement quantity kind");
      }
      if (typeof measurement["value"] !== "number" || !Number.isFinite(measurement["value"])) {
        fail("type-mismatch", `${path}.value`, "the exact value must be a finite number");
      }
      if (!isNonEmptyString(measurement["unit"])) {
        fail("type-mismatch", `${path}.unit`, "the value's unit symbol is required");
      }
    }
  }

  const predicates = input["predicates"];
  if (!Array.isArray(predicates)) {
    fail("type-mismatch", "predicates", "must be an array");
  } else {
    for (let index = 0; index < predicates.length; index += 1) {
      const predicate = predicates[index];
      const path = `predicates[${index}]`;
      if (!isRecord(predicate)) {
        fail("type-mismatch", path, "a predicate record must be an object");
        continue;
      }
      if (predicate["operation"] !== "field-above-threshold") {
        fail("vocabulary-violation", `${path}.operation`, "the predicate operation is field-above-threshold");
      }
      if (predicate["predicate"] !== "field-above-threshold") {
        fail("vocabulary-violation", `${path}.predicate`, "the predicate identity is field-above-threshold");
      }
      if (predicate["node"] !== null) {
        checkLabel(`${path}.node`, predicate["node"]);
      }
      if (predicate["field"] !== null) {
        checkLabel(`${path}.field`, predicate["field"]);
      }
      const verdict = predicate["verdict"];
      if (verdict !== true && verdict !== false && verdict !== "within-tolerance") {
        fail("vocabulary-violation", `${path}.verdict`, 'must be true, false or "within-tolerance"');
      }
      if (typeof predicate["signedMargin"] !== "number" || !Number.isFinite(predicate["signedMargin"])) {
        fail("type-mismatch", `${path}.signedMargin`, "the signed threshold margin must be finite");
      }
    }
  }

  const provenance = input["provenance"];
  if (!isRecord(provenance)) {
    fail("missing-field", "provenance", "the provenance block is required");
  } else {
    if (!isNonEmptyString(provenance["providerId"])) {
      fail("type-mismatch", "provenance.providerId", "must be a non-empty provider id");
    }
    if (!isNonEmptyString(provenance["technologyVersion"])) {
      fail("type-mismatch", "provenance.technologyVersion", "must be a non-empty version");
    }
    if (!isCanonicalDigest(provenance["providerDescriptorDigest"])) {
      fail("digest-format", "provenance.providerDescriptorDigest", "must be a 64-hex digest");
    }
    if (!isCanonicalDigest(provenance["inputDigest"])) {
      fail("digest-format", "provenance.inputDigest", "must be a 64-hex digest");
    }
    if (!isCanonicalDigest(provenance["parametersDigest"])) {
      fail("digest-format", "provenance.parametersDigest", "must be a 64-hex digest");
    }
  }

  /* The mapping laws (id digests, INFERRED status, closed method
   * identity, declared evidence binding) are enforced by the seam's
   * `validateAiseMappingBlock`, composed into the governed entry and
   * drilled by the substitution tests. The tolerance-verbatim law is
   * exercised by the doubles' tests and the substitution drills. */

  if (failures.length > 0) {
    return { ok: false, failures };
  }
  return { ok: true, result: input as unknown as FieldComputationResult };
}

/* ------------------------------------------------------------------ */
/* The port                                                             */
/* ------------------------------------------------------------------ */

/**
 * The provider-neutral field computation port. Implementable by
 * ParaView/VTK — or by the in-repo substitution doubles. `compute` is
 * PURE over the request: the governed entry deep-freezes the request,
 * the provider answers either a provenance-bound computation or a typed
 * refusal from the closed vocabulary.
 */
export interface FieldComputationProvider {
  readonly descriptor: SubstrateProviderDescriptor;
  readonly compute: (request: FieldComputationRequest) => SubstrateOutcome<FieldComputationResult>;
}

/** The AISE-side parameters recorded on the derivation (inspectable). */
export function fieldDerivationParameters(request: FieldComputationRequest): Record<string, string> {
  return {
    "field.subjectRef": request.subjectRef,
    "field.modelDigest": fieldModelDigestOf(request),
    "field.grid": `${request.grid.nx}x${request.grid.ny}@(${request.grid.origin.x},${request.grid.origin.y})+(${request.grid.spacing.x},${request.grid.spacing.y})`,
    "field.tolerance": parametersJsonOf(request.tolerance),
    "field.units": `${request.units.value};${request.units.coordinate}`,
    "field.operations": parametersJsonOf(request.operations),
    "field.evidenceContentId": request.evidenceContentId,
  };
}

function parametersJsonOf(value: unknown): string {
  const json = JSON.stringify(sortKeysDeep(value));
  return json === undefined ? "null" : json;
}

function sortKeysDeep(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortKeysDeep);
  }
  if (value !== null && typeof value === "object") {
    const record = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(record).sort()) {
      out[key] = sortKeysDeep(record[key]);
    }
    return out;
  }
  return value;
}

/** The 64-hex digest of the declared grid and sample tables (the input digest). */
export function fieldModelDigestOf(request: FieldComputationRequest): string {
  return canonicalDigestOf({
    grid: request.grid,
    scalarField: request.scalarField,
    vectorField: request.vectorField,
  });
}

/** Builds the standard provenance block for a field result. */
export function fieldProvenanceOf(
  descriptor: SubstrateProviderDescriptor,
  request: FieldComputationRequest,
): SubstrateResultProvenance {
  return {
    providerId: descriptor.providerId,
    technologyVersion: descriptor.technologyVersion,
    providerDescriptorDigest: providerDescriptorDigestOf(descriptor),
    inputDigest: fieldModelDigestOf(request),
    parametersDigest: canonicalDigestOf(fieldDerivationParameters(request)),
    laneStatement: descriptor.laneStatement,
  };
}

/** A typed refusal helper bound to the field family. */
export function fieldRefused<T>(kind: FailureKind, detail: string): SubstrateOutcome<T> {
  return refused<T>("field", kind, detail);
}

/** The governed entry: validates, freezes, delegates, seals. */
export function computeThroughFieldPort(
  provider: FieldComputationProvider,
  request: FieldComputationRequest,
): SubstrateOutcome<FieldComputationResult> {
  const frozen = deepFreeze(request);
  return provider.compute(frozen);
}
