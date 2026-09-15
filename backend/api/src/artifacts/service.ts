/**
 * Artifact service — the policy engine (PROD-006).
 *
 * Contract (docs/productization-work-orders.md §PROD-006; the AISE-004
 * content-addressing discipline; spec/architecture-lock.md):
 *
 *  - AUTHORITY DISCIPLINE: this service stores and verifies ONLY. It
 *    performs no evidence interpretation, no readiness judgement and no
 *    access policy (the ArtifactAccessPredicate port in access.ts is the
 *    access authority; the evidence/provenance authorities stay where
 *    they are). Artifact metadata links evidence/derivation ids BY
 *    REFERENCE — shapes are validated HERE, existence is verified NOWHERE
 *    on this surface (the artifact store never becomes a second evidence
 *    authority).
 *  - CONTENT ADDRESSING: the artifact id IS the sha-256 of the raw bytes
 *    (lib/hash). Identical bytes always produce the identical id; the id
 *    is never trusted from the wire (there is nothing to declare — the
 *    body IS the bytes).
 *  - LIMITS BEFORE STORAGE: the size cap and the per-kind type allowlist
 *    (policy.ts) are enforced BEFORE any storage call — a rejected upload
 *    never writes a byte, never mind a truncated one.
 *  - LIFECYCLE: upload → list → get → delete. Re-uploading identical
 *    content with identical metadata into the same project is an
 *    idempotent DUPLICATE; the same (project, content) row with DIFFERENT
 *    metadata is a typed conflict `artifact_conflict` (rows are immutable
 *    while live — the evidence discipline). Deletion is a TOMBSTONE plus a
 *    REFCOUNTED blob removal: a content-addressed blob shared by several
 *    projects is removed only when the last live row referencing it goes.
 *    Deleting twice is idempotent (the second call completes any
 *    interrupted blob removal, then answers the tombstone).
 *  - RETENTION IS DATA (model.ts RETENTION_POLICY): `purgeScan` enumerates
 *    candidates deterministically at an INJECTED instant; NOTHING is ever
 *    auto-deleted — deletion happens only through the explicit purge call.
 *  - TYPED STORAGE FAILURES: ArtifactStorageError from the storage port
 *    maps 1:1 to service codes (unavailable / quota_exceeded /
 *    auth_failed) which the router maps to 503 with distinct stable codes.
 *  - The service owns NO wall clock (injected) and NO randomness: every
 *    decision and every persisted byte is deterministic.
 */

import { sha256Hex } from "../lib/hash";
import {
  DEFAULT_RETENTION_BY_KIND,
  isArtifactId,
  isArtifactRetentionClass,
  isScopeId,
  normalizeDerivationIds,
  normalizeEvidenceIds,
  recordIdentityKey,
  type ArtifactRecord,
  type ArtifactRetentionClass,
} from "./model";
import { checkScopeIds, checkUploadLimits, isPurgeCandidate, type ArtifactLimits } from "./policy";
import { ArtifactStorageError, type ArtifactStorage } from "./storage";
import type { ArtifactMetadataStore } from "./store";

/* ------------------------------------------------------------------ */
/* Typed errors                                                         */
/* ------------------------------------------------------------------ */

/** Stable machine-readable policy codes (single authority: this module). */
export type ArtifactServiceErrorCode =
  | "invalid_project_id"
  | "invalid_tenant_id"
  | "invalid_kind"
  | "invalid_retention"
  | "invalid_filename"
  | "invalid_evidence_ref"
  | "invalid_derivation_ref"
  | "empty_body"
  | "payload_too_large"
  | "invalid_media_type"
  | "unsupported_media_type"
  | "filename_required"
  | "artifact_not_found"
  | "artifact_conflict"
  | "storage_unavailable"
  | "storage_quota_exceeded"
  | "storage_auth_failed";

/** Typed artifact-policy failure. `detail` is deterministic and safe to surface. */
export class ArtifactServiceError extends Error {
  constructor(
    readonly code: ArtifactServiceErrorCode,
    readonly detail: string,
  ) {
    super(`artifact ${code}: ${detail}`);
    this.name = "ArtifactServiceError";
  }
}

/* ------------------------------------------------------------------ */
/* Inputs and results                                                   */
/* ------------------------------------------------------------------ */

export interface UploadArtifactInput {
  readonly projectId: string;
  readonly tenantId: string;
  readonly kind: string;
  /** Retention class; defaults per kind (model.ts DEFAULT_RETENTION_BY_KIND). */
  readonly retention?: string;
  readonly filename: string | null;
  readonly contentTypeHeader: string | null;
  readonly bytes: Uint8Array;
  /** Evidence content ids referenced BY REFERENCE (shapes validated only). */
  readonly evidenceIds: readonly string[];
  /** Derivation ids referenced BY REFERENCE (shapes validated only). */
  readonly derivationIds: readonly string[];
}

export type UploadArtifactResult =
  | { readonly outcome: "stored"; readonly record: ArtifactRecord }
  | { readonly outcome: "duplicate"; readonly record: ArtifactRecord };

export interface DeleteArtifactResult {
  readonly outcome: "deleted";
  readonly record: ArtifactRecord;
}

export interface ArtifactServiceStatus {
  readonly backend: ReturnType<ArtifactStorage["describe"]>;
  readonly limits: ArtifactLimits;
}

export interface ArtifactServiceDeps {
  /** Content-addressed blob storage (R2 adapter or Fs twin). */
  readonly storage: ArtifactStorage;
  /** Metadata rows (Fs now; PROD-005's Pg store twins the interface later). */
  readonly metadata: ArtifactMetadataStore;
  /** Upload limits (size cap from the environment; default 25 MiB). */
  readonly limits: ArtifactLimits;
  /** UTC instant supplier — ISO 8601, millisecond precision, `Z` suffix. */
  readonly clock: () => string;
}

/* ------------------------------------------------------------------ */
/* The service                                                          */
/* ------------------------------------------------------------------ */

function mapStorageError(error: ArtifactStorageError): ArtifactServiceError {
  switch (error.failureKind) {
    case "quota_exceeded":
      return new ArtifactServiceError("storage_quota_exceeded", error.detail);
    case "auth_failed":
      return new ArtifactServiceError("storage_auth_failed", error.detail);
    default:
      return new ArtifactServiceError("storage_unavailable", error.detail);
  }
}

/** Create the artifact service (pure policy + injected I/O). */
export class ArtifactService {
  constructor(private readonly deps: ArtifactServiceDeps) {}

  /** Backend descriptor + effective limits (statuses only — never credentials). */
  status(): ArtifactServiceStatus {
    return { backend: this.deps.storage.describe(), limits: this.deps.limits };
  }

  /**
   * Upload one artifact. Check order is documented and stable (policy.ts
   * header): scope → kind → limits (BEFORE storage) → references →
   * content address → fast-path duplicate/conflict → blob → metadata row.
   */
  async uploadArtifact(input: UploadArtifactInput): Promise<UploadArtifactResult> {
    const scopeIssue = checkScopeIds(input.projectId, input.tenantId);
    if (scopeIssue !== null) {
      throw new ArtifactServiceError(scopeIssue.code, scopeIssue.detail);
    }
    const limits = checkUploadLimits({
      kind: input.kind,
      contentTypeHeader: input.contentTypeHeader,
      filename: input.filename,
      byteSize: input.bytes.length,
      limits: this.deps.limits,
    });
    if (limits.outcome === "rejected") {
      throw new ArtifactServiceError(limits.code, limits.detail);
    }
    let retention: ArtifactRetentionClass;
    if (input.retention === undefined) {
      retention = DEFAULT_RETENTION_BY_KIND[limits.kind];
    } else {
      if (!isArtifactRetentionClass(input.retention)) {
        throw new ArtifactServiceError(
          "invalid_retention",
          "retention must be one of demo-fixture|project-evidence|derived-cache",
        );
      }
      retention = input.retention;
    }
    let evidenceIds: string[];
    try {
      evidenceIds = normalizeEvidenceIds(input.evidenceIds);
    } catch (error) {
      throw new ArtifactServiceError(
        "invalid_evidence_ref",
        error instanceof Error ? error.message : String(error),
      );
    }
    let derivationIds: string[];
    try {
      derivationIds = normalizeDerivationIds(input.derivationIds);
    } catch (error) {
      throw new ArtifactServiceError(
        "invalid_derivation_ref",
        error instanceof Error ? error.message : String(error),
      );
    }

    // Content addressing: the id IS the hash of the raw bytes.
    const artifactId = sha256Hex(input.bytes);

    // Fast path: the (projectId, artifactId) row already decides the
    // outcome BEFORE any blob I/O happens (idempotent re-uploads never
    // re-write bytes).
    const existing = await this.deps.metadata.getRecord(input.projectId, artifactId);
    if (existing !== null) {
      return this.existingRowOutcome(existing, input, limits.contentType, retention);
    }

    try {
      await this.deps.storage.put(artifactId, input.bytes);
    } catch (error) {
      if (error instanceof ArtifactStorageError) {
        throw mapStorageError(error);
      }
      throw error;
    }

    const record: ArtifactRecord = {
      artifactId,
      projectId: input.projectId,
      tenantId: input.tenantId,
      kind: limits.kind,
      filename: input.filename,
      contentType: limits.contentType,
      byteSize: input.bytes.length,
      sha256: artifactId,
      evidenceIds,
      derivationIds,
      retention,
      state: "stored",
      createdAt: this.deps.clock(),
      deletedAt: null,
    };
    let inserted: boolean;
    let storedRow: ArtifactRecord;
    try {
      const outcome = await this.deps.metadata.putRecord(record);
      inserted = outcome.inserted;
      storedRow = outcome.record;
    } catch (error) {
      if (error instanceof ArtifactStorageError) {
        throw mapStorageError(error);
      }
      throw error;
    }
    if (inserted) {
      return { outcome: "stored", record: storedRow };
    }
    // Lost a race (or the fast path raced): decide duplicate vs conflict
    // against the row that actually won.
    return this.existingRowOutcome(storedRow, input, limits.contentType, retention);
  }

  /** Live rows of one project, sorted by artifactId. */
  async listArtifacts(projectId: string): Promise<readonly ArtifactRecord[]> {
    if (!isScopeId(projectId)) {
      throw new ArtifactServiceError(
        "invalid_project_id",
        "expected a project id (1..128 chars: letters, digits, . _ : -)",
      );
    }
    return this.deps.metadata.listRecords(projectId);
  }

  /** The live metadata row, or null (tombstones read as absent). */
  async getArtifact(projectId: string, artifactId: string): Promise<ArtifactRecord | null> {
    if (!isScopeId(projectId)) {
      throw new ArtifactServiceError(
        "invalid_project_id",
        "expected a project id (1..128 chars: letters, digits, . _ : -)",
      );
    }
    if (!isArtifactId(artifactId)) {
      throw new ArtifactServiceError(
        "invalid_project_id",
        "artifact id must be 64 lowercase hex characters (a sha-256 content address)",
      );
    }
    const record = await this.deps.metadata.getRecord(projectId, artifactId);
    if (record === null || record.state !== "stored") {
      return null;
    }
    return record;
  }

  /** The stored bytes of a LIVE record (content-addressed read-back). */
  async readArtifactBytes(record: ArtifactRecord): Promise<Uint8Array> {
    let bytes: Uint8Array | null;
    try {
      bytes = await this.deps.storage.get(record.artifactId);
    } catch (error) {
      if (error instanceof ArtifactStorageError) {
        throw mapStorageError(error);
      }
      throw error;
    }
    if (bytes === null) {
      throw new ArtifactServiceError(
        "artifact_not_found",
        "metadata row exists but the content-addressed blob is missing from the backend",
      );
    }
    return bytes;
  }

  /**
   * Delete one artifact: tombstone the row, then remove the blob only when
   * no OTHER live row references the same content address. Idempotent — a
   * second call completes any interrupted blob removal and answers the
   * tombstone (never artifact_not_found once a tombstone exists).
   */
  async deleteArtifact(projectId: string, artifactId: string): Promise<DeleteArtifactResult> {
    if (!isScopeId(projectId)) {
      throw new ArtifactServiceError(
        "invalid_project_id",
        "expected a project id (1..128 chars: letters, digits, . _ : -)",
      );
    }
    if (!isArtifactId(artifactId)) {
      throw new ArtifactServiceError(
        "invalid_project_id",
        "artifact id must be 64 lowercase hex characters (a sha-256 content address)",
      );
    }
    const record = await this.deps.metadata.getRecord(projectId, artifactId);
    if (record === null) {
      throw new ArtifactServiceError(
        "artifact_not_found",
        `no artifact row for content address ${artifactId.slice(0, 12)}… in this project`,
      );
    }
    let tombstone = record;
    if (record.state === "stored") {
      const marked = await this.deps.metadata.tombstoneRecord(
        projectId,
        artifactId,
        this.deps.clock(),
      );
      if (marked !== null) {
        tombstone = marked;
      }
    }
    await this.removeBlobIfUnreferenced(artifactId);
    return { outcome: "deleted", record: tombstone };
  }

  /**
   * Enumerate purge candidates at an INJECTED instant (epoch ms) —
   * deterministic, and NEVER a deletion (see the module header).
   */
  async purgeScan(nowMs: number): Promise<readonly ArtifactRecord[]> {
    const candidates: ArtifactRecord[] = [];
    for (const record of await this.allLiveRecords()) {
      if (isPurgeCandidate(record, nowMs)) {
        candidates.push(record);
      }
    }
    return candidates.sort((a, b) =>
      a.projectId === b.projectId
        ? a.artifactId.localeCompare(b.artifactId)
        : a.projectId.localeCompare(b.projectId),
    );
  }

  /**
   * The EXPLICIT purge call: tombstone + refcounted blob removal for every
   * candidate the retention policy names at `nowMs`. Returns the purged
   * rows (already tombstones) in the same deterministic order as purgeScan.
   */
  async purgeArtifacts(nowMs: number): Promise<readonly ArtifactRecord[]> {
    const purged: ArtifactRecord[] = [];
    for (const candidate of await this.purgeScan(nowMs)) {
      const result = await this.deleteArtifact(candidate.projectId, candidate.artifactId);
      purged.push(result.record);
    }
    return purged;
  }

  /* ---------------------------------------------------------------- */

  /** Duplicate vs conflict against an existing (projectId, artifactId) row. */
  private existingRowOutcome(
    existing: ArtifactRecord,
    input: UploadArtifactInput,
    contentType: string,
    retention: ArtifactRetentionClass,
  ): UploadArtifactResult {
    if (existing.state !== "stored") {
      throw new ArtifactServiceError(
        "artifact_conflict",
        "this content address was already uploaded to this project and then deleted — " +
          "tombstoned rows are never rewritten",
      );
    }
    const existingIdentity = recordIdentityKey({
      projectId: existing.projectId,
      kind: existing.kind,
      filename: existing.filename,
      contentType: existing.contentType,
      evidenceIds: existing.evidenceIds,
      derivationIds: existing.derivationIds,
      retention: existing.retention,
    });
    const incomingIdentity = recordIdentityKey({
      projectId: input.projectId,
      kind: input.kind,
      filename: input.filename,
      contentType,
      evidenceIds: normalizeEvidenceIds(input.evidenceIds),
      derivationIds: normalizeDerivationIds(input.derivationIds),
      retention,
    });
    if (existingIdentity !== incomingIdentity) {
      throw new ArtifactServiceError(
        "artifact_conflict",
        "this content address is already stored in this project with different metadata " +
          "(kind, filename, content-type, references or retention) — live rows are immutable",
      );
    }
    return { outcome: "duplicate", record: existing };
  }

  /** Remove the blob when no live row references it anymore (refcount). */
  private async removeBlobIfUnreferenced(artifactId: string): Promise<void> {
    const references = await this.deps.metadata.recordsReferencing(artifactId);
    if (references.length > 0) {
      return;
    }
    try {
      await this.deps.storage.remove(artifactId);
    } catch (error) {
      if (error instanceof ArtifactStorageError) {
        throw mapStorageError(error);
      }
      throw error;
    }
  }

  /** Every live row across projects (the purge scan input). */
  private async allLiveRecords(): Promise<readonly ArtifactRecord[]> {
    return this.deps.metadata.listAllRecords();
  }
}
