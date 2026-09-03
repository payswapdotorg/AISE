/**
 * Field validators shared by the reconstruction stages (AISE-008).
 *
 * These re-validate, inside the reconstruction boundary, facts that
 * the capture contract (AISE-003) and the ingestion gateway (AISE-004)
 * already guarantee for committed uploads. Redundant verification is
 * deliberate — defense in depth: reconstruction artifacts become
 * derived evidence, so the pipeline must confirm raw-evidence
 * well-formedness itself rather than trusting a prior process.
 *
 * All failures throw `ReconstructionError` with `VALIDATION_FAILED`
 * and the offending field path in `details` (fail closed, never
 * silently corrected: a quaternion is accepted as recorded or
 * rejected, never renormalized).
 */
import type {
  ContentHash,
  Geolocation,
  OrientationQuaternion,
  Timestamp,
} from "@aise/shared-contracts";
import { ReconstructionError } from "./errors.js";

const CONTENT_HASH_PATTERN = /^[0-9a-f]{64}$/;

/** True for a finite number (rejects NaN, ±Infinity). */
export function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/** Validates a lowercase-hex SHA-256 content hash. */
export function assertContentHash(hash: ContentHash, field: string): void {
  if (!CONTENT_HASH_PATTERN.test(hash)) {
    throw new ReconstructionError("VALIDATION_FAILED", `${field} must be a lowercase-hex sha-256 hash`, {
      details: { field, value: hash },
    });
  }
}

/**
 * Validates an RFC 3339 timestamp string (parseable, finite epoch).
 * Returns the parsed epoch milliseconds.
 */
export function assertTimestamp(timestamp: Timestamp, field: string): number {
  const epochMs = Date.parse(timestamp);
  if (Number.isNaN(epochMs) || !Number.isFinite(epochMs)) {
    throw new ReconstructionError("VALIDATION_FAILED", `${field} must be an RFC 3339 timestamp`, {
      details: { field, value: timestamp },
    });
  }
  return epochMs;
}

/**
 * Validates an acquisition orientation quaternion: all four
 * components finite and a non-zero norm. A degenerate (zero) or
 * non-finite quaternion cannot describe an orientation, so it is
 * rejected rather than silently normalized.
 */
export function assertOrientationQuaternion(
  quaternion: OrientationQuaternion,
  field: string,
): void {
  const components = { x: quaternion.x, y: quaternion.y, z: quaternion.z, w: quaternion.w };
  for (const [name, value] of Object.entries(components)) {
    if (!isFiniteNumber(value)) {
      throw new ReconstructionError(
        "VALIDATION_FAILED",
        `${field}.${name} must be a finite number`,
        { details: { field, component: name, value } },
      );
    }
  }
  const norm = Math.sqrt(
    quaternion.x * quaternion.x +
      quaternion.y * quaternion.y +
      quaternion.z * quaternion.z +
      quaternion.w * quaternion.w,
  );
  if (norm === 0) {
    throw new ReconstructionError("VALIDATION_FAILED", `${field} must have non-zero norm`, {
      details: { field },
    });
  }
}

/** Validates geolocation ranges (mirrors the v1.0 contract schema). */
export function assertGeolocation(geolocation: Geolocation, field: string): void {
  if (!isFiniteNumber(geolocation.latitude) || geolocation.latitude < -90 || geolocation.latitude > 90) {
    throw new ReconstructionError("VALIDATION_FAILED", `${field}.latitude must be within [-90, 90]`, {
      details: { field, value: geolocation.latitude },
    });
  }
  if (
    !isFiniteNumber(geolocation.longitude) ||
    geolocation.longitude < -180 ||
    geolocation.longitude > 180
  ) {
    throw new ReconstructionError("VALIDATION_FAILED", `${field}.longitude must be within [-180, 180]`, {
      details: { field, value: geolocation.longitude },
    });
  }
  if (geolocation.altitudeM !== undefined && !isFiniteNumber(geolocation.altitudeM)) {
    throw new ReconstructionError("VALIDATION_FAILED", `${field}.altitudeM must be finite`, {
      details: { field, value: geolocation.altitudeM },
    });
  }
  if (geolocation.accuracyM !== undefined && !isFiniteNumber(geolocation.accuracyM)) {
    throw new ReconstructionError("VALIDATION_FAILED", `${field}.accuracyM must be finite`, {
      details: { field, value: geolocation.accuracyM },
    });
  }
}
