/**
 * PROD-025 — Solution BOQ endpoints, domain model.
 *
 * Contract (docs/productization-work-orders.md §PROD-025;
 * spec/solution-operation-contract.md "BOQ derivation and bidirectional
 * navigation"; ACR-005):
 *
 * THE SOLUTION-BOQ HTTP SURFACE IS A STATELESS DETERMINISTIC TOOL SET,
 * never an authority and never a source-BOQ store:
 *
 *  - every request carries its own inputs (the validated version, the
 *    declared snapshot, the previously generated BOQ); the service holds
 *    NO store, NO clock and NO state — the same request bytes always
 *    produce the same response bytes;
 *  - wire payloads are decoded through the CONTRACT's STRICT decoders
 *    (`decodeSolutionVersionStrict`, `decodeSolutionValidationSnapshotStrict`)
 *    and the package's typed seal (`isSolutionGeneratedBoq` +
 *    `verifySolutionBoq`); typed errors on any violation, never a silent
 *    coercion;
 *  - the derivation gates (snapshot identity/integrity/outcome/bytes/
 *    declaration, empty version) surface as the package's typed codes,
 *    re-thrown 1:1 as service errors (stable machine-readable codes);
 *  - there is NO write path into any source BOQ store: the module imports
 *    the source BOQ module's TYPES only (read-only type imports — the
 *    execution module's record-keeper discipline) and the generated BOQ
 *    references a source BOQ by identity only.
 *
 * This module owns the request/response shapes, the typed error registry
 * and the boundary parsers (shape → typed codes, the solution module's
 * hand-rolled discipline). Policy lives in service.ts; transport in
 * router.ts.
 */

import type { SolutionBoq } from "@aise/solution-boq";

/* ------------------------------------------------------------------ */
/* Typed errors (stable codes; the router maps them to HTTP)            */
/* ------------------------------------------------------------------ */

export const SOLUTION_BOQ_SERVICE_ERROR_CODES = Object.freeze([
  // shape / boundary validation (400/422 at the HTTP boundary)
  "invalid_request",
  "invalid_version",
  "invalid_snapshot",
  "invalid_source_ref",
  "invalid_boq",
  "invalid_boq_line_id",
  "invalid_operation_id",
  "boq_integrity_mismatch",
  "malformed_json",
  // derivation gates (mirror of @aise/solution-boq's typed codes)
  "snapshot_version_mismatch",
  "snapshot_identity_mismatch",
  "snapshot_input_digest_mismatch",
  "snapshot_declaration_mismatch",
  "snapshot_outcome_fail",
  "empty_version",
  "solution_mismatch",
  "internal_invariant",
  // navigation
  "unknown_boq_line",
  "unknown_operation",
] as const);
export type SolutionBoqServiceErrorCode = (typeof SOLUTION_BOQ_SERVICE_ERROR_CODES)[number];

/** One typed solution-BOQ endpoint error (fail closed, never silent). */
export class SolutionBoqServiceError extends Error {
  readonly code: SolutionBoqServiceErrorCode;
  readonly detail: string;

  constructor(code: SolutionBoqServiceErrorCode, detail: string) {
    super(`${code}: ${detail}`);
    this.name = "SolutionBoqServiceError";
    this.code = code;
    this.detail = detail;
  }
}

/* ------------------------------------------------------------------ */
/* Request shapes                                                       */
/* ------------------------------------------------------------------ */

/** POST /v1/solutions/boq/generate — derive the BOQ from a declared snapshot. */
export interface GenerateBoqRequest {
  readonly version: unknown;
  readonly snapshot: unknown;
  readonly sourceBoqRef?: unknown;
}

/** POST /v1/solutions/boq/readback — the versioned readback of a generated BOQ. */
export interface ReadbackBoqRequest {
  readonly boq: unknown;
}

/** POST /v1/solutions/boq/line-operations — BOQ line → contributing steps. */
export interface LineOperationsRequest {
  readonly boq: unknown;
  readonly boqLineId: string;
}

/** POST /v1/solutions/boq/operation-lines — operation → affected lines. */
export interface OperationLinesRequest {
  readonly boq: unknown;
  readonly operationId: string;
}

/* ------------------------------------------------------------------ */
/* Response shapes                                                      */
/* ------------------------------------------------------------------ */

export interface GenerateBoqResponse {
  readonly boq: SolutionBoq;
}

export interface ReadbackBoqResponse {
  readonly boq: SolutionBoq;
  readonly verification: {
    readonly boqId: string;
    readonly solutionId: string;
    readonly versionNumber: number;
    readonly validationSnapshotRef: string;
    readonly lineCount: number;
    readonly sectionCount: number;
    readonly assumptionCount: number;
    readonly operationCount: number;
  };
}

export interface LineOperationsResponse {
  readonly boqLineId: string;
  readonly itemDescription: string;
  readonly contributions: readonly {
    readonly operationId: string;
    readonly operationIndex: number;
    readonly contributionKind: string;
    readonly operationValue: number;
    readonly geometryRefs: readonly { readonly kind: string; readonly ref: string }[];
    readonly nodeRefs: readonly string[];
    readonly resultingStateRef: string;
  }[];
}

export interface OperationLinesResponse {
  readonly operationId: string;
  readonly lines: readonly {
    readonly boqLineId: string;
    readonly sectionId: string;
    readonly activity: string;
    readonly itemDescription: string;
    readonly unit: string;
    readonly material?: string;
    readonly contributionKind: string;
    readonly operationValue: number;
    readonly quantity: {
      readonly dimension: string;
      readonly value: number;
      readonly unit: string;
      readonly calculationRef: string;
    };
  }[];
}

/* ------------------------------------------------------------------ */
/* Boundary parsers (shape → typed errors; hand-rolled discipline)      */
/* ------------------------------------------------------------------ */

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** Parses the POST /v1/solutions/boq/generate request body (fail closed). */
export function parseGenerateBoqRequest(payload: unknown): GenerateBoqRequest {
  if (!isRecord(payload)) {
    throw new SolutionBoqServiceError("invalid_request", "expected a JSON object body");
  }
  const version = payload["version"];
  if (!isRecord(version)) {
    throw new SolutionBoqServiceError(
      "invalid_version",
      "version must be a SolutionVersion-shaped object (the validated solution version)",
    );
  }
  const snapshot = payload["snapshot"];
  if (!isRecord(snapshot)) {
    throw new SolutionBoqServiceError(
      "invalid_snapshot",
      "snapshot must be a SolutionValidationSnapshot-shaped object (the declared snapshot)",
    );
  }
  const sourceBoqRef = payload["sourceBoqRef"];
  if (sourceBoqRef !== undefined && !isRecord(sourceBoqRef)) {
    throw new SolutionBoqServiceError(
      "invalid_source_ref",
      "sourceBoqRef, when present, must be a source-boq identity object " +
        "{ kind: 'source-boq-reference', importId, mediaType, byteSize } — " +
        "an identity-only reference; the source BOQ is never overwritten",
    );
  }
  return {
    version,
    snapshot,
    ...(sourceBoqRef === undefined ? {} : { sourceBoqRef }),
  };
}

/** Parses the POST /v1/solutions/boq/readback request body (fail closed). */
export function parseReadbackBoqRequest(payload: unknown): ReadbackBoqRequest {
  if (!isRecord(payload)) {
    throw new SolutionBoqServiceError("invalid_request", "expected a JSON object body");
  }
  const boq = payload["boq"];
  if (!isRecord(boq)) {
    throw new SolutionBoqServiceError(
      "invalid_boq",
      "boq must be a solution-generated BOQ document (artifactKind 'solution-generated-boq')",
    );
  }
  return { boq };
}

/** Parses the POST /v1/solutions/boq/line-operations request body (fail closed). */
export function parseLineOperationsRequest(payload: unknown): LineOperationsRequest {
  if (!isRecord(payload)) {
    throw new SolutionBoqServiceError("invalid_request", "expected a JSON object body");
  }
  const boq = payload["boq"];
  if (!isRecord(boq)) {
    throw new SolutionBoqServiceError(
      "invalid_boq",
      "boq must be a solution-generated BOQ document (artifactKind 'solution-generated-boq')",
    );
  }
  const boqLineId = payload["boqLineId"];
  if (typeof boqLineId !== "string" || boqLineId.trim().length === 0) {
    throw new SolutionBoqServiceError(
      "invalid_boq_line_id",
      "boqLineId is required and must be a non-empty string (the generated line's id)",
    );
  }
  return { boq, boqLineId };
}

/** Parses the POST /v1/solutions/boq/operation-lines request body (fail closed). */
export function parseOperationLinesRequest(payload: unknown): OperationLinesRequest {
  if (!isRecord(payload)) {
    throw new SolutionBoqServiceError("invalid_request", "expected a JSON object body");
  }
  const boq = payload["boq"];
  if (!isRecord(boq)) {
    throw new SolutionBoqServiceError(
      "invalid_boq",
      "boq must be a solution-generated BOQ document (artifactKind 'solution-generated-boq')",
    );
  }
  const operationId = payload["operationId"];
  if (typeof operationId !== "string" || operationId.trim().length === 0) {
    throw new SolutionBoqServiceError(
      "invalid_operation_id",
      "operationId is required and must be a non-empty string (the solution step's id)",
    );
  }
  return { boq, operationId };
}
