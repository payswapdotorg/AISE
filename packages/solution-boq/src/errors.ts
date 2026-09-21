/**
 * Solution BOQ typed errors (PROD-025) — fail closed, never silent.
 *
 * Every refusal of the deterministic derivation carries a stable
 * machine-readable code (mirroring the engine's `EngineReason` and the
 * backend solution module's `SolutionError` disciplines). The codes are
 * FROZEN reference data: the backend transport maps them 1:1 to its HTTP
 * error vocabulary.
 */

export const SOLUTION_BOQ_ERROR_CODES = [
  /** The snapshot does not pin this solution/version (identity mismatch). */
  "snapshot_version_mismatch",
  /** The snapshot's deterministic identity does not re-derive from its content. */
  "snapshot_identity_mismatch",
  /** The snapshot does not certify these version bytes (input digest mismatch). */
  "snapshot_input_digest_mismatch",
  /** The version declares a DIFFERENT validation snapshot than the generating one. */
  "snapshot_declaration_mismatch",
  /** The snapshot's worst-of outcome is `fail` — a failed version is not BOQ-generatable. */
  "snapshot_outcome_fail",
  /** No quantity-carrying operation exists — a BOQ of zero lines is not generatable. */
  "empty_version",
  /** Version-pair comparison across DIFFERENT solutions. */
  "solution_mismatch",
  /** Internal defense-in-depth guard (the emitted BOQ failed self-verification). */
  "internal_invariant",
] as const;
export type SolutionBoqErrorCode = (typeof SOLUTION_BOQ_ERROR_CODES)[number];

/** One typed solution-BOQ derivation error (stable code + explicit detail). */
export class SolutionBoqError extends Error {
  readonly code: SolutionBoqErrorCode;
  readonly detail: string;

  constructor(code: SolutionBoqErrorCode, detail: string) {
    super(`${code}: ${detail}`);
    this.name = "SolutionBoqError";
    this.code = code;
    this.detail = detail;
  }
}
