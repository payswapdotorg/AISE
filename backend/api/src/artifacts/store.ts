/**
 * Artifact metadata store — persistence abstraction (PROD-006).
 *
 * Contract (mirrors the capture/evidence persistence discipline):
 *
 *  - PERSISTENCE ONLY: no upload policy, no limits, no access checks
 *    (those are policy.ts/service.ts; the stores never re-implement them).
 *  - One metadata row per (projectId, artifactId) — the model.ts scoping
 *    rule. Rows are IMMUTABLE while live: putRecord is put-if-absent
 *    (never overwrites); deletion is a TOMBSTONE (state: "deleted" +
 *    deletedAt), never a row removal — deletion is auditable history, not
 *    a rewrite of it.
 *  - The bytes themselves never live here: rows reference blobs by their
 *    content address (the ArtifactStorage port owns bytes). The same
 *    content address MAY back rows in several projects.
 *  - Determinism: identical call sequences produce identical stored bytes
 *    (canonical JSON) and identical list orders (sorted by artifactId, and
 *    by projectId for the cross-project enumeration). The interface exists
 *    so tests run the InMemory twin with identical behavior.
 *
 * File-system layout (`FsArtifactMetadataStore`, rooted at the same data
 * dir as every other Fs store — AISE_DATA_DIR, default ./data):
 *
 *   data/artifacts/records/<sha256(projectId)>/<artifactId>.json
 *
 * Project ids are hashed into filesystem-safe directory names and stored
 * verbatim inside the JSON rows; artifact ids are validated to be 64
 * lowercase hex before they are ever used in a path. All JSON is written
 * with the shared canonical JSON encoder, so identical state always
 * produces identical files.
 */

import { mkdirSync, promises as fs, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { canonicalJsonStringify } from "@aise/shared-contracts";
import { sha256Hex } from "../lib/hash";
import { isScopeId, type ArtifactRecord } from "./model";

/* ------------------------------------------------------------------ */
/* Store interface                                                      */
/* ------------------------------------------------------------------ */

/** Outcome of a put-if-absent record insert. */
export interface PutRecordOutcome {
  /** True when this call inserted the row; false when it already existed. */
  readonly inserted: boolean;
  /** The stored row (the EXISTING one when `inserted` is false). */
  readonly record: ArtifactRecord;
}

/**
 * Persistence boundary for artifact metadata rows. Implementations MUST be
 * deterministic given the same call sequence (see the module header).
 */
export interface ArtifactMetadataStore {
  /** Insert a row (put-if-absent; never overwrites an existing row). */
  putRecord(record: ArtifactRecord): Promise<PutRecordOutcome>;
  /** The row for (projectId, artifactId), or null — tombstones included. */
  getRecord(projectId: string, artifactId: string): Promise<ArtifactRecord | null>;
  /** Live (non-tombstoned) rows of one project, sorted by artifactId. */
  listRecords(projectId: string): Promise<readonly ArtifactRecord[]>;
  /** Mark a row deleted; null when absent or already tombstoned. */
  tombstoneRecord(
    projectId: string,
    artifactId: string,
    deletedAt: string,
  ): Promise<ArtifactRecord | null>;
  /**
   * Live rows across ALL projects that reference the content address —
   * the refcount input for content-addressed blob removal (a blob shared
   * by several projects is only removed when the last live row goes).
   * Sorted by (projectId, artifactId).
   */
  recordsReferencing(artifactId: string): Promise<readonly ArtifactRecord[]>;
  /**
   * Every live row across all projects, sorted by (projectId, artifactId) —
   * the retention/purge scan input.
   */
  listAllRecords(): Promise<readonly ArtifactRecord[]>;
}

/* ------------------------------------------------------------------ */
/* Shared helpers                                                       */
/* ------------------------------------------------------------------ */

const ARTIFACT_ID_PATTERN = /^[0-9a-f]{64}$/;

function assertArtifactId(artifactId: string): void {
  if (!ARTIFACT_ID_PATTERN.test(artifactId)) {
    throw new Error("artifact metadata store: artifact id must be 64 lowercase hex characters");
  }
}

function assertProjectId(projectId: string): void {
  if (!isScopeId(projectId)) {
    throw new Error("artifact metadata store: invalid project scope id");
  }
}

function isLive(record: ArtifactRecord): boolean {
  return record.state === "stored";
}

/** Deterministic row order for cross-project enumerations. */
function byProjectThenArtifact(a: ArtifactRecord, b: ArtifactRecord): number {
  return a.projectId === b.projectId
    ? a.artifactId.localeCompare(b.artifactId)
    : a.projectId.localeCompare(b.projectId);
}

function isRecord(value: unknown): value is ArtifactRecord {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  const shapeOk =
    typeof candidate["artifactId"] === "string" && typeof candidate["projectId"] === "string";
  const stateOk = candidate["state"] === "stored" || candidate["state"] === "deleted";
  return shapeOk && stateOk;
}

function decodeRecord(raw: string, origin: string): ArtifactRecord {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`artifact metadata store: corrupted record file at ${origin}`);
  }
  if (!isRecord(parsed)) {
    throw new Error(`artifact metadata store: record file at ${origin} is not a valid row`);
  }
  return parsed;
}

/* ------------------------------------------------------------------ */
/* In-memory implementation                                             */
/* ------------------------------------------------------------------ */

/** Deterministic in-memory ArtifactMetadataStore (tests, embedded scenarios). */
export class InMemoryArtifactMetadataStore implements ArtifactMetadataStore {
  private readonly rows = new Map<string, ArtifactRecord>();

  private key(projectId: string, artifactId: string): string {
    return `${projectId} ${artifactId}`;
  }

  async putRecord(record: ArtifactRecord): Promise<PutRecordOutcome> {
    assertProjectId(record.projectId);
    assertArtifactId(record.artifactId);
    const existing = this.rows.get(this.key(record.projectId, record.artifactId));
    if (existing !== undefined) {
      return { inserted: false, record: existing };
    }
    this.rows.set(this.key(record.projectId, record.artifactId), record);
    return { inserted: true, record };
  }

  async getRecord(projectId: string, artifactId: string): Promise<ArtifactRecord | null> {
    assertProjectId(projectId);
    assertArtifactId(artifactId);
    return this.rows.get(this.key(projectId, artifactId)) ?? null;
  }

  async listRecords(projectId: string): Promise<readonly ArtifactRecord[]> {
    assertProjectId(projectId);
    const rows: ArtifactRecord[] = [];
    for (const record of this.rows.values()) {
      if (record.projectId === projectId && isLive(record)) {
        rows.push(record);
      }
    }
    return rows.sort((a, b) => a.artifactId.localeCompare(b.artifactId));
  }

  async tombstoneRecord(
    projectId: string,
    artifactId: string,
    deletedAt: string,
  ): Promise<ArtifactRecord | null> {
    const existing = await this.getRecord(projectId, artifactId);
    if (existing === null || !isLive(existing)) {
      return null;
    }
    const tombstone: ArtifactRecord = { ...existing, state: "deleted", deletedAt };
    this.rows.set(this.key(projectId, artifactId), tombstone);
    return tombstone;
  }

  async recordsReferencing(artifactId: string): Promise<readonly ArtifactRecord[]> {
    assertArtifactId(artifactId);
    const rows: ArtifactRecord[] = [];
    for (const record of this.rows.values()) {
      if (record.artifactId === artifactId && isLive(record)) {
        rows.push(record);
      }
    }
    return rows.sort(byProjectThenArtifact);
  }

  async listAllRecords(): Promise<readonly ArtifactRecord[]> {
    const rows: ArtifactRecord[] = [];
    for (const record of this.rows.values()) {
      if (isLive(record)) {
        rows.push(record);
      }
    }
    return rows.sort(byProjectThenArtifact);
  }
}

/* ------------------------------------------------------------------ */
/* File-system implementation                                           */
/* ------------------------------------------------------------------ */

/**
 * File-system-backed ArtifactMetadataStore rooted at `dataDir` (the row
 * tree lives under `<dataDir>/artifacts/records/`; created on
 * construction — an unwritable root fails fast with a thrown Error, the
 * same discipline as FsCaptureStore). See the module header for the layout.
 */
export class FsArtifactMetadataStore implements ArtifactMetadataStore {
  private readonly root: string;

  constructor(dataDir: string) {
    this.root = resolve(dataDir, "artifacts", "records");
    mkdirSync(this.root, { recursive: true });
  }

  private projectDir(projectId: string): string {
    assertProjectId(projectId);
    return join(this.root, sha256Hex(projectId));
  }

  private recordPath(projectId: string, artifactId: string): string {
    assertArtifactId(artifactId);
    return join(this.projectDir(projectId), `${artifactId}.json`);
  }

  async putRecord(record: ArtifactRecord): Promise<PutRecordOutcome> {
    const path = this.recordPath(record.projectId, record.artifactId);
    const existing = await this.readRecordFile(path);
    if (existing !== null) {
      return { inserted: false, record: existing };
    }
    await fs.mkdir(this.projectDir(record.projectId), { recursive: true });
    await fs.writeFile(path, canonicalJsonStringify(record));
    return { inserted: true, record };
  }

  async getRecord(projectId: string, artifactId: string): Promise<ArtifactRecord | null> {
    return this.readRecordFile(this.recordPath(projectId, artifactId));
  }

  async listRecords(projectId: string): Promise<readonly ArtifactRecord[]> {
    const dir = this.projectDir(projectId);
    let names: string[];
    try {
      names = readdirSync(dir);
    } catch {
      return [];
    }
    const rows: ArtifactRecord[] = [];
    for (const name of names.sort()) {
      if (!name.endsWith(".json")) {
        continue;
      }
      const record = await this.readRecordFile(join(dir, name));
      if (record !== null && isLive(record)) {
        rows.push(record);
      }
    }
    return rows.sort((a, b) => a.artifactId.localeCompare(b.artifactId));
  }

  async tombstoneRecord(
    projectId: string,
    artifactId: string,
    deletedAt: string,
  ): Promise<ArtifactRecord | null> {
    const path = this.recordPath(projectId, artifactId);
    const existing = await this.readRecordFile(path);
    if (existing === null || !isLive(existing)) {
      return null;
    }
    const tombstone: ArtifactRecord = { ...existing, state: "deleted", deletedAt };
    await fs.writeFile(path, canonicalJsonStringify(tombstone));
    return tombstone;
  }

  async recordsReferencing(artifactId: string): Promise<readonly ArtifactRecord[]> {
    assertArtifactId(artifactId);
    let projectDirs: string[];
    try {
      projectDirs = readdirSync(this.root, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name)
        .sort();
    } catch {
      return [];
    }
    const rows: ArtifactRecord[] = [];
    for (const projectDir of projectDirs) {
      const fileName = `${artifactId}.json`;
      const record = await this.readRecordFile(join(this.root, projectDir, fileName));
      if (record !== null && isLive(record)) {
        rows.push(record);
      }
    }
    return rows.sort(byProjectThenArtifact);
  }

  async listAllRecords(): Promise<readonly ArtifactRecord[]> {
    let projectDirs: string[];
    try {
      projectDirs = readdirSync(this.root, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name)
        .sort();
    } catch {
      return [];
    }
    const rows: ArtifactRecord[] = [];
    for (const projectDir of projectDirs) {
      let names: string[];
      try {
        names = readdirSync(join(this.root, projectDir));
      } catch {
        continue;
      }
      for (const name of names.sort()) {
        if (!name.endsWith(".json")) {
          continue;
        }
        const record = await this.readRecordFile(join(this.root, projectDir, name));
        if (record !== null && isLive(record)) {
          rows.push(record);
        }
      }
    }
    return rows.sort(byProjectThenArtifact);
  }

  private async readRecordFile(path: string): Promise<ArtifactRecord | null> {
    let text: string;
    try {
      text = await fs.readFile(path, "utf8");
    } catch (error) {
      if (
        typeof error === "object" &&
        error !== null &&
        (error as { code?: unknown }).code === "ENOENT"
      ) {
        return null;
      }
      throw error;
    }
    return decodeRecord(text, path);
  }
}
