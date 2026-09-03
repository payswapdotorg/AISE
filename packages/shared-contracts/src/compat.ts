/**
 * Tolerant-reader helpers implementing the compatibility rules for
 * cross-MINOR reading inside one MAJOR version. Readers use these so
 * newer-MINOR payloads cannot break older consumers.
 */
import type { SyncError } from "./types.js";

/** Sentinel returned when a value is not one of the known enum values. */
export const UNKNOWN_ENUM = "unknown" as const;

export type EnumOrUnknown<T extends string> = T | typeof UNKNOWN_ENUM;

/**
 * Maps a possibly-unknown enum value onto the known vocabulary,
 * returning the `unknown` sentinel for unrecognized values. Readers
 * MUST use this (or equivalent behaviour) instead of failing or
 * coercing to a default member.
 */
export function tolerateEnumValue<T extends string>(
  value: string,
  known: readonly T[],
): EnumOrUnknown<T> {
  return (known as readonly string[]).includes(value) ? (value as T) : UNKNOWN_ENUM;
}

/** True when the payload is an object (envelope-like) at all. */
export function isEnvelopeLike(payload: unknown): payload is Record<string, unknown> {
  return typeof payload === "object" && payload !== null && !Array.isArray(payload);
}

/**
 * Extracts `contractVersion` for dispatch without deep parsing.
 * Returns null when absent or not a string.
 */
export function readContractVersion(payload: unknown): string | null {
  if (!isEnvelopeLike(payload)) {
    return null;
  }
  const version = payload["contractVersion"];
  return typeof version === "string" ? version : null;
}

/**
 * Returns only the recognized fields of `payload` (those in
 * `knownFields`), implementing the reader rule "ignore
 * unrecognized fields". Used after version dispatch when an older
 * reader consumes a newer-MINOR payload.
 */
export function stripUnknownFields(
  payload: Record<string, unknown>,
  knownFields: readonly string[],
): Record<string, unknown> {
  const keep: Record<string, unknown> = {};
  for (const field of knownFields) {
    if (field in payload) {
      keep[field] = payload[field];
    }
  }
  return keep;
}

/**
 * Derives the retry decision from error DATA (the `retryable` and
 * `retryAfterMs` fields), never from the code string. This is the
 * client-side rule that keeps new error codes from changing client
 * behaviour implicitly.
 */
export function syncRetryDecision(
  error: Pick<SyncError, "retryable" | "retryAfterMs">,
): "retry_now" | "retry_after" | "halt" {
  if (!error.retryable) {
    return "halt";
  }
  return error.retryAfterMs === undefined ? "retry_now" : "retry_after";
}
