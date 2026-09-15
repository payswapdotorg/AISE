/**
 * Reality-vs-design comparison store — persistence abstraction (AISE-032).
 *
 * Contract (mirrors the execution/case store discipline — the store is
 * PERSISTENCE ONLY, no comparison policy):
 *
 *  - One comparison record per file at
 *    `<dataDir>/comparisons/<sha256(comparisonId)>.json`, written with
 *    the shared canonical JSON encoder via write-temp-rename (never a
 *    half-written record on disk). Opaque comparison ids are hashed into
 *    filesystem-safe names and stored verbatim inside the JSON record.
 *  - APPEND-ONLY / WRITE-ONCE: comparison records are never rewritten.
 *    There is no update path in this domain (the service refuses id
 *    reuse with `comparison_exists`); a re-run against newer inputs is a
 *    NEW record under a NEW id. This store therefore has `put` + `get` +
 *    `list` and NOTHING else — structurally no rewrite entry point.
 *  - Reads are validated with `parseComparisonRecord`: garbage on disk
 *    (including stats inconsistent with entries, or a history digest
 *    that does not pin the persisted content) is a typed
 *    `invalid_comparison_record` rejection, never a silent misparse.
 *    Writes are trusted (the service validated the record before
 *    committing).
 *  - `InMemoryComparisonStore` is the deterministic twin: it stores the
 *    canonical JSON TEXT and re-parses on read, so both implementations
 *    exhibit byte-identical behavior (identical get/put semantics,
 *    identical list order — sorted by comparisonId).
 *
 * Single-writer assumption: one service instance per data dir (same as the
 * case/execution stores); concurrent writers are the deployment's duty.
 */

import { promises as fs } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { canonicalJsonStringify } from "@aise/shared-contracts";
import { sha256Hex } from "../lib/hash";
import { ComparisonError, parseComparisonRecord, type ComparisonRecord } from "./model";

/* ------------------------------------------------------------------ */
/* Store interface                                                      */
/* ------------------------------------------------------------------ */

export interface ComparisonStore {
  /** Persist (write once) one full comparison record, canonical JSON, atomically. */
  put(record: ComparisonRecord): Promise<void>;
  /** The stored record, or null when the comparison id is unknown. */
  get(comparisonId: string): Promise<ComparisonRecord | null>;
  /** All stored records, sorted by comparisonId (stable total order). */
  list(): Promise<ComparisonRecord[]>;
}

/* ------------------------------------------------------------------ */
/* Shared helpers                                                       */
/* ------------------------------------------------------------------ */

function isNotFound(error: unknown): boolean {
  return (
    typeof error === "object" && error !== null && (error as { code?: unknown }).code === "ENOENT"
  );
}

/** Parse one comparison file's text: invalid JSON is a typed rejection. */
function parseComparisonText(text: string): ComparisonRecord {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new ComparisonError("invalid_comparison_record", "comparison file is not valid JSON");
  }
  return parseComparisonRecord(value);
}

/** Write-temp-rename canonical JSON (never a half-written record on disk). */
async function writeJsonAtomic(path: string, value: unknown): Promise<void> {
  await fs.mkdir(dirname(path), { recursive: true });
  const tmp = `${path}.tmp`;
  await fs.writeFile(tmp, canonicalJsonStringify(value));
  await fs.rename(tmp, path);
}

/* ------------------------------------------------------------------ */
/* File-system store                                                    */
/* ------------------------------------------------------------------ */

export class FsComparisonStore implements ComparisonStore {
  private readonly root: string;

  constructor(dataDir: string) {
    this.root = resolve(join(dataDir, "comparisons"));
  }

  /** Exposed for tests: the canonical file path of one comparison id. */
  pathOf(comparisonId: string): string {
    return join(this.root, `${sha256Hex(comparisonId)}.json`);
  }

  async put(record: ComparisonRecord): Promise<void> {
    await writeJsonAtomic(this.pathOf(record.comparisonId), record);
  }

  async get(comparisonId: string): Promise<ComparisonRecord | null> {
    let text: string;
    try {
      text = await fs.readFile(this.pathOf(comparisonId), "utf8");
    } catch (error) {
      if (isNotFound(error)) {
        return null;
      }
      throw error;
    }
    return parseComparisonText(text);
  }

  async list(): Promise<ComparisonRecord[]> {
    let entries: string[];
    try {
      entries = await fs.readdir(this.root);
    } catch (error) {
      if (isNotFound(error)) {
        return [];
      }
      throw error;
    }
    const records: ComparisonRecord[] = [];
    for (const entry of entries.sort()) {
      if (!entry.endsWith(".json")) {
        continue; // never touch .tmp leftovers or foreign files
      }
      records.push(parseComparisonText(await fs.readFile(join(this.root, entry), "utf8")));
    }
    return records.sort((a, b) =>
      a.comparisonId < b.comparisonId ? -1 : a.comparisonId > b.comparisonId ? 1 : 0,
    );
  }
}

/* ------------------------------------------------------------------ */
/* In-memory twin (canonical-text-backed: identical semantics)          */
/* ------------------------------------------------------------------ */

export class InMemoryComparisonStore implements ComparisonStore {
  private readonly byComparisonId = new Map<string, string>();

  async put(record: ComparisonRecord): Promise<void> {
    this.byComparisonId.set(record.comparisonId, canonicalJsonStringify(record));
  }

  async get(comparisonId: string): Promise<ComparisonRecord | null> {
    const text = this.byComparisonId.get(comparisonId);
    if (text === undefined) {
      return null;
    }
    return parseComparisonText(text);
  }

  async list(): Promise<ComparisonRecord[]> {
    const records: ComparisonRecord[] = [];
    for (const text of this.byComparisonId.values()) {
      records.push(parseComparisonText(text));
    }
    return records.sort((a, b) =>
      a.comparisonId < b.comparisonId ? -1 : a.comparisonId > b.comparisonId ? 1 : 0,
    );
  }
}
