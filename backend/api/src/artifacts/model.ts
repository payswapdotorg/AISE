/**
 * Artifact storage model — PROD-006 (the R2 artifact storage family).
 *
 * Contract (docs/productization-work-orders.md §PROD-006; the AISE-004
 * content-addressing discipline; spec/architecture-lock.md):
 *
 *  - CONTENT-ADDRESSED, PROVENANCE-LINKED, NEVER AUTHORITATIVE. An
 *    artifact's id IS the sha-256 of its raw bytes (the `lib/hash`
 *    discipline, exactly like capture assets): identical bytes always map
 *    to the identical id, byte-identical metadata is produced for
 *    identical inputs, and a declared id is NEVER trusted from the wire.
 *  - Artifact metadata links evidence/provenance identifiers BY REFERENCE
 *    (evidence content ids + derivation ids, shapes validated, existence
 *    NOT verified here): the artifact store stores bytes + technical
 *    metadata only and never becomes a second evidence authority.
 *  - Records are scoped: one metadata row per (projectId, artifactId).
 *    The same bytes MAY legitimately back rows in several projects — the
 *    BLOB is stored once (content-addressed dedup) while each project row
 *    carries its own scope, links and retention class.
 *  - Retention policy IS DATA, never lost logic: the retention class is
 *    stored ON the record; the purge/scan policy (see RETENTION_POLICY)
 *    enumerates candidates deterministically, and nothing is ever deleted
 *    without an explicit purge/delete call.
 *
 * This module is PURE DATA + validation: no I/O, no clock, no randomness.
 */

import { contentIdSchema, mediaTypeSchema } from "@aise/shared-contracts";

/* ------------------------------------------------------------------ */
/* Kinds                                                                */
/* ------------------------------------------------------------------ */

/**
 * Artifact kind families (the work order's surface): BOQ documents,
 * images, videos, raw capture assets (the AISE-002 capture contract
 * kinds) and derived artifacts (models/meshes/point clouds).
 */
export const ARTIFACT_KINDS = ["boq", "image", "video", "capture", "derived"] as const;
export type ArtifactKind = (typeof ARTIFACT_KINDS)[number];

export function isArtifactKind(value: string): value is ArtifactKind {
  return (ARTIFACT_KINDS as readonly string[]).includes(value);
}

/* ------------------------------------------------------------------ */
/* Retention classes                                                    */
/* ------------------------------------------------------------------ */

/**
 * Retention classes (data, not lost logic — see RETENTION_POLICY):
 *
 *  - demo-fixture    : purgeable on every explicit purge scan;
 *  - project-evidence: retained — never a purge candidate (the safe
 *                      default for everything a project treats as
 *                      evidence);
 *  - derived-cache   : recomputable derived output — a purge candidate
 *                      once its TTL has elapsed.
 */
export const ARTIFACT_RETENTION_CLASSES = [
  "demo-fixture",
  "project-evidence",
  "derived-cache",
] as const;
export type ArtifactRetentionClass = (typeof ARTIFACT_RETENTION_CLASSES)[number];

export function isArtifactRetentionClass(value: string): value is ArtifactRetentionClass {
  return (ARTIFACT_RETENTION_CLASSES as readonly string[]).includes(value);
}

/** Purge/scan policy per retention class (deterministic data). */
export const RETENTION_POLICY: Readonly<
  Record<ArtifactRetentionClass, { readonly purgeable: boolean; readonly ttlSeconds: number | null }>
> = {
  "demo-fixture": { purgeable: true, ttlSeconds: null },
  "project-evidence": { purgeable: false, ttlSeconds: null },
  "derived-cache": { purgeable: true, ttlSeconds: 30 * 24 * 60 * 60 },
};

/** The safe default retention class per artifact kind. */
export const DEFAULT_RETENTION_BY_KIND: Readonly<Record<ArtifactKind, ArtifactRetentionClass>> = {
  boq: "project-evidence",
  image: "project-evidence",
  video: "project-evidence",
  capture: "project-evidence",
  derived: "derived-cache",
};

/* ------------------------------------------------------------------ */
/* Type policy (allowlist per kind)                                     */
/* ------------------------------------------------------------------ */

/**
 * Type allowlist per kind — DATA. A media type outside the kind's set is
 * rejected with 415 (`unsupported_media_type`); a grammar-invalid one with
 * 400 (`invalid_media_type`).
 *
 *  - boq: json / csv / xlsx (the BOQ ingestion formats);
 *  - image: jpeg / png / webp;
 *  - video: mp4 / mov;
 *  - capture: the AISE-002 capture contract kinds — image/jpeg, video/mp4
 *    and application/json (apps/android MediaTypes);
 *  - derived: model / mesh / las formats. Most of these have NO registered
 *    IANA media type, so the kind is bounded by REQUIRED FILENAME
 *    EXTENSIONS (glb/gltf/obj/ply/stl/las/laz) while the media type may be
 *    the de-facto model/* value or the honest application/octet-stream.
 */
export interface ArtifactTypeRule {
  /** Allowed content types (exact match after parameter stripping). */
  readonly mediaTypes: readonly string[];
  /** Allowed filename extensions (lowercase, no dot). */
  readonly extensions: readonly string[];
  /** Whether a filename (and therefore a checkable extension) is required. */
  readonly filenameRequired: boolean;
}

export const TYPE_POLICY: Readonly<Record<ArtifactKind, ArtifactTypeRule>> = {
  boq: {
    mediaTypes: [
      "application/json",
      "text/csv",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ],
    extensions: ["json", "csv", "xlsx"],
    filenameRequired: false,
  },
  image: {
    mediaTypes: ["image/jpeg", "image/png", "image/webp"],
    extensions: ["jpg", "jpeg", "png", "webp"],
    filenameRequired: false,
  },
  video: {
    mediaTypes: ["video/mp4", "video/quicktime"],
    extensions: ["mp4", "mov"],
    filenameRequired: false,
  },
  capture: {
    mediaTypes: ["image/jpeg", "video/mp4", "application/json"],
    extensions: ["jpg", "jpeg", "mp4", "json"],
    filenameRequired: false,
  },
  derived: {
    mediaTypes: [
      "model/gltf+json",
      "model/gltf-binary",
      "model/obj",
      "model/stl",
      "model/ply",
      "application/ply",
      "application/octet-stream",
      "application/x-las",
      "application/vnd.las",
      "application/vnd.laszip",
    ],
    extensions: ["glb", "gltf", "obj", "ply", "stl", "las", "laz"],
    filenameRequired: true,
  },
};

/** Strip Content-Type parameters ("text/csv; charset=utf-8" → "text/csv"). */
export function normalizeContentType(header: string | null): string | null {
  if (header === null) {
    return "application/octet-stream";
  }
  const candidate = header.split(";")[0]?.trim().toLowerCase() ?? "";
  return mediaTypeSchema.safeParse(candidate).success ? candidate : null;
}

/** The lowercase extension of a filename, or null when it has none. */
export function filenameExtension(filename: string): string | null {
  const dot = filename.lastIndexOf(".");
  if (dot <= 0 || dot === filename.length - 1) {
    return null;
  }
  return filename.slice(dot + 1).toLowerCase();
}

/* ------------------------------------------------------------------ */
/* Identifiers                                                          */
/* ------------------------------------------------------------------ */

const ARTIFACT_ID_PATTERN = /^[0-9a-f]{64}$/;

/** True when `value` is a well-formed artifact id (sha-256 content address). */
export function isArtifactId(value: string): boolean {
  return ARTIFACT_ID_PATTERN.test(value);
}

/** Project/tenant scope ids: plain identifiers, 1..128 chars. */
const SCOPE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

export function isScopeId(value: string): boolean {
  return SCOPE_ID_PATTERN.test(value);
}

/**
 * Filenames: a plain relative name — no path separators, no "." / ".."
 * traversal, no NUL, at most 255 characters.
 */
export function isPlainFilename(value: string): boolean {
  return (
    value.length >= 1 &&
    value.length <= 255 &&
    !value.includes("/") &&
    !value.includes("\\") &&
    value !== "." &&
    value !== ".." &&
    !value.includes("\u0000")
  );
}

/* ------------------------------------------------------------------ */
/* The record                                                           */
/* ------------------------------------------------------------------ */

/** Lifecycle state of a metadata row (deletion is a tombstone, not a rewrite of history). */
export type ArtifactState = "stored" | "deleted";

/**
 * One artifact metadata row — bytes + technical metadata ONLY (never an
 * evidence authority). `artifactId` IS the sha-256 of the bytes and is
 * duplicated in `sha256` so the record is self-describing about its
 * content address.
 */
export interface ArtifactRecord {
  /** Content address: sha-256 over the raw bytes (the record identity). */
  readonly artifactId: string;
  /** Project scope (the metadata row is one per (projectId, artifactId)). */
  readonly projectId: string;
  /** Tenant scope (defaults to "default" until PROD-010 wires real tenants). */
  readonly tenantId: string;
  readonly kind: ArtifactKind;
  /** Original filename, when the upload carried one (required for `derived`). */
  readonly filename: string | null;
  /** Normalized media type (parameters stripped). */
  readonly contentType: string;
  readonly byteSize: number;
  /** sha-256 of the raw bytes — identical to `artifactId` by construction. */
  readonly sha256: string;
  /** Evidence records referenced BY ID (shape-checked, existence not verified here). */
  readonly evidenceIds: readonly string[];
  /** Derivations referenced BY ID (shape-checked, existence not verified here). */
  readonly derivationIds: readonly string[];
  readonly retention: ArtifactRetentionClass;
  readonly state: ArtifactState;
  /** Upload instant (ISO 8601 UTC, injected clock). */
  readonly createdAt: string;
  /** Deletion instant, when the row is a tombstone. */
  readonly deletedAt: string | null;
}

/**
 * The metadata that identifies an upload's content, compared for
 * idempotency/conflict decisions. Pure and order-insensitive over the
 * reference lists so re-sending the same links in a different order stays
 * idempotent. Strings are accepted unvalidated — callers pass either a
 * stored record or the already-validated incoming upload fields; the key is
 * a comparison digest, never an authority.
 */
export interface ArtifactIdentityInput {
  readonly projectId: string;
  readonly kind: string;
  readonly filename: string | null;
  readonly contentType: string;
  readonly evidenceIds: readonly string[];
  readonly derivationIds: readonly string[];
  readonly retention: string;
}

export function recordIdentityKey(record: ArtifactIdentityInput): string {
  return JSON.stringify([
    record.projectId,
    record.kind,
    record.filename,
    record.contentType,
    [...record.evidenceIds].sort(),
    [...record.derivationIds].sort(),
    record.retention,
  ]);
}

/* ------------------------------------------------------------------ */
/* Reference validation (links by reference — shapes only)              */
/* ------------------------------------------------------------------ */

/**
 * Validate evidence reference ids: each must be a 64-lowercase-hex content
 * id. Existence is deliberately NOT checked (the artifact store is not an
 * evidence authority); duplicates collapse in first-appearance order.
 */
export function normalizeEvidenceIds(values: readonly string[]): string[] {
  const out: string[] = [];
  for (const value of values) {
    if (!contentIdSchema.safeParse(value).success) {
      throw new Error(`invalid evidence content id reference: ${summarizeRef(value)}`);
    }
    if (!out.includes(value)) {
      out.push(value);
    }
  }
  return out;
}

/**
 * Validate derivation reference ids: each must be a non-empty stable id
 * (1..256 chars, no control characters). Existence is deliberately NOT
 * checked; duplicates collapse in first-appearance order.
 */
export function normalizeDerivationIds(values: readonly string[]): string[] {
  const out: string[] = [];
  for (const value of values) {
    if (value.length < 1 || value.length > 256 || hasControlCharacter(value)) {
      throw new Error(`invalid derivation id reference: ${summarizeRef(value)}`);
    }
    if (!out.includes(value)) {
      out.push(value);
    }
  }
  return out;
}

/** Control-character scan without a control-character regex literal. */
function hasControlCharacter(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code <= 0x1f || code === 0x7f) {
      return true;
    }
  }
  return false;
}

/** A ref summary that never echoes the full value (ids only, length-bounded). */
function summarizeRef(value: string): string {
  const head = value.slice(0, 12);
  return value.length <= 12 ? `"${head}"` : `"${head}…" (${value.length} chars)`;
}
