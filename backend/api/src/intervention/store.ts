/**
 * AISE-026 — Intervention scenario persistence (persistence ONLY).
 *
 * Contract (mirrors the case-store discipline — the store is PERSISTENCE
 * ONLY, no intervention policy):
 *
 *  - One scenario record per file at
 *    `<dataDir>/interventions/<sha256(scenarioId)>.json`, written with the
 *    shared canonical JSON encoder via write-temp-rename (never a
 *    half-written record on disk). Opaque scenario ids are hashed into
 *    filesystem-safe names and stored verbatim inside the JSON record.
 *  - Scenario records are immutable once created EXCEPT appending steps,
 *    states, transitions and approval references — the append-only
 *    discipline enforced in the SERVICE (prior steps/states are never
 *    rewritten there; this store never rewrites history it did not
 *    receive).
 *  - Reads are validated with `parseInterventionScenarioRecord`: garbage
 *    on disk is a typed `invalid_intervention_record` rejection (or
 *    `invalid_epistemic_status` when a non-PROPOSED status leaks into
 *    state content), never a silent misparse. Writes are trusted (the
 *    service validated the record before committing).
 *  - `InMemoryInterventionStore` is the deterministic twin: it stores the
 *    canonical JSON TEXT and re-parses on read, so both implementations
 *    exhibit identical semantics (identical get/put behavior, identical
 *    list order — sorted by scenarioId).
 *
 * Single-writer assumption: one service instance per data dir (same as
 * the reality/case stores); concurrent writers are the deployment's duty.
 */

import { promises as fs } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { canonicalJsonStringify } from "@aise/shared-contracts";
import { sha256Hex } from "../lib/hash";
import { InterventionError, parseInterventionScenarioRecord, type InterventionScenario } from "./model";

/* ------------------------------------------------------------------ */
/* Store interface                                                      */
/* ------------------------------------------------------------------ */

export interface InterventionStore {
  /** Persist (rewrite) one full scenario record, canonical JSON, atomically. */
  put(record: InterventionScenario): Promise<void>;
  /** The stored record, or null when the scenario id is unknown. */
  get(scenarioId: string): Promise<InterventionScenario | null>;
  /** All stored records, sorted by scenarioId (stable total order). */
  list(): Promise<InterventionScenario[]>;
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

/** Parse one scenario file's text: invalid JSON is a typed rejection. */
function parseScenarioText(text: string): InterventionScenario {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new InterventionError("invalid_intervention_record", "scenario file is not valid JSON");
  }
  return parseInterventionScenarioRecord(value);
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

export class FsInterventionStore implements InterventionStore {
  private readonly root: string;

  constructor(dataDir: string) {
    this.root = resolve(join(dataDir, "interventions"));
  }

  /** Exposed for tests: the canonical file path of one scenario id. */
  pathOf(scenarioId: string): string {
    return join(this.root, `${sha256Hex(scenarioId)}.json`);
  }

  async put(record: InterventionScenario): Promise<void> {
    await writeJsonAtomic(this.pathOf(record.scenarioId), record);
  }

  async get(scenarioId: string): Promise<InterventionScenario | null> {
    let text: string;
    try {
      text = await fs.readFile(this.pathOf(scenarioId), "utf8");
    } catch (error) {
      if (isNotFound(error)) {
        return null;
      }
      throw error;
    }
    return parseScenarioText(text);
  }

  async list(): Promise<InterventionScenario[]> {
    let entries: string[];
    try {
      entries = await fs.readdir(this.root);
    } catch (error) {
      if (isNotFound(error)) {
        return [];
      }
      throw error;
    }
    const records: InterventionScenario[] = [];
    for (const entry of entries.sort()) {
      if (!entry.endsWith(".json")) {
        continue; // never touch .tmp leftovers or foreign files
      }
      records.push(parseScenarioText(await fs.readFile(join(this.root, entry), "utf8")));
    }
    return records.sort((a, b) =>
      a.scenarioId < b.scenarioId ? -1 : a.scenarioId > b.scenarioId ? 1 : 0,
    );
  }
}

/* ------------------------------------------------------------------ */
/* In-memory twin (canonical-text-backed: identical semantics)          */
/* ------------------------------------------------------------------ */

export class InMemoryInterventionStore implements InterventionStore {
  private readonly byScenarioId = new Map<string, string>();

  async put(record: InterventionScenario): Promise<void> {
    this.byScenarioId.set(record.scenarioId, canonicalJsonStringify(record));
  }

  async get(scenarioId: string): Promise<InterventionScenario | null> {
    const text = this.byScenarioId.get(scenarioId);
    if (text === undefined) {
      return null;
    }
    return parseScenarioText(text);
  }

  async list(): Promise<InterventionScenario[]> {
    const records: InterventionScenario[] = [];
    for (const text of this.byScenarioId.values()) {
      records.push(parseScenarioText(text));
    }
    return records.sort((a, b) =>
      a.scenarioId < b.scenarioId ? -1 : a.scenarioId > b.scenarioId ? 1 : 0,
    );
  }
}
