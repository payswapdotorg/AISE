/**
 * Provenance model for the Reality Graph core (AISE-011).
 *
 * Every derived entity in the model — every ingested object, every
 * committed version — must identify its producing service, method,
 * method lineage version, materialized parameters, and non-empty
 * content-pinned inputs (architecture §4.5: "every consequential
 * assertion can point to source evidence and transformation
 * method"; requirements AC-061).
 *
 * This is the provenance *representation* and its fail-closed
 * validation. The evidence subsystem proper (evidence records,
 * immutable source identity, verification invalidation) is
 * AISE-012's surface; assertions here carry evidence *reference*
 * slots that AISE-012 will bind. `CONFIRMED` assertions already
 * require non-empty evidence references today (AC-062: "a verified
 * assertion without required provenance is rejected").
 *
 * Mirrors the AISE-009/010 provenance discipline with a
 * model-domain service identity and three input-reference kinds:
 * upstream scenes, upstream objects, and point sets.
 */
import { EngineeringModelError } from "./errors.js";
import { canonicalContentHash } from "./canonical.js";
import { assertValidEpistemicState, type EpistemicState } from "./epistemic.js";

const CONTENT_HASH_PATTERN = /^[0-9a-f]{64}$/;
const METHOD_PATTERN = /^[a-z0-9][a-z0-9./-]*$/;
const SERVICE_ID_PATTERN = /^[a-z0-9][a-z0-9._-]*$/;
const VERSION_PATTERN = /^\d+\.\d+\.\d+$/;

/** Identity of the canonical model package. */
export const MODEL_SERVICE_ID = "aise.engineering-model";

/** Method-lineage version: bump when any method's semantics change. */
export const MODEL_METHOD_VERSION = "1.0.0";

/** A referenced upstream architectural scene (content-pinned). */
export interface SceneInputRef {
  readonly kind: "scene";
  /** Upstream scene identity (e.g. `scene-<hex16>`). */
  readonly sceneId: string;
  /** SHA-256 of the canonical serialization of the scene content. */
  readonly contentHash: string;
  /** Epistemic state of the scene. */
  readonly epistemic: EpistemicState;
}

/** A referenced upstream object (content-pinned). */
export interface ObjectInputRef {
  readonly kind: "object";
  /** Producing service identity (e.g. "aise.semantics"). */
  readonly serviceId: string;
  /** Producing method label. */
  readonly method: string;
  /** Upstream object identity. */
  readonly objectId: string;
  /** SHA-256 of the canonical serialization of the object content. */
  readonly contentHash: string;
  /** Epistemic state of the upstream object. */
  readonly epistemic: EpistemicState;
}

/** A referenced point set (content-pinned). */
export interface PointSetInputRef {
  readonly kind: "point-set";
  readonly pointCount: number;
  /** SHA-256 of the canonical serialization of the ordered point set. */
  readonly contentHash: string;
  /** Epistemic state of the point source. */
  readonly epistemic: EpistemicState;
}

export type ModelInputRef = SceneInputRef | ObjectInputRef | PointSetInputRef;

/** Complete lineage record for one derived model entity or version. */
export interface ModelProvenance {
  /** Producing service identity. */
  readonly serviceId: string;
  /** Producing method label (e.g. "ingest/architectural-scene-v1"). */
  readonly method: string;
  /** Method lineage version (semantics contract). */
  readonly methodVersion: string;
  /**
   * The exact parameters record (fully materialized, JSON-shaped,
   * all numbers finite — canonical serialization must succeed).
   */
  readonly parameters: Readonly<Record<string, unknown>>;
  /** Non-empty input lineage. */
  readonly inputs: readonly ModelInputRef[];
}

/** Builds a provenance record and validates it before returning it. */
export function modelProvenance(
  method: string,
  parameters: Readonly<Record<string, unknown>>,
  inputs: readonly ModelInputRef[],
): ModelProvenance {
  const provenance: ModelProvenance = {
    serviceId: MODEL_SERVICE_ID,
    method,
    methodVersion: MODEL_METHOD_VERSION,
    parameters,
    inputs,
  };
  validateModelProvenance(provenance);
  return provenance;
}

/**
 * Fail-closed provenance validation: service identity, method
 * label, method version, a canonically serializable (finite)
 * parameters record, and a non-empty set of complete input
 * references. Throws `PROVENANCE_INCOMPLETE` on any gap.
 */
export function validateModelProvenance(provenance: ModelProvenance): void {
  if (typeof provenance.serviceId !== "string" || !SERVICE_ID_PATTERN.test(provenance.serviceId)) {
    throw new EngineeringModelError(
      "PROVENANCE_INCOMPLETE",
      `provenance serviceId must match ${SERVICE_ID_PATTERN}: ${String(provenance.serviceId)}`,
      { details: { field: "serviceId", value: String(provenance.serviceId) } },
    );
  }
  if (typeof provenance.method !== "string" || !METHOD_PATTERN.test(provenance.method)) {
    throw new EngineeringModelError(
      "PROVENANCE_INCOMPLETE",
      `provenance method must match ${METHOD_PATTERN}: ${String(provenance.method)}`,
      { details: { field: "method", value: String(provenance.method) } },
    );
  }
  if (typeof provenance.methodVersion !== "string" || !VERSION_PATTERN.test(provenance.methodVersion)) {
    throw new EngineeringModelError(
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
    throw new EngineeringModelError(
      "PROVENANCE_INCOMPLETE",
      "provenance parameters must be a JSON-shaped record",
      { details: { field: "parameters", value: typeof provenance.parameters } },
    );
  }
  try {
    parametersHash(provenance.parameters);
  } catch (error) {
    throw new EngineeringModelError(
      "PROVENANCE_INCOMPLETE",
      `provenance parameters are not canonically serializable: ${error instanceof Error ? error.message : String(error)}`,
      { details: { field: "parameters" } },
    );
  }
  if (!Array.isArray(provenance.inputs) || provenance.inputs.length === 0) {
    throw new EngineeringModelError(
      "PROVENANCE_INCOMPLETE",
      "provenance inputs must be a non-empty array",
      { details: { field: "inputs", value: String(provenance.inputs?.length) } },
    );
  }
  provenance.inputs.forEach((input, index) => validateInputRef(input, `inputs[${index}]`));
}

function validateInputRef(input: ModelInputRef, field: string): void {
  if (input === null || typeof input !== "object") {
    throw new EngineeringModelError(
      "PROVENANCE_INCOMPLETE",
      `${field} must be an input reference record`,
      { details: { field, value: String(input) } },
    );
  }
  switch (input.kind) {
    case "scene":
      requireString(input.sceneId, `${field}.sceneId`);
      requireHash(input.contentHash, `${field}.contentHash`);
      assertValidEpistemicState(input.epistemic, `${field}.epistemic`);
      return;
    case "object":
      requireString(input.serviceId, `${field}.serviceId`);
      requireString(input.method, `${field}.method`);
      requireString(input.objectId, `${field}.objectId`);
      requireHash(input.contentHash, `${field}.contentHash`);
      assertValidEpistemicState(input.epistemic, `${field}.epistemic`);
      return;
    case "point-set":
      if (!Number.isInteger(input.pointCount) || input.pointCount < 0) {
        throw new EngineeringModelError(
          "PROVENANCE_INCOMPLETE",
          `${field}.pointCount must be a non-negative integer: ${String(input.pointCount)}`,
          { details: { field: `${field}.pointCount`, value: String(input.pointCount) } },
        );
      }
      requireHash(input.contentHash, `${field}.contentHash`);
      assertValidEpistemicState(input.epistemic, `${field}.epistemic`);
      return;
    default:
      throw new EngineeringModelError(
        "PROVENANCE_INCOMPLETE",
        `${field} has unknown input reference kind: ${String((input as { kind?: unknown }).kind)}`,
        { details: { field: `${field}.kind`, value: String((input as { kind?: unknown }).kind) } },
      );
  }
}

function requireString(value: unknown, field: string): void {
  if (typeof value !== "string" || value.length === 0) {
    throw new EngineeringModelError(
      "PROVENANCE_INCOMPLETE",
      `${field} must be a non-empty string: ${String(value)}`,
      { details: { field, value: String(value) } },
    );
  }
}

function requireHash(value: string, field: string): void {
  if (typeof value !== "string" || !CONTENT_HASH_PATTERN.test(value)) {
    throw new EngineeringModelError(
      "PROVENANCE_INCOMPLETE",
      `${field} must be a lowercase 64-hex content hash: ${String(value)}`,
      { details: { field, value: String(value) } },
    );
  }
}

/**
 * Canonical content hash of a parameters record (identity of the
 * materialized parameters). Exported for tests and adapters.
 */
export function parametersHash(parameters: Readonly<Record<string, unknown>>): string {
  return canonicalContentHash(parameters);
}
