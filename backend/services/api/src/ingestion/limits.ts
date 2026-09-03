/**
 * Size limits for the capture ingestion boundary.
 *
 * The JSON limit bounds envelope documents (project/session/package
 * manifests). The upload limit bounds one logical asset payload; the
 * multipart framing that carries the envelope plus payload is allowed
 * a fixed overhead on top.
 *
 * Limits are constants (not configuration) for v1.0: they are
 * documented gateway behaviour, and the work order does not assign
 * the shared configuration package to AISE-004. They are injectable
 * in tests to exercise the fail-closed paths cheaply.
 */
export interface IngestionLimits {
  /** Maximum accepted JSON request body (envelope documents). */
  readonly maxJsonBodyBytes: number;
  /** Maximum accepted logical asset payload size in bytes. */
  readonly maxUploadBytes: number;
}

export const DEFAULT_INGESTION_LIMITS: IngestionLimits = {
  maxJsonBodyBytes: 8 * 1024 * 1024,
  maxUploadBytes: 128 * 1024 * 1024,
};

/**
 * Multipart framing overhead permitted on top of the payload bytes:
 * boundary delimiters, part headers and the JSON envelope.
 */
export const MULTIPART_OVERHEAD_BYTES = 1024 * 1024;
