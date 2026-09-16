/**
 * PROD-008 — Apify OPTIONAL web-acquisition connector: the MODEL.
 *
 * Authority discipline (docs/productization-work-orders.md §PROD-008;
 * spec/requirements.md R14/R15; the AISE-037 module headers):
 *
 *  - OPTIONAL BY CONSTRUCTION: Apify is a third-party acquisition platform,
 *    NOT a construction system of record. The connector ships DISABLED by
 *    default (`enabled: false`); no Apify dependency — npm or runtime — may
 *    become necessary for the golden demo. This package adds ZERO npm
 *    dependencies (global fetch, injected in tests).
 *  - CREDENTIAL ISOLATION (structural): the `token` field of
 *    `ApifyConnectorConfig` is a SECRET. It is sent EXCLUSIVELY as the value
 *    of the `authorization` request header (`Bearer <token>`). It never
 *    appears in any outcome, provenance, failure detail, status probe, URL,
 *    query string, request body or log line. This module contains NO
 *    `JSON.stringify` of the config anywhere (source-scan tested); the ONLY
 *    sanctioned serialization is `redactedApifyConfigSummary`, which
 *    constructs its output by hand from the non-secret fields.
 *  - PROVENANCE VERBATIM (R14): import requests name incumbent record ids
 *    (Apify actor run ids / dataset ids) VERBATIM. Imported artifacts carry
 *    the source system identity + run id verbatim; ids are never re-keyed,
 *    merged or normalized. The AISE content id is ADDED alongside.
 *  - TYPED OUTCOMES ONLY: nothing throws across the connector boundary. The
 *    Apify-specific failure family below is total over the observable HTTP
 *    exchange; each member maps deterministically into the FROZEN AISE-037
 *    integration failure taxonomy at the port boundary (the mapping table is
 *    frozen + tested, and the verbatim apify code rides along in the detail
 *    so no information is lost).
 *  - DETERMINISM: no wall clock and no randomness. Every timestamp comes from
 *    the injected execution clock (adapters have no clock of their own).
 *
 * Import outcome shapes REUSE `../model` types wherever they fit: the success
 * side is exactly the port's record list (ImportedRecord /
 * SkippedDuplicateRecord / per-record FailedRecord), so a success crossing the
 * port boundary is identity-equal. The failure side is the Apify-specific
 * typed family (below), mapped by `apifyFailureToIntegrationFailure`.
 */

import type { ImportOutcome, ImportRecordOutcome, IntegrationFailure, SystemClass } from "../model";
import type { IntegrationFailureCode } from "../model";

/* ------------------------------------------------------------------ */
/* Connector identity (frozen)                                          */
/* ------------------------------------------------------------------ */

/** Registry key of this optional connector (descriptor adapterId). */
export const APIFY_CONNECTOR_ID = "apify-web-acquisition";

/** Adapter (contract) version — semver-shaped, carried verbatim. */
export const APIFY_CONNECTOR_VERSION = "1.0.0";

/**
 * The AISE-037 incumbent system class this connector serves: Apify exchanges
 * ACQUIRED DOCUMENTS (dataset items / scraped artifacts), so it rides the
 * `storage-document` port. Apify is acquisition-ONLY: the descriptor honestly
 * omits `export-derived` (nothing is ever derived-exported through Apify).
 */
export const APIFY_SYSTEM_CLASS: SystemClass = "storage-document";

/** Default Apify API base URL (hosted service; never contacted when disabled). */
export const APIFY_DEFAULT_BASE_URL = "https://api.apify.com";

/* ------------------------------------------------------------------ */
/* Configuration (token STRUCTURALLY isolated)                          */
/* ------------------------------------------------------------------ */

/**
 * The connector's configuration. `token` is the provider credential — a
 * SECRET scalar:
 *
 *  - it is read exactly once per HTTP request, to build the `authorization`
 *    header value (`Bearer <token>`), and nowhere else;
 *  - it is NEVER serialized: no `JSON.stringify(config)` exists anywhere in
 *    this package (source-scan tested). Use `redactedApifyConfigSummary`
 *    when a human-readable (safe) rendering is needed;
 *  - it appears in NO outcome, provenance, failure detail, URL, query
 *    string, body or log line (structurally asserted by the colocated tests
 *    over every outcome family).
 */
export interface ApifyConnectorConfig {
  readonly baseUrl: string;
  readonly token: string;
  /** DEFAULT DISABLED: the optional connector is off until explicitly enabled. */
  readonly enabled: boolean;
}

/**
 * Build a connector config. `enabled` DEFAULTS TO FALSE (the product works
 * without Apify; the golden demo never needs it). Constructing an ENABLED
 * connector with an empty token is a typed construction refusal (an enabled
 * connector without credentials could never honestly authenticate).
 */
export function apifyConnectorConfig(
  overrides?: Partial<ApifyConnectorConfig>,
): ApifyConnectorConfig {
  const config: ApifyConnectorConfig = {
    baseUrl: overrides?.baseUrl ?? APIFY_DEFAULT_BASE_URL,
    token: overrides?.token ?? "",
    enabled: overrides?.enabled ?? false,
  };
  if (typeof config.baseUrl !== "string" || !/^https?:\/\//.test(config.baseUrl)) {
    throw new Error(
      `invalid apify connector config: baseUrl must be an http(s) URL (got '${String(config.baseUrl)}')`,
    );
  }
  if (config.enabled && config.token.length === 0) {
    throw new Error(
      "invalid apify connector config: enabled=true requires a token " +
        "(a disabled connector needs none — the product works without Apify)",
    );
  }
  return config;
}

/**
 * The ONLY sanctioned (redacted) rendering of a config: built BY HAND from
 * the non-secret fields — deliberately never `JSON.stringify(config)`. The
 * token is represented by a literal `<redacted>` marker, never its value.
 */
export function redactedApifyConfigSummary(config: ApifyConnectorConfig): string {
  return (
    `apify connector config (redacted): baseUrl=${config.baseUrl} ` +
    `enabled=${config.enabled} token=<redacted>`
  );
}

/* ------------------------------------------------------------------ */
/* The Apify-specific typed failure family (total, deterministic)       */
/* ------------------------------------------------------------------ */

/**
 * The five Apify-specific failure codes. The family is TOTAL over the
 * observable exchange with the hosted Apify API:
 *
 *  - `disabled`          the connector's configuration disables it (no HTTP);
 *  - `quota_exceeded`    HTTP 402 Payment Required — the free-plan monthly
 *                        usage quota is exhausted (explicit, permanent);
 *  - `rate_limited`      HTTP 429 Too Many Requests (+ `retry-after` when the
 *                        endpoint serves it; `null` when absent/unparseable);
 *  - `invalid_actor`     the REQUEST is structurally invalid — a named record
 *                        id (actor run id / dataset id) is blank, so it
 *                        cannot be carried VERBATIM into a URL path segment.
 *                        (HTTP 400/404/410 for a SPECIFIC named id are
 *                        per-record SOURCE_NOT_FOUND failures inside a
 *                        success outcome — the sync continues with the other
 *                        records, exactly like the reference adapters.)
 *  - `network_error`     the endpoint could not be reached (fetch rejected,
 *                        `httpStatus === null`) OR answered outside the
 *                        classified family (401/403/5xx/…, transport-tier).
 *
 * Every detail string is deterministic and id-safe: it names incumbent ids
 * verbatim (they are journaled verbatim anyway) and NEVER the token.
 */
export type ApifyFailureCode =
  | "quota_exceeded"
  | "rate_limited"
  | "disabled"
  | "invalid_actor"
  | "network_error";

export type ApifyConnectorFailure =
  | { readonly code: "disabled"; readonly detail: string }
  | { readonly code: "quota_exceeded"; readonly detail: string; readonly httpStatus: 402 }
  | {
      readonly code: "rate_limited";
      readonly detail: string;
      readonly httpStatus: 429;
      readonly retryAfterSeconds: number | null;
    }
  | { readonly code: "invalid_actor"; readonly detail: string }
  | { readonly code: "network_error"; readonly detail: string; readonly httpStatus: number | null };

/**
 * The connector's detailed typed import outcome. The SUCCESS side reuses the
 * port's record shapes VERBATIM (../model ImportRecordOutcome); the FAILURE
 * side is the Apify-specific family above.
 */
export type ApifyImportOutcome =
  | { readonly kind: "success"; readonly records: readonly ImportRecordOutcome[] }
  | { readonly kind: "failure"; readonly failure: ApifyConnectorFailure };

/* ------------------------------------------------------------------ */
/* Mapping into the FROZEN AISE-037 failure taxonomy                    */
/* ------------------------------------------------------------------ */

/**
 * The frozen mapping from the Apify-specific failure family into the AISE-037
 * integration failure codes (the only codes that may cross the port). The
 * verbatim apify code rides along in the detail, so nothing is lost:
 *
 *  disabled       → CONTRACT_VIOLATION (permanent) — dispatching an import to
 *                   a connector whose configuration disables it is a wiring
 *                   contract violation; fail fast, zero HTTP traffic.
 *  quota_exceeded → AUTH_REVOKED (permanent) — an ACCOUNT-side permanent
 *                   refusal: the token is valid but its exercise is refused
 *                   until the plan quota resets or is upgraded. Distinguished
 *                   from source-side (SOURCE_NOT_FOUND) and transport-side
 *                   failures by the detail, which carries the verbatim code.
 *  rate_limited   → RATE_LIMITED (transient) — the natural pairing; the
 *                   retry-after interval is surfaced in the detail.
 *  invalid_actor  → SOURCE_NOT_FOUND (permanent) — the request names an
 *                   incumbent record id that cannot be fetched as named.
 *  network_error  → RETRYABLE_TIMEOUT (transient) — transport-tier; a bounded
 *                   retry is legitimate (the path may recover).
 */
export const APIFY_FAILURE_PORT_CODES: Readonly<Record<ApifyFailureCode, IntegrationFailureCode>> =
  Object.freeze({
    disabled: "CONTRACT_VIOLATION",
    quota_exceeded: "AUTH_REVOKED",
    rate_limited: "RATE_LIMITED",
    invalid_actor: "SOURCE_NOT_FOUND",
    network_error: "RETRYABLE_TIMEOUT",
  });

/**
 * Translate one Apify-specific failure into the typed AISE-037 failure that
 * crosses the port boundary. The detail is prefixed with the VERBATIM apify
 * code (`[apify:<code>] …`) so journals stay honest about the origin.
 */
export function apifyFailureToIntegrationFailure(failure: ApifyConnectorFailure): IntegrationFailure {
  return {
    code: APIFY_FAILURE_PORT_CODES[failure.code],
    detail: `[apify:${failure.code}] ${failure.detail}`,
  };
}

/**
 * Lift a detailed outcome into the port's ImportOutcome: success passes
 * through IDENTITY-EQUAL (the records already are ../model shapes); failure
 * is translated through the frozen mapping table.
 */
export function toPortImportOutcome(outcome: ApifyImportOutcome): ImportOutcome {
  return outcome.kind === "success"
    ? { kind: "success", records: outcome.records }
    : { kind: "failure", failure: apifyFailureToIntegrationFailure(outcome.failure) };
}
