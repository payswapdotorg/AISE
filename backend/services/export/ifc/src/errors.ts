/**
 * Export-IFC error model (AISE-018).
 *
 * Every failure inside the IFC 4.3 export is a typed `ExportIfcError`
 * carrying a machine-readable `code`, a human-readable message,
 * structured `details`, and a `retryable` flag — mirroring the
 * sibling services' discipline that retry decisions are
 * data-driven (never message parsing).
 *
 * Default semantics are FAIL-CLOSED and NON-RETRYABLE by
 * construction: the export is a deterministic pure function of the
 * canonical graph, so re-running an identical input can never
 * succeed where it failed before. The only retryable code is
 * `INTERNAL_ERROR` (an implementation defect, not a property of
 * the input).
 *
 * Export impossibilities are never coerced: an object without
 * structured geometry is exported without body representation and
 * flagged `GeometryExported=No` in `Pset_AISEIdentity` — never
 * approximated into plausible IFC geometry (fail-closed display
 * beats fabrication, the AISE-017 discipline).
 */

/** Machine-readable failure codes for the IFC export. */
export type ExportIfcErrorCode =
  /** Well-formedness failure in the request, the graph, or the evidence input. */
  | "VALIDATION_FAILED"
  /** A coordinate/numeric input is not finite (NaN/±Infinity). */
  | "NON_FINITE_INPUT"
  /**
   * The model's declared space frame is absent, so no world
   * coordinate system or unit conversion can be derived
   * deterministically.
   */
  | "FRAME_DECLARATION_MISSING"
  /**
   * The supplied evidence graph belongs to a different project
   * than the model graph being exported.
   */
  | "EVIDENCE_PROJECT_MISMATCH"
  /**
   * A supplied evidence link references a record that the
   * evidence graph does not contain.
   */
  | "EVIDENCE_RECORD_MISSING"
  /**
   * The emitted STEP physical file failed the built-in schema
   * conformance validation (implementation defect — the service
   * never returns an unvalidated file).
   */
  | "EXPORT_INVALID"
  /** Unexpected internal failure (implementation defect). */
  | "INTERNAL_ERROR";

/** Structured details payload for IFC export failures. */
export interface ExportIfcErrorDetails {
  readonly [key: string]: unknown;
}

/** Typed, fail-closed IFC-export failure. */
export class ExportIfcError extends Error {
  readonly code: ExportIfcErrorCode;
  readonly details: ExportIfcErrorDetails;
  readonly retryable: boolean;

  constructor(
    code: ExportIfcErrorCode,
    message: string,
    options: {
      details?: ExportIfcErrorDetails;
      retryable?: boolean;
    } = {},
  ) {
    super(message);
    this.name = "ExportIfcError";
    this.code = code;
    this.details = options.details ?? {};
    this.retryable = options.retryable ?? code === "INTERNAL_ERROR";
  }
}

/** Narrow an unknown thrown value to an `ExportIfcError` if possible. */
export function toExportIfcError(error: unknown): ExportIfcError | null {
  return error instanceof ExportIfcError ? error : null;
}
