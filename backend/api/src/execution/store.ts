/**
 * Execution/outcome store — persistence abstraction (AISE-031).
 *
 * Contract (mirrors the case/intervention store discipline — the store is
 * PERSISTENCE ONLY, no execution policy):
 *
 *  - One execution record per file at
 *    `<dataDir>/executions/<sha256(executionRecordId)>.json`, written with
 *    the shared canonical JSON encoder via write-temp-rename (never a
 *    half-written record on disk). Opaque execution ids are hashed into
 *    filesystem-safe names and stored verbatim inside the JSON record.
 *  - Execution updates REWRITE the file (the file is a rebuildable
 *    projection of the record), but the record itself carries the
 *    append-only `history: ExecutionEvent[]` — the SERVICE never mutates
 *    prior events; this store never rewrites history it did not receive.
 *    Append-only discipline is enforced above the store (service.ts),
 *    exactly like the case store's version lineage.
 *  - Reads are validated with `parseExecutionRecord`: garbage on disk is a
 *    typed `invalid_execution_record` rejection, never a silent misparse.
 *    Writes are trusted (the service validated the record before
 *    committing).
 *  - `InMemoryExecutionStore` is the deterministic twin: it stores the
 *    canonical JSON TEXT and re-parses on read, so both implementations
 *    exhibit byte-identical behavior (identical get/put semantics,
 *    identical list order — sorted by executionRecordId).
 *
 * Single-writer assumption: one service instance per data dir (same as the
 * case/intervention stores); concurrent writers are the deployment's duty.
 */

import { promises as fs } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { canonicalJsonStringify } from "@aise/shared-contracts";
import { sha256Hex } from "../lib/hash";
import { ExecutionError, parseExecutionRecord, type ExecutionRecord } from "./model";

/* ------------------------------------------------------------------ */
/* Store interface                                                      */
/* ------------------------------------------------------------------ */

export interface ExecutionStore {
  /** Persist (rewrite) one full execution record, canonical JSON, atomically. */
  put(record: ExecutionRecord): Promise<void>;
  /** The stored record, or null when the execution id is unknown. */
  get(executionRecordId: string): Promise<ExecutionRecord | null>;
  /** All stored records, sorted by executionRecordId (stable total order). */
  list(): Promise<ExecutionRecord[]>;
}

/* ------------------------------------------------------------------ */
/* Shared helpers                                                       */
/* ------------------------------------------------------------------ */

function isNotFound(error: unknown): boolean {
  return (
    typeof error === "object" && error !== null && (error as { code?: unknown }).code === "ENOENT"
  );
}

/** Parse one execution file's text: invalid JSON is a typed rejection. */
function parseExecutionText(text: string): ExecutionRecord {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new ExecutionError("invalid_execution_record", "execution file is not valid JSON");
  }
  return parseExecutionRecord(value);
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

export class FsExecutionStore implements ExecutionStore {
  private readonly root: string;

  constructor(dataDir: string) {
    this.root = resolve(join(dataDir, "executions"));
  }

  /** Exposed for tests: the canonical file path of one execution id. */
  pathOf(executionRecordId: string): string {
    return join(this.root, `${sha256Hex(executionRecordId)}.json`);
  }

  async put(record: ExecutionRecord): Promise<void> {
    await writeJsonAtomic(this.pathOf(record.executionRecordId), record);
  }

  async get(executionRecordId: string): Promise<ExecutionRecord | null> {
    let text: string;
    try {
      text = await fs.readFile(this.pathOf(executionRecordId), "utf8");
    } catch (error) {
      if (isNotFound(error)) {
        return null;
      }
      throw error;
    }
    return parseExecutionText(text);
  }

  async list(): Promise<ExecutionRecord[]> {
    let entries: string[];
    try {
      entries = await fs.readdir(this.root);
    } catch (error) {
      if (isNotFound(error)) {
        return [];
      }
      throw error;
    }
    const records: ExecutionRecord[] = [];
    for (const entry of entries.sort()) {
      if (!entry.endsWith(".json")) {
        continue; // never touch .tmp leftovers or foreign files
      }
      records.push(parseExecutionText(await fs.readFile(join(this.root, entry), "utf8")));
    }
    return records.sort((a, b) =>
      a.executionRecordId < b.executionRecordId ? -1 : a.executionRecordId > b.executionRecordId ? 1 : 0,
    );
  }
}

/* ------------------------------------------------------------------ */
/* In-memory twin (canonical-text-backed: identical semantics)          */
/* ------------------------------------------------------------------ */

export class InMemoryExecutionStore implements ExecutionStore {
  private readonly byExecutionId = new Map<string, string>();

  async put(record: ExecutionRecord): Promise<void> {
    this.byExecutionId.set(record.executionRecordId, canonicalJsonStringify(record));
  }

  async get(executionRecordId: string): Promise<ExecutionRecord | null> {
    const text = this.byExecutionId.get(executionRecordId);
    if (text === undefined) {
      return null;
    }
    return parseExecutionText(text);
  }

  async list(): Promise<ExecutionRecord[]> {
    const records: ExecutionRecord[] = [];
    for (const text of this.byExecutionId.values()) {
      records.push(parseExecutionText(text));
    }
    return records.sort((a, b) =>
      a.executionRecordId < b.executionRecordId ? -1 : a.executionRecordId > b.executionRecordId ? 1 : 0,
    );
  }
}
