/**
 * Measurement provenance model (AISE-009).
 *
 * Every derived measurement must identify its method, its
 * parameters, and the input geometry it was derived from
 * (architecture: "every consequential assertion can point to source
 * evidence and transformation method"). A measurement without
 * complete provenance is not an engineering record — it is a bare
 * number — so `validateMeasurementProvenance` is the fail-closed
 * gate every measurement/fit result passes before it is returned
 * (not just at consumption: the producing code itself calls it).
 *
 * Input geometry is content-pinned: point sets and entities are
 * canonically serialized (sorted keys; point sets in their
 * canonical order) and SHA-256 hashed, so a provenance record
 * identifies the exact input content, not just its shape.
 */
import { GeometryError } from "./errors.js";
import { canonicalContentHash } from "./canonical.js";
import { type EpistemicState } from "@aise/shared-contracts";

const CONTENT_HASH_PATTERN = /^[0-9a-f]{64}$/;
const METHOD_PATTERN = /^[a-z0-9][a-z0-9./-]*$/;

/** Identity of this geometry measurement package. */
export const GEOMETRY_SERVICE_ID = "aise.geometry";

/** Method-lineage version: bump when any method's numerics change. */
export const GEOMETRY_METHOD_VERSION = "1.0.0";

/** A point-set input reference (content = canonically ordered points). */
export interface PointSetInputRef {
  readonly kind: "point-set";
  readonly pointCount: number;
  /** SHA-256 of the canonical serialization of the ordered point set. */
  readonly contentHash: string;
  /** Epistemic state of the point source, as declared by the caller. */
  readonly epistemic: EpistemicState;
}

/** A single geometric entity input reference (point, line, or plane). */
export interface EntityInputRef {
  readonly kind: "entity";
  readonly entityKind: "point" | "line" | "plane";
  /** SHA-256 of the canonical serialization of the entity. */
  readonly contentHash: string;
  /** Epistemic state of the entity, as declared by the caller. */
  readonly epistemic: EpistemicState;
}

/** A previously-derived fit result used as input to a query. */
export interface FitInputRef {
  readonly kind: "fit";
  /** Method label of the producing fit (e.g. "plane-fit/tls-pca"). */
  readonly method: string;
  /** SHA-256 of the canonical serialization of the fit geometry. */
  readonly contentHash: string;
  /** Epistemic state of the fit result (fits are INFERRED). */
  readonly epistemic: EpistemicState;
}

export type GeometryInputRef = PointSetInputRef | EntityInputRef | FitInputRef;

/** Complete lineage record for one measurement or fit result. */
export interface MeasurementProvenance {
  /** Producing service identity. */
  readonly serviceId: string;
  /** Producing method label (e.g. "distance/point-point", "plane-fit/tls-pca"). */
  readonly method: string;
  /** Method lineage version (numerics contract). */
  readonly methodVersion: string;
  /**
   * The exact parameters record (fully materialized, JSON-shaped,
   * all numbers finite — hashing it must succeed). Unlike an opaque
   * fingerprint, the parameters travel with the measurement: an
   * inspector must be able to reproduce the computation.
   */
  readonly parameters: Readonly<Record<string, unknown>>;
  /** Non-empty input lineage. */
  readonly inputs: readonly GeometryInputRef[];
}

/** Builds a provenance record and validates it before returning it. */
export function measurementProvenance(
  method: string,
  parameters: Readonly<Record<string, unknown>>,
  inputs: readonly GeometryInputRef[],
): MeasurementProvenance {
  const provenance: MeasurementProvenance = {
    serviceId: GEOMETRY_SERVICE_ID,
    method,
    methodVersion: GEOMETRY_METHOD_VERSION,
    parameters,
    inputs,
  };
  validateMeasurementProvenance(provenance);
  return provenance;
}

/** Canonical content hash of a provenance record (identity of lineage). */
export function provenanceContentHash(provenance: MeasurementProvenance): string {
  return canonicalContentHash(provenance);
}

/**
 * Fail-closed provenance validation: service identity, method
 * label, method version, a canonically serializable (finite)
 * parameters record, and a non-empty set of complete input
 * references. Throws `PROVENANCE_INCOMPLETE` on any gap.
 */
export function validateMeasurementProvenance(provenance: MeasurementProvenance): void {
  if (provenance.serviceId !== GEOMETRY_SERVICE_ID) {
    throw new GeometryError(
      "PROVENANCE_INCOMPLETE",
      `provenance serviceId must be "${GEOMETRY_SERVICE_ID}"`,
      { details: { field: "serviceId", value: provenance.serviceId } },
    );
  }
  if (typeof provenance.method !== "string" || !METHOD_PATTERN.test(provenance.method)) {
    throw new GeometryError(
      "PROVENANCE_INCOMPLETE",
      `provenance method must be a lowercase dotted method label: ${String(provenance.method)}`,
      { details: { field: "method", value: String(provenance.method) } },
    );
  }
  if (provenance.methodVersion !== GEOMETRY_METHOD_VERSION) {
    throw new GeometryError(
      "PROVENANCE_INCOMPLETE",
      `provenance methodVersion must be "${GEOMETRY_METHOD_VERSION}"`,
      { details: { field: "methodVersion", value: String(provenance.methodVersion) } },
    );
  }
  if (
    provenance.parameters === null ||
    typeof provenance.parameters !== "object" ||
    Array.isArray(provenance.parameters)
  ) {
    throw new GeometryError(
      "PROVENANCE_INCOMPLETE",
      "provenance parameters must be a record object",
      { details: { field: "parameters" } },
    );
  }
  try {
    canonicalContentHash(provenance.parameters);
  } catch (error) {
    throw new GeometryError(
      "PROVENANCE_INCOMPLETE",
      `provenance parameters must be canonically serializable (finite numbers, JSON-shaped): ${error instanceof Error ? error.message : String(error)}`,
      { details: { field: "parameters" } },
    );
  }
  if (!Array.isArray(provenance.inputs) || provenance.inputs.length === 0) {
    throw new GeometryError(
      "PROVENANCE_INCOMPLETE",
      "provenance must cite at least one input",
      { details: { field: "inputs", count: Array.isArray(provenance.inputs) ? provenance.inputs.length : 0 } },
    );
  }
  for (const [index, input] of provenance.inputs.entries()) {
    if (!input || typeof input !== "object") {
      throw new GeometryError("PROVENANCE_INCOMPLETE", `provenance input ${index} is malformed`, {
        details: { field: "inputs", index },
      });
    }
    if (!CONTENT_HASH_PATTERN.test(String(input.contentHash))) {
      throw new GeometryError(
        "PROVENANCE_INCOMPLETE",
        `provenance input ${index} contentHash must be a lowercase-hex sha-256`,
        { details: { field: "inputs", index, value: String(input.contentHash) } },
      );
    }
    if (input.epistemic !== "OBSERVED" && input.epistemic !== "INFERRED" &&
      input.epistemic !== "CONFIRMED" && input.epistemic !== "PROPOSED") {
      throw new GeometryError(
        "PROVENANCE_INCOMPLETE",
        `provenance input ${index} epistemic must be a valid EpistemicState`,
        { details: { field: "inputs", index, value: String(input.epistemic) } },
      );
    }
    if (input.kind === "point-set" && (!Number.isInteger(input.pointCount) || input.pointCount <= 0)) {
      throw new GeometryError(
        "PROVENANCE_INCOMPLETE",
        `provenance point-set input ${index} pointCount must be a positive integer`,
        { details: { field: "inputs", index, pointCount: String(input.pointCount) } },
      );
    }
  }
}
