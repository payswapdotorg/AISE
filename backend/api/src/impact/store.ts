/**
 * Impact store — persistence abstraction (AISE-028).
 *
 * Contract (the write-once twin of the execution store discipline — this
 * store is PERSISTENCE ONLY, no impact policy):
 *
 *  - One impact record per file at
 *    `<dataDir>/impacts/<sha256(impactId)>.json`, written with the shared
 *    canonical JSON encoder via write-temp-rename (never a half-written
 *    record on disk). Opaque impact ids are hashed into filesystem-safe
 *    names and stored verbatim inside the JSON record.
 *  - WRITE-ONCE, APPEND-ONLY: there is NO update and NO delete method on
 *    the store interface — a correction is a NEW impact record (a new
 *    mapping revision or rate set derives a new content id), never a
 *    rewrite. `put` refuses an EXISTING id whose stored canonical text
 *    differs from the incoming record (typed `impact_record_divergence`)
 *    and is a no-op for byte-identical content — defense in depth under
 *    the service's own idempotence check.
 *  - Reads are validated with `parseImpactRecord`: garbage or tampered
 *    bytes on disk are a typed `invalid_impact_record` rejection (the
 *    parser re-verifies the report digest and the PROPOSED-literal
 *    discipline), never a silent misparse. Writes are trusted (the service
 *    validated the record before committing).
 *  - `InMemoryImpactStore` is the deterministic twin: it stores the
 *    canonical JSON TEXT and re-parses on read, so both implementations
 *    exhibit byte-identical behavior (identical get/put semantics,
 *    identical list order — sorted by impactId).
 *
 * Single-writer assumption: one service instance per data dir (same as the
 * case/intervention/execution stores); concurrent writers are the
 * deployment's duty.
 */

import { promises as fs } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { canonicalJsonStringify } from "@aise/shared-contracts";
import { sha256Hex } from "../lib/hash";
import { ImpactError, parseImpactRecord, type ImpactRecord } from "./model";

/* ------------------------------------------------------------------ */
/* Store interface                                                      */
/* ------------------------------------------------------------------ */

export interface ImpactStore {
  /**
   * Persist one impact record (canonical JSON, atomic). Write-once: an
   * existing id with IDENTICAL canonical bytes is a no-op; DIFFERENT bytes
   * are a typed `impact_record_divergence` refusal.
   */
  put(record: ImpactRecord): Promise<void>;
  /** The stored record, or null when the impact id is unknown. */
  get(impactId: string): Promise<ImpactRecord | null>;
  /** All stored records, sorted by impactId (stable total order). */
  list(): Promise<ImpactRecord[]>;
}

/* ------------------------------------------------------------------ */
/* Shared helpers                                                       */
/* ------------------------------------------------------------------ */

function isNotFound(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { code?: unknown }).code === "ENOENT"
  );
}

/** Parse one impact file's text: invalid JSON is a typed rejection. */
function parseImpactText(text: string): ImpactRecord {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new ImpactError("invalid_impact_record", "impact file is not valid JSON");
  }
  return parseImpactRecord(value);
}

/** Write-temp-rename canonical JSON (never a half-written record on disk). */
async function writeJsonAtomic(path: string, value: unknown): Promise<void> {
  await fs.mkdir(dirname(path), { recursive: true });
  const tmp = `${path}.tmp`;
  await fs.writeFile(tmp, canonicalJsonStringify(value));
  await fs.rename(tmp, path);
}

/** Enforce write-once discipline over already-stored canonical text. */
function assertWriteOnce(impactId: string, existingText: string | null, text: string): void {
  if (existingText !== null && existingText !== text) {
    throw new ImpactError(
      "impact_record_divergence",
      `impact ${impactId} is already stored with different content — records are write-once; record a NEW impact (a new mapping revision or rate set) instead`,
    );
  }
}

/* ------------------------------------------------------------------ */
/* File-system store                                                    */
/* ------------------------------------------------------------------ */

export class FsImpactStore implements ImpactStore {
  private readonly root: string;

  constructor(dataDir: string) {
    this.root = resolve(join(dataDir, "impacts"));
  }

  /** Exposed for tests: the canonical file path of one impact id. */
  pathOf(impactId: string): string {
    return join(this.root, `${sha256Hex(impactId)}.json`);
  }

  async put(record: ImpactRecord): Promise<void> {
    const path = this.pathOf(record.impactId);
    let existing: string | null = null;
    try {
      existing = await fs.readFile(path, "utf8");
    } catch (error) {
      if (!isNotFound(error)) {
        throw error;
      }
    }
    assertWriteOnce(record.impactId, existing, canonicalJsonStringify(record));
    if (existing !== null) {
      return; // byte-identical re-put is a no-op
    }
    await writeJsonAtomic(path, record);
  }

  async get(impactId: string): Promise<ImpactRecord | null> {
    let text: string;
    try {
      text = await fs.readFile(this.pathOf(impactId), "utf8");
    } catch (error) {
      if (isNotFound(error)) {
        return null;
      }
      throw error;
    }
    return parseImpactText(text);
  }

  async list(): Promise<ImpactRecord[]> {
    let entries: string[];
    try {
      entries = await fs.readdir(this.root);
    } catch (error) {
      if (isNotFound(error)) {
        return [];
      }
      throw error;
    }
    const records: ImpactRecord[] = [];
    for (const entry of entries.sort()) {
      if (!entry.endsWith(".json")) {
        continue; // never touch .tmp leftovers or foreign files
      }
      records.push(parseImpactText(await fs.readFile(join(this.root, entry), "utf8")));
    }
    return records.sort((a, b) =>
      a.impactId < b.impactId ? -1 : a.impactId > b.impactId ? 1 : 0,
    );
  }
}

/* ------------------------------------------------------------------ */
/* In-memory twin (canonical-text-backed: identical semantics)          */
/* ------------------------------------------------------------------ */

export class InMemoryImpactStore implements ImpactStore {
  private readonly byImpactId = new Map<string, string>();

  async put(record: ImpactRecord): Promise<void> {
    const text = canonicalJsonStringify(record);
    assertWriteOnce(record.impactId, this.byImpactId.get(record.impactId) ?? null, text);
    this.byImpactId.set(record.impactId, text);
  }

  async get(impactId: string): Promise<ImpactRecord | null> {
    const text = this.byImpactId.get(impactId);
    if (text === undefined) {
      return null;
    }
    return parseImpactText(text);
  }

  async list(): Promise<ImpactRecord[]> {
    const records: ImpactRecord[] = [];
    for (const text of this.byImpactId.values()) {
      records.push(parseImpactText(text));
    }
    return records.sort((a, b) =>
      a.impactId < b.impactId ? -1 : a.impactId > b.impactId ? 1 : 0,
    );
  }
}
