/**
 * Artifact upload limits and retention policy — PROD-006 (pure policy, no I/O).
 *
 * Contract (the work order + docs/free-tier-deployment.md "large uploads
 * are bounded and rejected"):
 *
 *  - LIMITS ARE ENFORCED BEFORE ANY STORAGE CALL — a too-large or
 *    wrong-type upload is rejected with the stable error envelope and NEVER
 *    a truncated write. The check order is documented and stable:
 *
 *      1. empty body                     → 400 `empty_body`
 *      2. size above the cap             → 413 `payload_too_large`
 *      3. scope/kind/filename shapes     → 400 `invalid_*` (service layer)
 *      4. media type grammar             → 400 `invalid_media_type`
 *      5. kind type allowlist            → 415 `unsupported_media_type`
 *      6. filename extension allowlist   → 415 `unsupported_media_type`
 *      7. `derived` without a filename   → 400 `filename_required`
 *
 *  - the SIZE CAP comes from the environment (AISE_ARTIFACT_MAX_BYTES,
 *    default 25 MiB = 26,214,400 bytes; workspace gate:
 *    tools/env-schema.ts, runtime wiring: runtime/entry.ts);
 *  - the TYPE ALLOWLISTS are DATA in model.ts (TYPE_POLICY), one per kind;
 *  - RETENTION IS DATA, NOT LOST LOGIC (model.ts RETENTION_POLICY): this
 *    module derives purge candidacy deterministically; NOTHING is ever
 *    auto-deleted — deletion happens only through the explicit service
 *    purge/delete calls.
 *
 * Determinism: every function here is pure over its arguments (the "now"
 * for TTL decisions is injected, never read from a clock).
 */

import {
  isArtifactKind,
  isPlainFilename,
  isScopeId,
  normalizeContentType,
  RETENTION_POLICY,
  TYPE_POLICY,
  type ArtifactKind,
  type ArtifactRecord,
} from "./model";

/* ------------------------------------------------------------------ */
/* Size cap                                                             */
/* ------------------------------------------------------------------ */

/** Default upload cap: 25 MiB (the free-tier-bounded policy default). */
export const DEFAULT_ARTIFACT_MAX_BYTES = 25 * 1024 * 1024;

/**
 * Sanity ceiling for AISE_ARTIFACT_MAX_BYTES: a configured cap above 1 GiB
 * is rejected as malformed (the variable bounds UPLOADS, not aspirations).
 */
export const MAX_ARTIFACT_BYTES_CEILING = 1024 * 1024 * 1024;

export interface ArtifactLimits {
  /** Maximum accepted upload size in bytes (inclusive). */
  readonly maxBytes: number;
}

export type MaxBytesParseResult =
  | { readonly ok: true; readonly maxBytes: number }
  | { readonly ok: false; readonly issue: string };

/**
 * Parse AISE_ARTIFACT_MAX_BYTES. Unset → the documented default. Present
 * values must be an integer between 1 and the ceiling; the issue string
 * names the variable and the expectation, never the value.
 */
export function parseArtifactMaxBytes(raw: string | undefined): MaxBytesParseResult {
  if (raw === undefined) {
    return { ok: true, maxBytes: DEFAULT_ARTIFACT_MAX_BYTES };
  }
  if (!/^\d+$/.test(raw)) {
    return {
      ok: false,
      issue: "AISE_ARTIFACT_MAX_BYTES: expected an integer number of bytes between 1 and 1073741824",
    };
  }
  const value = Number.parseInt(raw, 10);
  if (value < 1 || value > MAX_ARTIFACT_BYTES_CEILING) {
    return {
      ok: false,
      issue: "AISE_ARTIFACT_MAX_BYTES: expected an integer number of bytes between 1 and 1073741824",
    };
  }
  return { ok: true, maxBytes: value };
}

/** The parsed cap, falling back to the documented default on a malformed value. */
export function maxBytesOrDefault(raw: string | undefined): number {
  const parsed = parseArtifactMaxBytes(raw);
  return parsed.ok ? parsed.maxBytes : DEFAULT_ARTIFACT_MAX_BYTES;
}

/* ------------------------------------------------------------------ */
/* Limit checks                                                         */
/* ------------------------------------------------------------------ */

/** Stable rejection codes (the router's single status table maps these). */
export type UploadLimitCode =
  | "empty_body"
  | "payload_too_large"
  | "invalid_media_type"
  | "unsupported_media_type"
  | "filename_required"
  | "invalid_filename"
  | "invalid_kind";

export type UploadLimitVerdict =
  | { readonly outcome: "ok"; readonly kind: ArtifactKind; readonly contentType: string }
  | { readonly outcome: "rejected"; readonly code: UploadLimitCode; readonly detail: string };

/**
 * Enforce the byte-size cap and the per-kind type allowlist over one
 * upload. Pure; called BEFORE any storage call (see the module header for
 * the documented check order).
 */
export function checkUploadLimits(input: {
  readonly kind: string;
  readonly contentTypeHeader: string | null;
  readonly filename: string | null;
  readonly byteSize: number;
  readonly limits: ArtifactLimits;
}): UploadLimitVerdict {
  if (!isArtifactKind(input.kind)) {
    return {
      outcome: "rejected",
      code: "invalid_kind",
      detail: `unknown artifact kind (expected one of boq|image|video|capture|derived)`,
    };
  }
  if (input.byteSize === 0) {
    return {
      outcome: "rejected",
      code: "empty_body",
      detail: "artifact upload body is empty (0 bytes)",
    };
  }
  if (input.byteSize > input.limits.maxBytes) {
    return {
      outcome: "rejected",
      code: "payload_too_large",
      detail:
        `artifact is ${input.byteSize} bytes; the configured cap is ${input.limits.maxBytes} ` +
        "bytes (AISE_ARTIFACT_MAX_BYTES) — large uploads are bounded and rejected, never truncated",
    };
  }
  if (input.filename !== null && !isPlainFilename(input.filename)) {
    return {
      outcome: "rejected",
      code: "invalid_filename",
      detail: "filename must be a plain relative name (no path separators, 1..255 characters)",
    };
  }
  const rule = TYPE_POLICY[input.kind];
  if (rule.filenameRequired && input.filename === null) {
    return {
      outcome: "rejected",
      code: "filename_required",
      detail: `artifacts of kind '${input.kind}' require a filename (the extension bounds the format)`,
    };
  }
  const contentType = normalizeContentType(input.contentTypeHeader);
  if (contentType === null) {
    return {
      outcome: "rejected",
      code: "invalid_media_type",
      detail: "content-type is not a well-formed media type",
    };
  }
  if (!rule.mediaTypes.includes(contentType)) {
    return {
      outcome: "rejected",
      code: "unsupported_media_type",
      detail:
        `content-type '${contentType}' is not allowed for artifacts of kind '${input.kind}' ` +
        `(allowed: ${rule.mediaTypes.join(", ")})`,
    };
  }
  if (input.filename !== null) {
    const dot = input.filename.lastIndexOf(".");
    if (dot > 0 && dot < input.filename.length - 1) {
      const extension = input.filename.slice(dot + 1).toLowerCase();
      if (!rule.extensions.includes(extension)) {
        return {
          outcome: "rejected",
          code: "unsupported_media_type",
          detail:
            `filename extension '${extension}' is not allowed for artifacts of kind '${input.kind}' ` +
            `(allowed: ${rule.extensions.join(", ")})`,
        };
      }
    }
    // A filename with NO extension is only meaningful when the media type
    // itself carries the format (e.g. image/jpeg); the `derived` kind
    // requires the extension and is checked above.
  }
  return { outcome: "ok", kind: input.kind, contentType };
}

/* ------------------------------------------------------------------ */
/* Scope validation                                                     */
/* ------------------------------------------------------------------ */

/** One scope-validation failure (code + deterministic detail). */
export interface ScopeCheckFailure {
  readonly code: "invalid_project_id" | "invalid_tenant_id";
  readonly detail: string;
}

/** Validate the project/tenant scope ids (400 `invalid_*` upstream). */
export function checkScopeIds(projectId: string, tenantId: string): ScopeCheckFailure | null {
  if (!isScopeId(projectId)) {
    return {
      code: "invalid_project_id",
      detail: "expected a project id (1..128 chars: letters, digits, . _ : -)",
    };
  }
  if (!isScopeId(tenantId)) {
    return {
      code: "invalid_tenant_id",
      detail: "expected a tenant id (1..128 chars: letters, digits, . _ : -)",
    };
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* Retention / purge candidacy (data-driven, never auto-deleting)       */
/* ------------------------------------------------------------------ */

/**
 * True when `record` is a purge candidate at instant `nowMs` (epoch
 * milliseconds, INJECTED — determinism):
 *
 *  - demo-fixture     → always purgeable;
 *  - project-evidence → never purgeable;
 *  - derived-cache    → purgeable once its TTL has elapsed.
 *
 * Tombstoned records are never candidates (their deletion already
 * happened). This function ENUMERATES only — no deletion happens without
 * an explicit service purge call.
 */
export function isPurgeCandidate(record: ArtifactRecord, nowMs: number): boolean {
  if (record.state !== "stored") {
    return false;
  }
  const policy = RETENTION_POLICY[record.retention];
  if (!policy.purgeable) {
    return false;
  }
  if (policy.ttlSeconds === null) {
    return true;
  }
  const uploadedMs = Date.parse(record.createdAt);
  return nowMs - uploadedMs >= policy.ttlSeconds * 1000;
}
