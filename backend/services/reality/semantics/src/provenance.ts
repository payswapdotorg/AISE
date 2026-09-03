/**
 * Extraction provenance model (AISE-010).
 *
 * Every extracted architectural object must identify its method,
 * its parameters, and the input geometry it was derived from
 * (architecture: "every consequential assertion can point to source
 * evidence and transformation method"). An object without complete
 * provenance is not an engineering record — it is a bare shape —
 * so `validateExtractionProvenance` is the fail-closed gate every
 * extracted object and scene passes before it is returned (the
 * producing code itself calls it, not just consumers).
 *
 * Mirrors the AISE-009 `MeasurementProvenance` discipline with a
 * semantics-specific service identity, and one additional input
 * reference kind: extracted objects reference the PARENT object
 * they were derived from (a door references its wall), so the
 * lineage chain wall→cluster→cloud is fully reconstructible.
 *
 * Input geometry is content-pinned: point sets are canonically
 * serialized (sorted keys; point sets in their canonical order) and
 * SHA-256 hashed via the AISE-009 canonicalizer, so a provenance
 * record identifies the exact input content, not just its shape.
 */
import { SemanticsError } from "./errors.js";
import { canonicalContentHash } from "@aise/backend-geometry";
import type { EpistemicState } from "@aise/shared-contracts";

const CONTENT_HASH_PATTERN = /^[0-9a-f]{64}$/;
const METHOD_PATTERN = /^[a-z0-9][a-z0-9./-]*$/;
const OBJECT_ID_PATTERN = /^(wall|floor|ceiling|door|window)-[0-9a-f]{16}$/;

/** Identity of this semantics extraction package. */
export const SEMANTICS_SERVICE_ID = "aise.semantics";

/** Method-lineage version: bump when any method's numerics change. */
export const SEMANTICS_METHOD_VERSION = "1.0.0";

/** A point-set input reference (content = canonically ordered points). */
export interface PointSetInputRef {
  readonly kind: "point-set";
  readonly pointCount: number;
  /** SHA-256 of the canonical serialization of the ordered point set. */
  readonly contentHash: string;
  /** Epistemic state of the point source, as declared by the caller. */
  readonly epistemic: EpistemicState;
}

/** A previously-extracted object used as input (a parent wall). */
export interface ObjectInputRef {
  readonly kind: "object";
  /** Method label of the producing extraction step. */
  readonly method: string;
  /** Deterministic content-derived object id (`wall-…`, `door-…`). */
  readonly objectId: string;
  /** SHA-256 of the canonical serialization of the object content. */
  readonly contentHash: string;
  /** Epistemic state of the object (extraction output is INFERRED). */
  readonly epistemic: EpistemicState;
}

export type SemanticInputRef = PointSetInputRef | ObjectInputRef;

/** Complete lineage record for one extracted object or scene. */
export interface ExtractionProvenance {
  /** Producing service identity. */
  readonly serviceId: string;
  /** Producing method label (e.g. "structure/wall-rectangle-v1"). */
  readonly method: string;
  /** Method lineage version (numerics contract). */
  readonly methodVersion: string;
  /**
   * The exact parameters record (fully materialized, JSON-shaped,
   * all numbers finite — hashing it must succeed). The parameters
   * travel with the object: an inspector must be able to reproduce
   * the computation.
   */
  readonly parameters: Readonly<Record<string, unknown>>;
  /** Non-empty input lineage. */
  readonly inputs: readonly SemanticInputRef[];
}

/** Builds a provenance record and validates it before returning it. */
export function extractionProvenance(
  method: string,
  parameters: Readonly<Record<string, unknown>>,
  inputs: readonly SemanticInputRef[],
): ExtractionProvenance {
  const provenance: ExtractionProvenance = {
    serviceId: SEMANTICS_SERVICE_ID,
    method,
    methodVersion: SEMANTICS_METHOD_VERSION,
    parameters,
    inputs,
  };
  validateExtractionProvenance(provenance);
  return provenance;
}

/** Canonical content hash of a provenance record (identity of lineage). */
export function provenanceContentHash(provenance: ExtractionProvenance): string {
  return canonicalContentHash(provenance);
}

/**
 * Fail-closed provenance validation: service identity, method
 * label, method version, a canonically serializable (finite)
 * parameters record, and a non-empty set of complete input
 * references. Throws `PROVENANCE_INCOMPLETE` on any gap.
 */
export function validateExtractionProvenance(provenance: ExtractionProvenance): void {
  if (provenance.serviceId !== SEMANTICS_SERVICE_ID) {
    throw new SemanticsError(
      "PROVENANCE_INCOMPLETE",
      `provenance serviceId must be "${SEMANTICS_SERVICE_ID}"`,
      { details: { field: "serviceId", value: provenance.serviceId } },
    );
  }
  if (typeof provenance.method !== "string" || !METHOD_PATTERN.test(provenance.method)) {
    throw new SemanticsError(
      "PROVENANCE_INCOMPLETE",
      `provenance method must be a lowercase label matching ${METHOD_PATTERN}: ${String(provenance.method)}`,
      { details: { field: "method", value: String(provenance.method) } },
    );
  }
  if (typeof provenance.methodVersion !== "string" || !/^\d+\.\d+\.\d+$/.test(provenance.methodVersion)) {
    throw new SemanticsError(
      "PROVENANCE_INCOMPLETE",
      `provenance methodVersion must be semver: ${String(provenance.methodVersion)}`,
      { details: { field: "methodVersion", value: String(provenance.methodVersion) } },
    );
  }
  if (
    provenance.parameters === null ||
    typeof provenance.parameters !== "object" ||
    Array.isArray(provenance.parameters)
  ) {
    throw new SemanticsError("PROVENANCE_INCOMPLETE", "provenance parameters must be a JSON object", {
      details: { field: "parameters" },
    });
  }
  try {
    canonicalContentHash(provenance.parameters);
  } catch (error) {
    throw new SemanticsError(
      "PROVENANCE_INCOMPLETE",
      `provenance parameters must be canonically serializable with finite numbers: ${error instanceof Error ? error.message : String(error)}`,
      { details: { field: "parameters" } },
    );
  }
  if (!Array.isArray(provenance.inputs) || provenance.inputs.length === 0) {
    throw new SemanticsError("PROVENANCE_INCOMPLETE", "provenance must cite at least one input", {
      details: { field: "inputs" },
    });
  }
  provenance.inputs.forEach((input, index) => {
    const label = `provenance.inputs[${index}]`;
    if (input === null || typeof input !== "object") {
      throw new SemanticsError("PROVENANCE_INCOMPLETE", `${label} must be an input reference`, {
        details: { field: label },
      });
    }
    if (typeof input.contentHash !== "string" || !CONTENT_HASH_PATTERN.test(input.contentHash)) {
      throw new SemanticsError("PROVENANCE_INCOMPLETE", `${label}.contentHash must be 64 hex chars`, {
        details: { field: `${label}.contentHash`, value: String(input.contentHash) },
      });
    }
    if (input.epistemic !== "OBSERVED" && input.epistemic !== "INFERRED" && input.epistemic !== "CONFIRMED" && input.epistemic !== "PROPOSED") {
      throw new SemanticsError("PROVENANCE_INCOMPLETE", `${label}.epistemic must be a valid state`, {
        details: { field: `${label}.epistemic`, value: String(input.epistemic) },
      });
    }
    if (input.kind === "point-set") {
      if (!Number.isInteger(input.pointCount) || input.pointCount < 1) {
        throw new SemanticsError("PROVENANCE_INCOMPLETE", `${label}.pointCount must be a positive integer`, {
          details: { field: `${label}.pointCount`, value: String(input.pointCount) },
        });
      }
    } else if (input.kind === "object") {
      if (typeof input.method !== "string" || !METHOD_PATTERN.test(input.method)) {
        throw new SemanticsError("PROVENANCE_INCOMPLETE", `${label}.method must be a method label`, {
          details: { field: `${label}.method`, value: String(input.method) },
        });
      }
      if (typeof input.objectId !== "string" || !OBJECT_ID_PATTERN.test(input.objectId)) {
        throw new SemanticsError("PROVENANCE_INCOMPLETE", `${label}.objectId must match ${OBJECT_ID_PATTERN}`, {
          details: { field: `${label}.objectId`, value: String(input.objectId) },
        });
      }
    } else {
      throw new SemanticsError("PROVENANCE_INCOMPLETE", `${label}.kind must be "point-set" or "object"`, {
        details: { field: `${label}.kind`, value: String((input as { kind?: unknown }).kind) },
      });
    }
  });
}

/**
 * Builds the point-set input reference for a canonically ordered
 * point set: content-pinned, epistemic-tagged.
 */
export function pointSetInputRef(
  points: ReadonlyArray<{ x: number; y: number; z: number }>,
  epistemic: EpistemicState,
): PointSetInputRef {
  return {
    kind: "point-set",
    pointCount: points.length,
    contentHash: canonicalContentHash(points),
    epistemic,
  };
}
