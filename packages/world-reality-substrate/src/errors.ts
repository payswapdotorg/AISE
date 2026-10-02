/**
 * `@aise/world-reality-substrate` — typed failure vocabulary (WORLD-P0-A).
 *
 * Fail-closed law (technology-substitution-contract law 3): an unsupported
 * or malformed input is answered by an EXPLICIT typed refusal — never by
 * fabricated output, never by a partially-loaded scene, never by a silent
 * downgrade. Every adapter failure carries a closed `code` from this file
 * so refusals are machine-readable evidence, and every refusal reports
 * which substrate contract produced it.
 */

/** Closed failure-code vocabulary for all five Reality-layer adapters. */
export const SUBSTRATE_FAILURE_CODES = [
  // request-shape failures (before any substrate call)
  "scene_invalid",
  "request_invalid",
  "unsupported_format",
  "unsupported_operation",
  // asset delivery failures
  "asset_not_found",
  "asset_unreadable",
  "asset_malformed",
  // substrate-runtime failures
  "substrate_unavailable",
  "substrate_capacity_exceeded",
  "substrate_internal_error",
  // authority violations (must never be reachable in a conforming adapter)
  "identity_leak_detected",
] as const;
export type SubstrateFailureCode = (typeof SUBSTRATE_FAILURE_CODES)[number];

/** A typed, machine-readable substrate adapter refusal. */
export interface SubstrateFailure {
  readonly code: SubstrateFailureCode;
  /** Which port refused, e.g. `gltf.parse`. */
  readonly port: string;
  /** Human-readable detail (never a stack trace). */
  readonly detail: string;
  /** The AISE element/asset id involved, when one was in hand. */
  readonly subjectId: string | null;
}

/** Discriminated success/refusal outcome (the port return shape). */
export type SubstrateOutcome<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly failure: SubstrateFailure };

/** Construct a success outcome. */
export function ok<T>(value: T): SubstrateOutcome<T> {
  return { ok: true, value };
}

/** Construct a typed refusal. */
export function refuse(
  code: SubstrateFailureCode,
  port: string,
  detail: string,
  subjectId: string | null = null,
): SubstrateOutcome<never> {
  return {
    ok: false,
    failure: { code, port, detail, subjectId },
  };
}

/** Type guard: is this outcome a refusal? */
export function isRefusal<T>(
  outcome: SubstrateOutcome<T>,
): outcome is { ok: false; failure: SubstrateFailure } {
  return outcome.ok === false;
}
