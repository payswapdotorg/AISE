/**
 * Evidence/source store — persistence abstraction (AISE-008).
 *
 * Contract (spec/work-orders.md §008, spec/architecture-lock.md "Raw field
 * evidence is immutable", "Evidence Graph is the only provenance authority"):
 *
 *  - The store is PERSISTENCE ONLY. It performs no evidence policy: no
 *    pinning decisions, no closure checks, no cycle detection, no readiness
 *    or interpretation logic of any kind. All policy lives in
 *    `evidence/service.ts`.
 *  - Evidence records are IMMUTABLE: `records/<sha256(contentId)>.json` is
 *    written ONCE and never rewritten or deleted. Invalidation NEVER touches
 *    the record file; it appends a separate
 *    `records/<sha256(contentId)>.invalidated.json`. Invalidated ≠ deleted.
 *  - Provenance links and derivations are APPEND-ONLY journals (JSONL): one
 *    file per subject|object pair for links, one per derivationId for
 *    derivations. Appends never rewrite earlier lines.
 *  - The interface exists so tests can run an in-memory implementation
 *    (`InMemoryEvidenceStore`) with identical, deterministic behavior.
 *
 * File-system layout (`FsEvidenceStore`, constructor takes the SAME data
 * directory the capture store uses; the store roots itself at
 * `<dataDir>/evidence/`, created on construction):
 *
 *   data/evidence/records/<sha256(contentId)>.json            immutable record
 *   data/evidence/records/<sha256(contentId)>.invalidated.json invalidation
 *   data/evidence/links/<sha256(subjectKind:subjectId|evidenceContentId)>.jsonl
 *   data/evidence/derivations/<sha256(derivationId)>.jsonl    derivation journal
 *
 * Content ids are validated to be 64 lowercase hex before they are ever used
 * in a path; opaque ids are hashed into filesystem-safe names and stored
 * verbatim inside the JSON records. Record files use the shared canonical
 * JSON encoder (2-space, sorted keys); journal lines use the same canonical
 * key order in compact single-line form so `.jsonl` stays line-delimited.
 * Identical operation sequences always produce identical bytes.
 */

import { mkdirSync, promises as fs, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import {
  canonicalizeJson,
  canonicalJsonStringify,
  type Derivation,
  type Evidence,
  type ProvenanceLink,
} from "@aise/shared-contracts";
import { sha256Hex } from "../lib/hash";

/* ------------------------------------------------------------------ */
/* Stored record types                                                 */
/* ------------------------------------------------------------------ */

/**
 * Invalidation state for one evidence record. Appended next to the immutable
 * record, never merged into it. `contentId` is carried inside the record so
 * the file is self-describing (the filename is a hash, not the id).
 */
export interface EvidenceInvalidationInfo {
  readonly contentId: string;
  readonly reason: string;
  readonly invalidatedAt: string;
}

/* ------------------------------------------------------------------ */
/* Store interface                                                     */
/* ------------------------------------------------------------------ */

/**
 * Persistence boundary for the evidence/source service. Implementations MUST
 * be deterministic given the same call sequence and MUST NOT implement
 * evidence policy (see module header).
 */
export interface EvidenceStore {
  /** The verbatim immutable record, or null when never registered. */
  getEvidenceRecord(contentId: string): Promise<Evidence | null>;
  /**
   * Write an evidence record (write-once). Returns false when a record
   * already exists under the content id — the existing record is NEVER
   * overwritten (comparison is the caller's policy).
   */
  putEvidenceRecord(evidence: Evidence): Promise<boolean>;
  /** The appended invalidation record, or null when not invalidated. */
  getInvalidation(contentId: string): Promise<EvidenceInvalidationInfo | null>;
  /**
   * Append the invalidation record (write-once). Returns false when an
   * invalidation already exists — it is NEVER rewritten.
   */
  putInvalidation(info: EvidenceInvalidationInfo): Promise<boolean>;
  /** Append one link line to the subject|object journal (no dedupe here). */
  appendLink(link: ProvenanceLink): Promise<void>;
  /** Append one derivation line to the derivationId journal. */
  appendDerivation(derivation: Derivation): Promise<void>;
  /**
   * Every stored link. Line order within one journal file is preserved;
   * ordering ACROSS journal files is store-specific — callers that need a
   * deterministic order sort canonically (the service does).
   */
  listLinks(): Promise<ProvenanceLink[]>;
  /** Every stored derivation, journal order (see `listLinks`). */
  listDerivations(): Promise<Derivation[]>;
  /** Every evidence record, sorted by content id (deterministic). */
  listEvidenceRecords(): Promise<Evidence[]>;
}

/* ------------------------------------------------------------------ */
/* Shared helpers                                                      */
/* ------------------------------------------------------------------ */

const CONTENT_ID_PATTERN = /^[0-9a-f]{64}$/;

function assertContentId(contentId: string): void {
  if (!CONTENT_ID_PATTERN.test(contentId)) {
    throw new Error("store: content id must be 64 lowercase hex characters");
  }
}

/** Journal key for one subject|object pair (both directions share a file). */
function linkJournalKey(link: ProvenanceLink): string {
  return sha256Hex(`${link.subjectKind}:${link.subjectId}|${link.evidenceContentId}`);
}

/** One canonical compact JSONL line (sorted keys, single line, newline). */
function jsonlLine(value: unknown): string {
  return `${JSON.stringify(canonicalizeJson(value))}\n`;
}

function isNotFound(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { code?: unknown }).code === "ENOENT"
  );
}

async function readJsonFile<T>(path: string): Promise<T | null> {
  try {
    const text = await fs.readFile(path, "utf8");
    return JSON.parse(text) as T;
  } catch (error) {
    if (isNotFound(error)) {
      return null;
    }
    throw error;
  }
}

async function writeJsonFile(path: string, value: unknown): Promise<void> {
  await fs.mkdir(dirname(path), { recursive: true });
  await fs.writeFile(path, canonicalJsonStringify(value));
}

/** Parse a JSONL document into values, preserving line order. */
function parseJsonl(text: string): unknown[] {
  const values: unknown[] = [];
  for (const line of text.split("\n")) {
    if (line.trim() === "") {
      continue;
    }
    values.push(JSON.parse(line) as unknown);
  }
  return values;
}

/* ------------------------------------------------------------------ */
/* In-memory implementation                                            */
/* ------------------------------------------------------------------ */

/** Deterministic in-memory EvidenceStore (tests, embedded scenarios). */
export class InMemoryEvidenceStore implements EvidenceStore {
  private readonly records = new Map<string, Evidence>();
  private readonly invalidations = new Map<string, EvidenceInvalidationInfo>();
  private readonly links: ProvenanceLink[] = [];
  private readonly derivations: Derivation[] = [];

  async getEvidenceRecord(contentId: string): Promise<Evidence | null> {
    return this.records.get(contentId) ?? null;
  }

  async putEvidenceRecord(evidence: Evidence): Promise<boolean> {
    if (this.records.has(evidence.contentId)) {
      return false;
    }
    this.records.set(evidence.contentId, evidence);
    return true;
  }

  async getInvalidation(contentId: string): Promise<EvidenceInvalidationInfo | null> {
    return this.invalidations.get(contentId) ?? null;
  }

  async putInvalidation(info: EvidenceInvalidationInfo): Promise<boolean> {
    if (this.invalidations.has(info.contentId)) {
      return false;
    }
    this.invalidations.set(info.contentId, info);
    return true;
  }

  async appendLink(link: ProvenanceLink): Promise<void> {
    this.links.push(link);
  }

  async appendDerivation(derivation: Derivation): Promise<void> {
    this.derivations.push(derivation);
  }

  async listLinks(): Promise<ProvenanceLink[]> {
    return [...this.links];
  }

  async listDerivations(): Promise<Derivation[]> {
    return [...this.derivations];
  }

  async listEvidenceRecords(): Promise<Evidence[]> {
    return [...this.records.values()].sort((a, b) =>
      a.contentId.localeCompare(b.contentId)
    );
  }
}

/* ------------------------------------------------------------------ */
/* File-system implementation                                          */
/* ------------------------------------------------------------------ */

/**
 * File-system-backed EvidenceStore rooted at `<dataDir>/evidence/` (created
 * on construction; unwritable roots fail fast with a thrown Error, mirroring
 * the capture store). See the module header for the layout.
 */
export class FsEvidenceStore implements EvidenceStore {
  private readonly root: string;

  constructor(dataDir: string) {
    this.root = join(resolve(dataDir), "evidence");
    for (const directory of ["records", "links", "derivations"]) {
      mkdirSync(join(this.root, directory), { recursive: true });
    }
  }

  /** Absolute path of the immutable record file for a content id. */
  recordPath(contentId: string): string {
    assertContentId(contentId);
    return join(this.root, "records", `${sha256Hex(contentId)}.json`);
  }

  /** Absolute path of the appended invalidation file for a content id. */
  invalidationPath(contentId: string): string {
    assertContentId(contentId);
    return join(this.root, "records", `${sha256Hex(contentId)}.invalidated.json`);
  }

  /** Absolute path of the append-only link journal for one link. */
  linkPath(link: ProvenanceLink): string {
    return join(this.root, "links", `${linkJournalKey(link)}.jsonl`);
  }

  /** Absolute path of the append-only derivation journal for one derivation. */
  derivationPath(derivation: Derivation): string {
    return join(this.root, "derivations", `${sha256Hex(derivation.derivationId)}.jsonl`);
  }

  async getEvidenceRecord(contentId: string): Promise<Evidence | null> {
    return readJsonFile<Evidence>(this.recordPath(contentId));
  }

  async putEvidenceRecord(evidence: Evidence): Promise<boolean> {
    // Write once: an existing record is never rewritten or deleted.
    const path = this.recordPath(evidence.contentId);
    if ((await readJsonFile<Evidence>(path)) !== null) {
      return false;
    }
    await writeJsonFile(path, evidence);
    return true;
  }

  async getInvalidation(contentId: string): Promise<EvidenceInvalidationInfo | null> {
    return readJsonFile<EvidenceInvalidationInfo>(this.invalidationPath(contentId));
  }

  async putInvalidation(info: EvidenceInvalidationInfo): Promise<boolean> {
    // Append once: an existing invalidation is never rewritten.
    const path = this.invalidationPath(info.contentId);
    if ((await readJsonFile<EvidenceInvalidationInfo>(path)) !== null) {
      return false;
    }
    await writeJsonFile(path, info);
    return true;
  }

  async appendLink(link: ProvenanceLink): Promise<void> {
    const path = this.linkPath(link);
    await fs.mkdir(dirname(path), { recursive: true });
    await fs.appendFile(path, jsonlLine(link), "utf8");
  }

  async appendDerivation(derivation: Derivation): Promise<void> {
    const path = this.derivationPath(derivation);
    await fs.mkdir(dirname(path), { recursive: true });
    await fs.appendFile(path, jsonlLine(derivation), "utf8");
  }

  async listLinks(): Promise<ProvenanceLink[]> {
    return this.listJournal<ProvenanceLink>("links");
  }

  async listDerivations(): Promise<Derivation[]> {
    return this.listJournal<Derivation>("derivations");
  }

  async listEvidenceRecords(): Promise<Evidence[]> {
    const directory = join(this.root, "records");
    const records: Evidence[] = [];
    for (const file of readdirSync(directory).sort()) {
      if (!file.endsWith(".json") || file.endsWith(".invalidated.json")) {
        continue;
      }
      const record = await readJsonFile<Evidence>(join(directory, file));
      if (record !== null) {
        records.push(record);
      }
    }
    return records.sort((a, b) => a.contentId.localeCompare(b.contentId));
  }

  /** Read every `.jsonl` journal file in a directory in sorted file order. */
  private async listJournal<T>(directoryName: string): Promise<T[]> {
    const directory = join(this.root, directoryName);
    const values: T[] = [];
    for (const file of readdirSync(directory).sort()) {
      if (!file.endsWith(".jsonl")) {
        continue;
      }
      const text = await fs.readFile(join(directory, file), "utf8");
      for (const value of parseJsonl(text)) {
        values.push(value as T);
      }
    }
    return values;
  }
}
