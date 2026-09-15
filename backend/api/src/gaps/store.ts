/**
 * Gap-analysis store — persistence abstraction (AISE-018).
 *
 * Contract (mirrors the comparison/case store discipline — the store is
 * PERSISTENCE ONLY, no analysis policy):
 *
 *  - One analysis record per file at
 *    `<dataDir>/gaps/<sha256(analysisId)>.json`, written with the shared
 *    canonical JSON encoder via write-temp-rename (never a half-written
 *    record on disk). Opaque analysis ids are hashed into
 *    filesystem-safe names and stored verbatim inside the JSON record.
 *  - APPEND-ONLY / WRITE-ONCE: analysis records are never rewritten.
 *    There is no update path in this domain (the service refuses id
 *    reuse with `analysis_exists`); a re-analysis against newer inputs
 *    is a NEW record under a NEW id. This store therefore has `put` +
 *    `get` + `list` and NOTHING else — structurally no rewrite entry
 *    point.
 *  - Reads are validated with `parseGapAnalysisRecord`: garbage on disk
 *    (including stats inconsistent with rows, candidates addressing
 *    unknown gaps, or a history digest that does not pin the persisted
 *    content) is a typed `invalid_analysis_record` rejection, never a
 *    silent misparse. Writes are trusted (the service validated the
 *    record before committing).
 *  - `InMemoryGapAnalysisStore` is the deterministic twin: it stores the
 *    canonical JSON TEXT and re-parses on read, so both implementations
 *    exhibit byte-identical behavior (identical get/put semantics,
 *    identical list order — sorted by analysisId).
 *
 * Single-writer assumption: one service instance per data dir (same as the
 * comparison/case stores); concurrent writers are the deployment's duty.
 */

import { promises as fs } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { canonicalJsonStringify } from "@aise/shared-contracts";
import { sha256Hex } from "../lib/hash";
import { GapAnalysisError, parseGapAnalysisRecord, type GapAnalysisRecord } from "./model";

/* ------------------------------------------------------------------ */
/* Store interface                                                      */
/* ------------------------------------------------------------------ */

export interface GapAnalysisStore {
  /** Persist (write once) one full analysis record, canonical JSON, atomically. */
  put(record: GapAnalysisRecord): Promise<void>;
  /** The stored record, or null when the analysis id is unknown. */
  get(analysisId: string): Promise<GapAnalysisRecord | null>;
  /** All stored records, sorted by analysisId (stable total order). */
  list(): Promise<GapAnalysisRecord[]>;
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

/** Parse one analysis file's text: invalid JSON is a typed rejection. */
function parseAnalysisText(text: string): GapAnalysisRecord {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new GapAnalysisError("invalid_analysis_record", "analysis file is not valid JSON");
  }
  return parseGapAnalysisRecord(value);
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

export class FsGapAnalysisStore implements GapAnalysisStore {
  private readonly root: string;

  constructor(dataDir: string) {
    this.root = resolve(join(dataDir, "gaps"));
  }

  /** Exposed for tests: the canonical file path of one analysis id. */
  pathOf(analysisId: string): string {
    return join(this.root, `${sha256Hex(analysisId)}.json`);
  }

  async put(record: GapAnalysisRecord): Promise<void> {
    await writeJsonAtomic(this.pathOf(record.analysisId), record);
  }

  async get(analysisId: string): Promise<GapAnalysisRecord | null> {
    let text: string;
    try {
      text = await fs.readFile(this.pathOf(analysisId), "utf8");
    } catch (error) {
      if (isNotFound(error)) {
        return null;
      }
      throw error;
    }
    return parseAnalysisText(text);
  }

  async list(): Promise<GapAnalysisRecord[]> {
    let entries: string[];
    try {
      entries = await fs.readdir(this.root);
    } catch (error) {
      if (isNotFound(error)) {
        return [];
      }
      throw error;
    }
    const records: GapAnalysisRecord[] = [];
    for (const entry of entries.sort()) {
      if (!entry.endsWith(".json")) {
        continue; // never touch .tmp leftovers or foreign files
      }
      records.push(parseAnalysisText(await fs.readFile(join(this.root, entry), "utf8")));
    }
    return records.sort((a, b) =>
      a.analysisId < b.analysisId ? -1 : a.analysisId > b.analysisId ? 1 : 0,
    );
  }
}

/* ------------------------------------------------------------------ */
/* In-memory twin (canonical-text-backed: identical semantics)          */
/* ------------------------------------------------------------------ */

export class InMemoryGapAnalysisStore implements GapAnalysisStore {
  private readonly byAnalysisId = new Map<string, string>();

  async put(record: GapAnalysisRecord): Promise<void> {
    this.byAnalysisId.set(record.analysisId, canonicalJsonStringify(record));
  }

  async get(analysisId: string): Promise<GapAnalysisRecord | null> {
    const text = this.byAnalysisId.get(analysisId);
    if (text === undefined) {
      return null;
    }
    return parseAnalysisText(text);
  }

  async list(): Promise<GapAnalysisRecord[]> {
    const records: GapAnalysisRecord[] = [];
    for (const text of this.byAnalysisId.values()) {
      records.push(parseAnalysisText(text));
    }
    return records.sort((a, b) =>
      a.analysisId < b.analysisId ? -1 : a.analysisId > b.analysisId ? 1 : 0,
    );
  }
}
