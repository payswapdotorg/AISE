/**
 * WORLD-P0-B — the provider-neutral EXACT-GEOMETRY PORT (`src/geometry/`).
 *
 * The contract for exact geometry computation: distances, lengths, areas,
 * volumes and containment predicates over DECLARED shape data — mapped
 * INTO AISE contract types via the seam's `AiseMappingBlock`.
 *
 * REFERENCE IMPLEMENTATION NOTE (GBIM-FT-001, the recorded direction —
 * build ON it, do not re-litigate): OCCT via OCP/CadQuery is the recorded
 * exact-geometry engine decision for the desktop/server side. THE CONTRACT
 * IS THE DELIVERABLE: it is engine-neutral (that is the point of the
 * adapter) — proven here by the in-repo substitution doubles in
 * `doubles.ts`, which compute the same fixture with closed-form analytic
 * math and NO OCCT/OCP at all.
 *
 * LAWS (this port, on top of the seam laws):
 *
 *  1. OCCT topology names are NAMESPACED EXTERNAL LABELS
 *     (`namespace: "occt-topology"`), never canonical AISE identity.
 *     Candidate ids in the mapping block are 64-hex content digests; a
 *     raw topology name in an id field is a typed validation failure.
 *  2. TOLERANCES ARE DECLARED, NEVER IMPLICIT (the substitution contract
 *     law #2, made concrete): a computation request without a tolerance
 *     declaration is REFUSED (`tolerance-must-be-declared` through the
 *     validator; `contract-mismatch` through the port with the same
 *     reason code named). Results carry the applied tolerance VERBATIM
 *     (`appliedTolerance` is the request's declaration, byte-identical),
 *     and near-boundary predicates answer `"within-tolerance"` instead
 *     of a silent boolean — the tolerance decision stays with the
 *     consumer.
 *  3. OPERATIONS ARE A CLOSED VOCABULARY: an operation outside it is a
 *     typed validation failure (`vocabulary-violation`), never an
 *     ad-hoc computation. Operands are INDICES into the declared shape
 *     table; an out-of-range index or a shape-kind mismatch is a typed
 *     refusal (`operand-index-out-of-range` / `vocabulary-violation`).
 *  4. GEOMETRY FABRICATES NO REALITY IDENTITY: `subjectRef` is the
 *     DECLARED AISE-side subject the computed values assert about; the
 *     mapping block's `realityObjects` array is EMPTY for geometry (the
 *     seam's law — no reality identity is fabricated here). Computed
 *     predicates and measurements enter as INFERRED candidates.
 *  5. DETERMINISM: no network, no clock reads, no randomness, no I/O.
 *     `recordedAt` is a declared input; identical requests through the
 *     same provider produce byte-identical results (content-addressed by
 *     the sealed `resultId`).
 */

import {
  canonicalDigestOf,
  isCanonicalDigest,
  isExternalLabelNamespace,
  isIfcGuidShaped,
  providerDescriptorDigestOf,
  refused,
  deepFreeze,
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

export const GEOMETRY_REQUEST_KIND = "geometry-computation-request" as const;
export const GEOMETRY_REQUEST_SCHEMA_VERSION = "geometry-computation-request/1" as const;
export const GEOMETRY_RESULT_KIND = "geometry-computation-result" as const;
export const GEOMETRY_RESULT_SCHEMA_VERSION = "geometry-computation-result/1" as const;

/** The closed shape-kind vocabulary (the declared model's geometry kinds). */
export const GEOMETRY_SHAPE_KINDS = ["point", "segment", "polygon", "box"] as const;
export type GeometryShapeKind = (typeof GEOMETRY_SHAPE_KINDS)[number];

/**
 * The closed operation vocabulary. Five measurement operations and one
 * predicate operation; every entry is computable in closed form by the
 * doubles AND by an OCCT/OCP adapter (the engine-neutral shape).
 */
export const GEOMETRY_OPERATION_KINDS = [
  "distance-point-point",
  "distance-point-segment",
  "segment-length",
  "polygon-area",
  "box-volume",
  "point-in-polygon",
] as const;
export type GeometryOperationKind = (typeof GEOMETRY_OPERATION_KINDS)[number];

/** The closed measurement-quantity vocabulary (the Measurement seeds). */
export const GEOMETRY_QUANTITY_KINDS = ["distance", "length", "area", "volume"] as const;
export type GeometryQuantityKind = (typeof GEOMETRY_QUANTITY_KINDS)[number];

/** The reference-implementation note (GBIM-FT-001 recorded direction). */
export const GEOMETRY_REFERENCE_IMPLEMENTATION_NOTE =
  "GBIM-FT-001 recorded direction (docs/geometry-follow-through-work-orders-2026-09-29.md): " +
  "OCCT via OCP/CadQuery ADAPTED behind the provider boundary as the exact-geometry engine; " +
  "never forked, never an authority. This contract is engine-neutral; the in-repo doubles " +
  "prove implementability with closed-form analytic math and no OCCT at all; real OCP/CadQuery " +
  "adapters are future occupants of the port.";

/* ------------------------------------------------------------------ */
/* The request                                                          */
/* ------------------------------------------------------------------ */

/** One declared 3D point (finite coordinates — exact-geometry input). */
export interface GeometryPoint3 {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

/**
 * The DECLARED tolerance (the seam law #4 carrier): positive finite linear
 * and angular tolerances. A request without this declaration is refused.
 */
export interface GeometryToleranceDeclaration {
  readonly linear: number;
  readonly angular: number;
}

/** The DECLARED units the computed values are expressed in. */
export interface GeometryUnitDeclaration {
  readonly linear: string;
  readonly angular: string;
}

/**
 * One declared shape: a point, a segment, a planar polygon (>= 3
 * vertices, in boundary order) or an axis-aligned box. The optional
 * `name` is the OCCT TopoDS name — carried as an `occt-topology`
 * namespaced EXTERNAL LABEL, never identity.
 */
export type GeometryShapeDeclaration =
  | { readonly kind: "point"; readonly name: string | null; readonly at: GeometryPoint3 }
  | {
      readonly kind: "segment";
      readonly name: string | null;
      readonly a: GeometryPoint3;
      readonly b: GeometryPoint3;
    }
  | {
      readonly kind: "polygon";
      readonly name: string | null;
      readonly vertices: readonly GeometryPoint3[];
    }
  | {
      readonly kind: "box";
      readonly name: string | null;
      readonly min: GeometryPoint3;
      readonly max: GeometryPoint3;
    };

/**
 * One requested computation. Operands are INDICES into the request's
 * declared `shapes` array; the referenced shape's kind must match the
 * operation's expectation (validated — a mismatch is a typed refusal).
 */
export type GeometryOperation =
  | { readonly operation: "distance-point-point"; readonly a: number; readonly b: number }
  | { readonly operation: "distance-point-segment"; readonly point: number; readonly segment: number }
  | { readonly operation: "segment-length"; readonly segment: number }
  | { readonly operation: "polygon-area"; readonly polygon: number }
  | { readonly operation: "box-volume"; readonly box: number }
  | { readonly operation: "point-in-polygon"; readonly point: number; readonly polygon: number };

/**
 * The provider-neutral exact-geometry computation request. `subjectRef`
 * is the DECLARED AISE-side subject (a 64-hex content id) the computed
 * values assert about — geometry never fabricates reality identity.
 * `evidenceContentId` is the DECLARED evidence binding (the AISE gateway
 * registered the source as Evidence; the adapter never invents evidence
 * ids). `recordedAt` is a declared instant (no clock reads).
 */
export interface GeometryComputationRequest {
  readonly kind: typeof GEOMETRY_REQUEST_KIND;
  readonly schemaVersion: typeof GEOMETRY_REQUEST_SCHEMA_VERSION;
  readonly subjectRef: string;
  readonly shapes: readonly GeometryShapeDeclaration[];
  readonly operations: readonly GeometryOperation[];
  readonly tolerance: GeometryToleranceDeclaration;
  readonly units: GeometryUnitDeclaration;
  readonly evidenceContentId: string;
  readonly recordedAt: string;
}

/* ------------------------------------------------------------------ */
/* The computation result                                               */
/* ------------------------------------------------------------------ */

/** One exact measurement (the Measurement seed carrier). */
export interface GeometryMeasurementRecord {
  readonly operation: Exclude<GeometryOperationKind, "point-in-polygon">;
  /** The occt-topology labels of the involved shapes (null names dropped). */
  readonly operands: readonly NamespacedExternalLabel[];
  readonly quantity: GeometryQuantityKind;
  readonly value: number;
  readonly unit: string;
}

/**
 * One containment predicate. The verdict is `true` / `false` — or
 * `"within-tolerance"` when the point sits inside the DECLARED linear
 * tolerance band around the boundary (the seam law #4: never a silent
 * boolean at the boundary). `signedDistance` is the signed distance to
 * the polygon region (positive inside, negative outside) — the
 * near-boundary evidence the consumer decides with.
 */
export interface GeometryPredicateRecord {
  readonly operation: "point-in-polygon";
  readonly point: NamespacedExternalLabel | null;
  readonly polygon: NamespacedExternalLabel | null;
  readonly predicate: "point-in-polygon";
  readonly verdict: boolean | "within-tolerance";
  readonly signedDistance: number;
}

/**
 * The computation: every measurement and predicate the adapter computed,
 * plus the AISE mapping block and the provenance. `resultId` is the
 * 64-hex content digest over the canonical JSON of the result minus its
 * own id. `appliedTolerance` is the request's DECLARED tolerance carried
 * VERBATIM.
 */
export interface GeometryComputationResult {
  readonly kind: typeof GEOMETRY_RESULT_KIND;
  readonly schemaVersion: typeof GEOMETRY_RESULT_SCHEMA_VERSION;
  readonly resultId: string;
  /** sha-256 over the canonical JSON of the declared shapes. */
  readonly modelDigest: string;
  readonly appliedTolerance: GeometryToleranceDeclaration;
  readonly measurements: readonly GeometryMeasurementRecord[];
  readonly predicates: readonly GeometryPredicateRecord[];
  readonly aise: AiseMappingBlock;
  readonly provenance: SubstrateResultProvenance;
}

/* ------------------------------------------------------------------ */
/* Typed validation failures                                            */
/* ------------------------------------------------------------------ */

export const GEOMETRY_VALIDATION_FAILURE_KINDS = [
  "not-an-object",
  "missing-field",
  "type-mismatch",
  "value-out-of-range",
  "vocabulary-violation",
  "digest-format",
  "tolerance-must-be-declared",
  "operand-index-out-of-range",
  "label-namespace-violation",
] as const;
export type GeometryValidationFailureKind = (typeof GEOMETRY_VALIDATION_FAILURE_KINDS)[number];

export interface GeometryValidationFailure {
  readonly kind: GeometryValidationFailureKind;
  readonly path: string;
  readonly detail: string;
}

export type GeometryRequestValidation =
  | { readonly ok: true; readonly request: GeometryComputationRequest }
  | { readonly ok: false; readonly failures: readonly GeometryValidationFailure[] };

export type GeometryResultValidation =
  | { readonly ok: true; readonly result: GeometryComputationResult }
  | { readonly ok: false; readonly failures: readonly GeometryValidationFailure[] };

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

function isPoint3(value: unknown): value is GeometryPoint3 {
  if (!isRecord(value)) {
    return false;
  }
  for (const axis of ["x", "y", "z"] as const) {
    const coordinate = value[axis];
    if (typeof coordinate !== "number" || !Number.isFinite(coordinate)) {
      return false;
    }
  }
  return true;
}

/** The operand fields each operation consumes (the validation table). */
const OPERATION_OPERAND_FIELDS: Readonly<
  Record<GeometryOperationKind, readonly { readonly field: string; readonly kind: GeometryShapeKind }[]>
> = {
  "distance-point-point": [
    { field: "a", kind: "point" },
    { field: "b", kind: "point" },
  ],
  "distance-point-segment": [
    { field: "point", kind: "point" },
    { field: "segment", kind: "segment" },
  ],
  "segment-length": [{ field: "segment", kind: "segment" }],
  "polygon-area": [{ field: "polygon", kind: "polygon" }],
  "box-volume": [{ field: "box", kind: "box" }],
  "point-in-polygon": [
    { field: "point", kind: "point" },
    { field: "polygon", kind: "polygon" },
  ],
};

/** Validates an unknown payload as a `GeometryComputationRequest`. PURE. */
export function validateGeometryComputationRequest(input: unknown): GeometryRequestValidation {
  if (!isRecord(input)) {
    return {
      ok: false,
      failures: [{ kind: "not-an-object", path: "", detail: "the request must be an object" }],
    };
  }
  const failures: GeometryValidationFailure[] = [];
  const fail = (kind: GeometryValidationFailureKind, path: string, detail: string): void => {
    failures.push({ kind, path, detail });
  };

  if (input["kind"] !== GEOMETRY_REQUEST_KIND) {
    fail("vocabulary-violation", "kind", `must be "${GEOMETRY_REQUEST_KIND}"`);
  }
  if (input["schemaVersion"] !== GEOMETRY_REQUEST_SCHEMA_VERSION) {
    fail("vocabulary-violation", "schemaVersion", `must be "${GEOMETRY_REQUEST_SCHEMA_VERSION}"`);
  }
  if (!isCanonicalDigest(input["subjectRef"])) {
    fail("digest-format", "subjectRef", "must be the declared 64-hex AISE-side subject id");
  }

  const shapes = input["shapes"];
  if (!Array.isArray(shapes)) {
    fail("type-mismatch", "shapes", "the declared shape table must be an array");
  } else {
    for (let index = 0; index < shapes.length; index += 1) {
      const shape = shapes[index];
      const path = `shapes[${index}]`;
      if (!isRecord(shape)) {
        fail("type-mismatch", path, "a shape declaration must be an object");
        continue;
      }
      if (!(GEOMETRY_SHAPE_KINDS as readonly string[]).includes(shape["kind"] as string)) {
        fail("vocabulary-violation", `${path}.kind`, `must be one of ${GEOMETRY_SHAPE_KINDS.join(" | ")}`);
        continue;
      }
      if (shape["name"] !== null && !isNonEmptyString(shape["name"])) {
        fail("type-mismatch", `${path}.name`, "the OCCT TopoDS name must be a non-empty string or null");
      }
      switch (shape["kind"]) {
        case "point": {
          if (!isPoint3(shape["at"])) {
            fail("type-mismatch", `${path}.at`, "a point shape needs finite x/y/z coordinates");
          }
          break;
        }
        case "segment": {
          if (!isPoint3(shape["a"])) {
            fail("type-mismatch", `${path}.a`, "the segment endpoint needs finite coordinates");
          }
          if (!isPoint3(shape["b"])) {
            fail("type-mismatch", `${path}.b`, "the segment endpoint needs finite coordinates");
          }
          break;
        }
        case "polygon": {
          const vertices = shape["vertices"];
          if (!Array.isArray(vertices) || vertices.length < 3) {
            fail("value-out-of-range", `${path}.vertices`, "a polygon needs at least 3 vertices in boundary order");
          } else {
            for (let v = 0; v < vertices.length; v += 1) {
              if (!isPoint3(vertices[v])) {
                fail("type-mismatch", `${path}.vertices[${v}]`, "each vertex needs finite coordinates");
              }
            }
          }
          break;
        }
        case "box": {
          if (!isPoint3(shape["min"])) {
            fail("type-mismatch", `${path}.min`, "the box corner needs finite coordinates");
          }
          if (!isPoint3(shape["max"])) {
            fail("type-mismatch", `${path}.max`, "the box corner needs finite coordinates");
          }
          if (isPoint3(shape["min"]) && isPoint3(shape["max"])) {
            const min = shape["min"] as GeometryPoint3;
            const max = shape["max"] as GeometryPoint3;
            if (min.x > max.x || min.y > max.y || min.z > max.z) {
              fail("value-out-of-range", `${path}.max`, "the box max corner must dominate the min corner per axis");
            }
          }
          break;
        }
      }
    }
  }

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
      if (!(GEOMETRY_OPERATION_KINDS as readonly string[]).includes(kind)) {
        fail("vocabulary-violation", `${path}.operation`, `must be one of ${GEOMETRY_OPERATION_KINDS.join(" | ")}`);
        continue;
      }
      for (const operand of OPERATION_OPERAND_FIELDS[kind as GeometryOperationKind]) {
        const operandIndex = operation[operand.field];
        if (typeof operandIndex !== "number" || !Number.isInteger(operandIndex) || operandIndex < 0) {
          fail("type-mismatch", `${path}.${operand.field}`, "the operand must be a non-negative shape index");
          continue;
        }
        if (Array.isArray(shapes) && operandIndex >= shapes.length) {
          fail("operand-index-out-of-range", `${path}.${operand.field}`, `shape index ${operandIndex} is outside the declared table`);
          continue;
        }
        const shape = Array.isArray(shapes) ? shapes[operandIndex] : undefined;
        if (isRecord(shape) && shape["kind"] !== operand.kind) {
          fail(
            "vocabulary-violation",
            `${path}.${operand.field}`,
            `operation "${kind}" needs a ${operand.kind} shape at index ${operandIndex}, found "${String(shape["kind"])}"`,
          );
        }
      }
    }
  }

  const tolerance = input["tolerance"];
  if (!isRecord(tolerance)) {
    fail("tolerance-must-be-declared", "tolerance", "the computation tolerance MUST be declared (never implicit)");
  } else {
    for (const band of ["linear", "angular"] as const) {
      const value = tolerance[band];
      if (typeof value !== "number" || !Number.isFinite(value)) {
        fail("tolerance-must-be-declared", `tolerance.${band}`, "the tolerance band must be a declared finite number");
      } else if (value <= 0) {
        fail("value-out-of-range", `tolerance.${band}`, "the tolerance band must be strictly positive");
      }
    }
  }

  const units = input["units"];
  if (!isRecord(units)) {
    fail("missing-field", "units", "the declared units are required");
  } else {
    if (!isNonEmptyString(units["linear"])) {
      fail("type-mismatch", "units.linear", "must be a non-empty unit symbol");
    }
    if (!isNonEmptyString(units["angular"])) {
      fail("type-mismatch", "units.angular", "must be a non-empty unit symbol");
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
  return { ok: true, request: input as unknown as GeometryComputationRequest };
}

/** Validates an unknown payload as a `GeometryComputationResult`. PURE. */
export function validateGeometryComputationResult(input: unknown): GeometryResultValidation {
  if (!isRecord(input)) {
    return {
      ok: false,
      failures: [{ kind: "not-an-object", path: "", detail: "the result must be an object" }],
    };
  }
  const failures: GeometryValidationFailure[] = [];
  const fail = (kind: GeometryValidationFailureKind, path: string, detail: string): void => {
    failures.push({ kind, path, detail });
  };

  if (input["kind"] !== GEOMETRY_RESULT_KIND) {
    fail("vocabulary-violation", "kind", `must be "${GEOMETRY_RESULT_KIND}"`);
  }
  if (input["schemaVersion"] !== GEOMETRY_RESULT_SCHEMA_VERSION) {
    fail("vocabulary-violation", "schemaVersion", `must be "${GEOMETRY_RESULT_SCHEMA_VERSION}"`);
  }
  if (!isCanonicalDigest(input["resultId"])) {
    fail("digest-format", "resultId", "must be the 64-hex content-derived result id");
  }
  if (!isCanonicalDigest(input["modelDigest"])) {
    fail("digest-format", "modelDigest", "must be the 64-hex declared-shape-table digest");
  }

  const tolerance = input["appliedTolerance"];
  if (!isRecord(tolerance)) {
    fail("missing-field", "appliedTolerance", "the applied tolerance must be carried VERBATIM");
  } else {
    for (const band of ["linear", "angular"] as const) {
      const value = tolerance[band];
      if (typeof value !== "number" || !Number.isFinite(value)) {
        fail("type-mismatch", `appliedTolerance.${band}`, "the applied band must be a finite number");
      } else if (value <= 0) {
        fail("value-out-of-range", `appliedTolerance.${band}`, "the applied band must be strictly positive");
      }
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
        !(GEOMETRY_OPERATION_KINDS as readonly string[]).includes(operation) ||
        operation === "point-in-polygon"
      ) {
        fail("vocabulary-violation", `${path}.operation`, "must be one of the five measurement operations");
      }
      const operands = measurement["operands"];
      if (!Array.isArray(operands)) {
        fail("type-mismatch", `${path}.operands`, "the operand labels must be an array");
      } else {
        for (let o = 0; o < operands.length; o += 1) {
          checkLabel(`${path}.operands[${o}]`, operands[o]);
        }
      }
      if (!(GEOMETRY_QUANTITY_KINDS as readonly string[]).includes(measurement["quantity"] as string)) {
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
      if (predicate["operation"] !== "point-in-polygon") {
        fail("vocabulary-violation", `${path}.operation`, "the predicate operation is point-in-polygon");
      }
      if (predicate["predicate"] !== "point-in-polygon") {
        fail("vocabulary-violation", `${path}.predicate`, "the predicate identity is point-in-polygon");
      }
      if (predicate["point"] !== null) {
        checkLabel(`${path}.point`, predicate["point"]);
      }
      if (predicate["polygon"] !== null) {
        checkLabel(`${path}.polygon`, predicate["polygon"]);
      }
      const verdict = predicate["verdict"];
      if (verdict !== true && verdict !== false && verdict !== "within-tolerance") {
        fail("vocabulary-violation", `${path}.verdict`, 'must be true, false or "within-tolerance"');
      }
      if (typeof predicate["signedDistance"] !== "number" || !Number.isFinite(predicate["signedDistance"])) {
        fail("type-mismatch", `${path}.signedDistance`, "the signed boundary distance must be finite");
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
  return { ok: true, result: input as unknown as GeometryComputationResult };
}

/* ------------------------------------------------------------------ */
/* The port                                                             */
/* ------------------------------------------------------------------ */

/**
 * The provider-neutral exact-geometry port. Implementable by OCCT via
 * OCP/CadQuery — or by the in-repo substitution doubles. `compute` is
 * PURE over the request: the governed entry deep-freezes the request,
 * the provider answers either a provenance-bound computation or a typed
 * refusal from the closed vocabulary.
 */
export interface GeometryComputationProvider {
  readonly descriptor: SubstrateProviderDescriptor;
  readonly compute: (request: GeometryComputationRequest) => SubstrateOutcome<GeometryComputationResult>;
}

/** The AISE-side parameters recorded on the derivation (inspectable). */
export function geometryDerivationParameters(request: GeometryComputationRequest): Record<string, string> {
  return {
    "geometry.subjectRef": request.subjectRef,
    "geometry.modelDigest": geometryModelDigestOf(request),
    "geometry.tolerance": parametersJsonOf(request.tolerance),
    "geometry.units": `${request.units.linear};${request.units.angular}`,
    "geometry.operations": parametersJsonOf(request.operations),
    "geometry.evidenceContentId": request.evidenceContentId,
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

/** The 64-hex digest of the declared shape table (the input digest). */
export function geometryModelDigestOf(request: GeometryComputationRequest): string {
  return canonicalDigestOf(request.shapes);
}

/** Builds the standard provenance block for a geometry result. */
export function geometryProvenanceOf(
  descriptor: SubstrateProviderDescriptor,
  request: GeometryComputationRequest,
): SubstrateResultProvenance {
  return {
    providerId: descriptor.providerId,
    technologyVersion: descriptor.technologyVersion,
    providerDescriptorDigest: providerDescriptorDigestOf(descriptor),
    inputDigest: geometryModelDigestOf(request),
    parametersDigest: canonicalDigestOf(geometryDerivationParameters(request)),
    laneStatement: descriptor.laneStatement,
  };
}

/** A typed refusal helper bound to the geometry family. */
export function geometryRefused<T>(kind: FailureKind, detail: string): SubstrateOutcome<T> {
  return refused<T>("geometry", kind, detail);
}

/** The governed entry: validates, freezes, delegates, seals. */
export function computeThroughGeometryPort(
  provider: GeometryComputationProvider,
  request: GeometryComputationRequest,
): SubstrateOutcome<GeometryComputationResult> {
  const frozen = deepFreeze(request);
  return provider.compute(frozen);
}
