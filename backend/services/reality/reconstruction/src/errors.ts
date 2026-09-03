/**
 * Reconstruction error model (AISE-008).
 *
 * Every failure inside the reconstruction pipeline is a typed
 * `ReconstructionError` carrying a machine-readable `code`, a
 * human-readable message, structured `details`, and a `retryable`
 * flag — mirroring the AISE-003 discipline that retry decisions are
 * data-driven (never message parsing).
 *
 * Default semantics are FAIL-CLOSED: `retryable` is `false` unless a
 * caller explicitly opts in, and the v1.0 foundation runner has no
 * automatic retry policy at all. An ambiguous or incomplete
 * reconstruction input never produces partial authoritative state —
 * it throws.
 */

/** Machine-readable failure codes for the reconstruction pipeline. */
export type ReconstructionErrorCode =
  /** The capture source does not know the requested session. */
  | "SESSION_NOT_FOUND"
  /** The session is known but carries zero committed uploads. */
  | "NO_COMMITTED_UPLOADS"
  /**
   * An upload's asset type cannot be routed — including the
   * cross-MINOR reader sentinel (`unknown`), which is ambiguous
   * about whether the asset is reconstructable.
   */
  | "UNKNOWN_ASSET_TYPE"
  /** No upload in the session is usable as a reconstruction frame. */
  | "NO_RECONSTRUCTABLE_FRAMES"
  /** Byte-level evidence does not match its declared/recorded hashes. */
  | "INTEGRITY_MISMATCH"
  /** Well-formedness failure in records or parameters. */
  | "VALIDATION_FAILED"
  /** Artifact provenance is missing required lineage data. */
  | "PROVENANCE_INCOMPLETE"
  /**
   * An artifact claims an epistemic state reconstruction cannot
   * produce (reconstruction output is INFERRED, never OBSERVED,
   * CONFIRMED, or PROPOSED).
   */
  | "EPISTEMIC_STATE_INVALID"
  /** A successful reconstruction produced zero points. */
  | "EMPTY_RECONSTRUCTION"
  /** A scene artifact references zero point clouds. */
  | "EMPTY_SCENE"
  /** A reconstruction engine returned a malformed success/failure. */
  | "INVALID_ENGINE_OUTPUT"
  /** A pose estimator returned a malformed result. */
  | "INVALID_POSE_OUTPUT"
  /** The registered reconstruction engine itself reported failure. */
  | "ENGINE_FAILED"
  /** The pose stage could not establish poses for every frame. */
  | "POSE_ESTIMATION_FAILED"
  /** No reconstruction engine is registered — cannot reconstruct. */
  | "NO_RECONSTRUCTION_ENGINE"
  /** No pose estimator is registered — cannot run the pose stage. */
  | "NO_POSE_ESTIMATOR"
  /** The bound capture source is not wired to ingestion state yet. */
  | "CAPTURE_SOURCE_UNAVAILABLE"
  /** An artifact id was reused for different content. */
  | "ARTIFACT_ID_CONFLICT"
  /** A referenced artifact does not exist. */
  | "ARTIFACT_NOT_FOUND"
  /** A scene reference does not resolve to the declared content. */
  | "SCENE_REFERENCE_INVALID"
  /**
   * A scene's pose set does not correspond exactly to its frame set:
   * a frame without a pose, a pose for a frame the scene does not
   * carry, or a pose whose assetId differs from its frame's assetId.
   */
  | "SCENE_POSE_FRAME_MISMATCH"
  /** Unexpected internal failure. */
  | "INTERNAL_ERROR";

export interface ReconstructionErrorOptions {
  /** Structured, code-specific details. */
  readonly details?: Record<string, unknown>;
  /**
   * Retryability override. Default: `false` (fail closed). The v1.0
   * foundation has no automatic retry policy; a durable transport
   * work item may honor this flag later.
   */
  readonly retryable?: boolean;
}

/** A typed reconstruction failure. Handlers catch and record these. */
export class ReconstructionError extends Error {
  readonly code: ReconstructionErrorCode;
  readonly retryable: boolean;
  readonly details: Record<string, unknown> | undefined;

  constructor(
    code: ReconstructionErrorCode,
    message: string,
    options: ReconstructionErrorOptions = {},
  ) {
    super(message);
    this.name = "ReconstructionError";
    this.code = code;
    this.retryable = options.retryable ?? false;
    this.details = options.details;
  }
}

/** Normalizes any thrown value into a `ReconstructionError`. */
export function toReconstructionError(error: unknown): ReconstructionError {
  if (error instanceof ReconstructionError) {
    return error;
  }
  const message = error instanceof Error ? error.message : String(error);
  return new ReconstructionError("INTERNAL_ERROR", message);
}
