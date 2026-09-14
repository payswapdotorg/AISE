/**
 * Engineering Case store — persistence abstraction (AISE-025).
 *
 * Contract (mirrors capture/reality store discipline — the store is
 * PERSISTENCE ONLY, no case policy):
 *
 *  - One case record per file at `<dataDir>/cases/<sha256(caseId)>.json`,
 *    written with the shared canonical JSON encoder via write-temp-rename
 *    (never a half-written record on disk). Opaque case ids are hashed into
 *    filesystem-safe names and stored verbatim inside the JSON record.
 *  - Case updates REWRITE the file (the file is a rebuildable projection of
 *    the record), but the record itself carries the append-only
 *    `history: CaseEvent[]` — the SERVICE never mutates prior events; this
 *    store never rewrites history it did not receive. Append-only
 *    discipline is enforced above the store (service.ts), exactly like the
 *    mapping store's version lineage.
 *  - Reads are validated with `parseCaseRecord`: garbage on disk is a typed
 *    `invalid_case_record` rejection, never a silent misparse. Writes are
 *    trusted (the service validated the record before committing).
 *  - `InMemoryCaseStore` is the deterministic twin: it stores the canonical
 *    JSON TEXT and re-parses on read, so both implementations exhibit
 *    byte-identical behavior (identical get/put semantics, identical list
 *    order — sorted by caseId).
 *
 * Single-writer assumption: one service instance per data dir (same as the
 * reality/mapping stores); concurrent writers are the deployment's duty.
 */

import { promises as fs } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { canonicalJsonStringify } from "@aise/shared-contracts";
import { sha256Hex } from "../lib/hash";
import { CaseError, parseCaseRecord, type EngineeringCase } from "./model";

/* ------------------------------------------------------------------ */
/* Store interface                                                      */
/* ------------------------------------------------------------------ */

export interface CaseStore {
  /** Persist (rewrite) one full case record, canonical JSON, atomically. */
  put(record: EngineeringCase): Promise<void>;
  /** The stored record, or null when the case id is unknown. */
  get(caseId: string): Promise<EngineeringCase | null>;
  /** All stored records, sorted by caseId (stable total order). */
  list(): Promise<EngineeringCase[]>;
}

/* ------------------------------------------------------------------ */
/* Shared helpers                                                       */
/* ------------------------------------------------------------------ */

function isNotFound(error: unknown): boolean {
  return (
    typeof error === "object" && error !== null && (error as { code?: unknown }).code === "ENOENT"
  );
}

/** Parse one case file's text: invalid JSON is a typed rejection. */
function parseCaseText(text: string): EngineeringCase {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new CaseError("invalid_case_record", "case file is not valid JSON");
  }
  return parseCaseRecord(value);
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

export class FsCaseStore implements CaseStore {
  private readonly root: string;

  constructor(dataDir: string) {
    this.root = resolve(join(dataDir, "cases"));
  }

  /** Exposed for tests: the canonical file path of one case id. */
  pathOf(caseId: string): string {
    return join(this.root, `${sha256Hex(caseId)}.json`);
  }

  async put(record: EngineeringCase): Promise<void> {
    await writeJsonAtomic(this.pathOf(record.caseId), record);
  }

  async get(caseId: string): Promise<EngineeringCase | null> {
    let text: string;
    try {
      text = await fs.readFile(this.pathOf(caseId), "utf8");
    } catch (error) {
      if (isNotFound(error)) {
        return null;
      }
      throw error;
    }
    return parseCaseText(text);
  }

  async list(): Promise<EngineeringCase[]> {
    let entries: string[];
    try {
      entries = await fs.readdir(this.root);
    } catch (error) {
      if (isNotFound(error)) {
        return [];
      }
      throw error;
    }
    const records: EngineeringCase[] = [];
    for (const entry of entries.sort()) {
      if (!entry.endsWith(".json")) {
        continue; // never touch .tmp leftovers or foreign files
      }
      records.push(parseCaseText(await fs.readFile(join(this.root, entry), "utf8")));
    }
    return records.sort((a, b) => (a.caseId < b.caseId ? -1 : a.caseId > b.caseId ? 1 : 0));
  }
}

/* ------------------------------------------------------------------ */
/* In-memory twin (canonical-text-backed: identical semantics)          */
/* ------------------------------------------------------------------ */

export class InMemoryCaseStore implements CaseStore {
  private readonly byCaseId = new Map<string, string>();

  async put(record: EngineeringCase): Promise<void> {
    this.byCaseId.set(record.caseId, canonicalJsonStringify(record));
  }

  async get(caseId: string): Promise<EngineeringCase | null> {
    const text = this.byCaseId.get(caseId);
    if (text === undefined) {
      return null;
    }
    return parseCaseText(text);
  }

  async list(): Promise<EngineeringCase[]> {
    const records: EngineeringCase[] = [];
    for (const text of this.byCaseId.values()) {
      records.push(parseCaseText(text));
    }
    return records.sort((a, b) => (a.caseId < b.caseId ? -1 : a.caseId > b.caseId ? 1 : 0));
  }
}
