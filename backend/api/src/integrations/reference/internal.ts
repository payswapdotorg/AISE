/**
 * AISE-037 — Shared internals of the deterministic REFERENCE adapters.
 *
 * The reference adapters prove the contract is implementable and swappable:
 * pure in-memory incumbents, injected snapshot readers, injected failure
 * scripts, full scope enforcement — the same relationship the AISE-012
 * deterministic simulation backends have to the real WorldSculpt engine.
 * Real connectors are injected implementations of the SAME ports.
 *
 * Nothing here performs network I/O; every "incumbent system" is an
 * in-memory fixture whose served bytes are deterministic functions of the
 * fixture content.
 */

import { INTEGRATION_FAILURE_CODES } from "../model";
import type { IntegrationFailure, IntegrationFailureCode } from "../model";
import type { ScopeCheck } from "../permissions";

/**
 * The R14 provenance note stamped on EVERY derived export: an exporter is
 * never canonical; the projection derives from the named snapshot version.
 */
export const DERIVED_PROJECTION_NOTE =
  "derived projection of a canonical snapshot; export is derived and never " +
  "becomes canonical (R14: no exporter becomes canonical)";

/**
 * Scripted per-CALL failure injection (deterministic tests): each adapter
 * call consumes one entry in order; `null` means "proceed normally"; entries
 * beyond the script's end mean success. Scope refusals do NOT consume
 * entries (they happen before the incumbent is touched).
 */
export type FailureScript = readonly (IntegrationFailureCode | null)[];

/** Validate a failure script at construction time (unknown codes refused). */
export function validateFailureScript(script: FailureScript): void {
  for (const code of script) {
    if (code !== null && !(INTEGRATION_FAILURE_CODES as readonly string[]).includes(code)) {
      throw new Error(
        `invalid failure script entry '${String(code)}' — must be one of: ` +
          INTEGRATION_FAILURE_CODES.join(", "),
      );
    }
  }
}

/** The scripted failure for call number `callIndex` (0-based), if any. */
export function scriptedFailureAt(
  script: FailureScript | undefined,
  callIndex: number,
): IntegrationFailure | null {
  const code = script?.[callIndex];
  if (code === undefined || code === null) {
    return null;
  }
  return {
    code,
    detail: `scripted failure '${code}' injected at call ${callIndex + 1} (deterministic test injection)`,
  };
}

/** Convert a failed scope check into the typed PERMANENT failure. */
export function scopeRefusal(
  check: Extract<ScopeCheck, { ok: false }>,
): IntegrationFailure {
  return { code: "SCOPE_DENIED", detail: check.detail };
}

/** UTF-8 encode a string into the bytes an incumbent "serves". */
export function encodeText(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}
