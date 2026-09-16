/**
 * Execution record persistence (PROD-009) — PERSISTENCE ONLY.
 *
 * Contract (mirrors the reconstruction/store.ts discipline; all gateway
 * lifecycle policy lives in `reconstruction/gateway/service.ts`):
 *
 *  - EXECUTION RECORDS are rewritten on every status transition via
 *    write-temp-then-rename, but the history lives INSIDE the record as an
 *    append-only `events` list: both store implementations REFUSE any put
 *    whose event list does not start with the previously stored events
 *    (`execution_history_truncated`) — history can grow, never shrink.
 *  - REQUEST KEYS ARE UNIQUE: one request key claims at most one execution
 *    (the idempotency boundary). A put whose request key is already claimed
 *    by a DIFFERENT execution id is refused (`request_key_collision`,
 *    original retained).
 *  - The gateway owns TRANSIENT EXECUTION STATE ONLY: this store holds
 *    execution records; it never touches canonical job/artifact state, so
 *    unavailable and failed executions are non-destructive by construction.
 *  - Listing is deterministic everywhere: executions sort by
 *    (createdAt, executionId).
 *  - `InMemoryExecutionStore` gives tests identical, deterministic behavior.
 *
 * File-system layout (the Fs store roots itself at
 * `<dataDir>/reconstruction/gateway/`, created on construction; the dataDir
 * is the constructor argument):
 *
 *   data/reconstruction/gateway/executions/<sha256(executionId)>.json  record
 *   data/reconstruction/gateway/by-key/<sha256(requestKey)>.json       key pointer
 *
 * Records use the shared canonical JSON encoder (2-space, sorted keys, tail
 * newline). Identical operation sequences always produce identical bytes.
 */

import { mkdirSync, promises as fs, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { canonicalizeJson, canonicalJsonStringify } from "@aise/shared-contracts";
import { sha256Hex } from "../../lib/hash";
import type { ExecutionEvent, ExecutionRecord } from "./model";

/* ------------------------------------------------------------------ */
/* Store interface                                                     */
/* ------------------------------------------------------------------ */

export interface ExecutionStore {
  /** Rewrite the full execution record (atomic temp+rename on the Fs twin).
   *  Refuses history truncation and request-key collisions with typed errors. */
  put(record: ExecutionRecord): Promise<void>;
  get(executionId: string): Promise<ExecutionRecord | null>;
  /** The execution claiming this request key, or null (idempotency lookup). */
  getByRequestKey(requestKey: string): Promise<ExecutionRecord | null>;
  list(): Promise<ExecutionRecord[]>;
}

export type ExecutionStoreErrorCode =
  | "execution_history_truncated"
  | "request_key_collision"
  | "corrupt_execution_record";

export class ExecutionStoreError extends Error {
  readonly code: ExecutionStoreErrorCode;

  constructor(code: ExecutionStoreErrorCode, detail: string) {
    super(`execution store: ${code}: ${detail}`);
    this.code = code;
  }
}

/* ------------------------------------------------------------------ */
/* Shared helpers                                                      */
/* ------------------------------------------------------------------ */

/** Canonical deep equality (sorted keys at every level). */
function canonicalEquals(a: unknown, b: unknown): boolean {
  return JSON.stringify(canonicalizeJson(a)) === JSON.stringify(canonicalizeJson(b));
}

/** True when `previous` is a prefix of `next` (element-wise canonical equality). */
function isEventPrefix(previous: readonly ExecutionEvent[], next: readonly ExecutionEvent[]): boolean {
  if (previous.length > next.length) {
    return false;
  }
  for (let index = 0; index < previous.length; index += 1) {
    if (!canonicalEquals(previous[index], next[index])) {
      return false;
    }
  }
  return true;
}

/** Guard shared by both implementations (history is append-only). */
function assertHistoryPreserved(previous: ExecutionRecord | null, next: ExecutionRecord): void {
  if (previous !== null && !isEventPrefix(previous.events, next.events)) {
    throw new ExecutionStoreError(
      "execution_history_truncated",
      `execution '${next.executionId}' event journal may only grow`,
    );
  }
}

function sortExecutions(records: ExecutionRecord[]): ExecutionRecord[] {
  return records.sort((a, b) =>
    a.createdAt === b.createdAt
      ? a.executionId.localeCompare(b.executionId)
      : a.createdAt.localeCompare(b.createdAt),
  );
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
    return JSON.parse(await fs.readFile(path, "utf8")) as T;
  } catch (error) {
    if (isNotFound(error)) {
      return null;
    }
    throw error;
  }
}

function parseExecutionRecord(value: unknown, executionId: string): ExecutionRecord {
  if (typeof value !== "object" || value === null || (value as ExecutionRecord).executionId !== executionId) {
    throw new ExecutionStoreError(
      "corrupt_execution_record",
      `stored record does not match execution id '${executionId}'`,
    );
  }
  return value as ExecutionRecord;
}

/* ------------------------------------------------------------------ */
/* In-memory implementation                                            */
/* ------------------------------------------------------------------ */

/** Deterministic in-memory ExecutionStore (tests, embedded scenarios). */
export class InMemoryExecutionStore implements ExecutionStore {
  private readonly records = new Map<string, ExecutionRecord>();
  private readonly byRequestKey = new Map<string, string>();

  async put(record: ExecutionRecord): Promise<void> {
    const claimed = this.byRequestKey.get(record.requestKey);
    if (claimed !== undefined && claimed !== record.executionId) {
      throw new ExecutionStoreError(
        "request_key_collision",
        `request key '${record.requestKey}' is already claimed by execution '${claimed}' — original retained`,
      );
    }
    assertHistoryPreserved(this.records.get(record.executionId) ?? null, record);
    this.records.set(record.executionId, record);
    this.byRequestKey.set(record.requestKey, record.executionId);
  }

  async get(executionId: string): Promise<ExecutionRecord | null> {
    return this.records.get(executionId) ?? null;
  }

  async getByRequestKey(requestKey: string): Promise<ExecutionRecord | null> {
    const executionId = this.byRequestKey.get(requestKey);
    return executionId === undefined ? null : (this.records.get(executionId) ?? null);
  }

  async list(): Promise<ExecutionRecord[]> {
    return sortExecutions([...this.records.values()]);
  }
}

/* ------------------------------------------------------------------ */
/* File-system implementation                                          */
/* ------------------------------------------------------------------ */

/**
 * File-system-backed ExecutionStore rooted at
 * `<dataDir>/reconstruction/gateway/` (created on construction; unwritable
 * roots fail fast, mirroring the other AISE stores). See the module header
 * for the layout.
 */
export class FsExecutionStore implements ExecutionStore {
  private readonly executionsDir: string;
  private readonly byKeyDir: string;

  constructor(dataDir: string) {
    this.executionsDir = join(resolve(dataDir), "reconstruction", "gateway", "executions");
    this.byKeyDir = join(resolve(dataDir), "reconstruction", "gateway", "by-key");
    mkdirSync(this.executionsDir, { recursive: true });
    mkdirSync(this.byKeyDir, { recursive: true });
  }

  /** Absolute path of the execution record file (id is hashed, opaque ids stay inside). */
  executionPath(executionId: string): string {
    return join(this.executionsDir, `${sha256Hex(executionId)}.json`);
  }

  /** Absolute path of the request-key → executionId pointer. */
  byKeyPath(requestKey: string): string {
    return join(this.byKeyDir, `${sha256Hex(requestKey)}.json`);
  }

  async put(record: ExecutionRecord): Promise<void> {
    const path = this.executionPath(record.executionId);
    assertHistoryPreserved(await this.get(record.executionId), record);

    // Request-key claim: one key, one execution (idempotency boundary).
    const keyPath = this.byKeyPath(record.requestKey);
    const existingPointer = await readJsonFile<{ executionId: string }>(keyPath);
    if (existingPointer !== null && existingPointer.executionId !== record.executionId) {
      throw new ExecutionStoreError(
        "request_key_collision",
        `request key '${record.requestKey}' is already claimed by execution '${existingPointer.executionId}' — original retained`,
      );
    }

    // Atomic rewrite: write-temp-then-rename, history preserved above.
    const temp = `${path}.tmp`;
    await fs.mkdir(dirname(path), { recursive: true });
    await fs.writeFile(temp, canonicalJsonStringify(record));
    await fs.rename(temp, path);
    await fs.writeFile(keyPath, canonicalJsonStringify({ executionId: record.executionId, requestKey: record.requestKey }));
  }

  async get(executionId: string): Promise<ExecutionRecord | null> {
    const value = await readJsonFile<ExecutionRecord>(this.executionPath(executionId));
    return value === null ? null : parseExecutionRecord(value, executionId);
  }

  async getByRequestKey(requestKey: string): Promise<ExecutionRecord | null> {
    const pointer = await readJsonFile<{ executionId: string }>(this.byKeyPath(requestKey));
    if (pointer === null) {
      return null;
    }
    return this.get(pointer.executionId);
  }

  async list(): Promise<ExecutionRecord[]> {
    const records: ExecutionRecord[] = [];
    for (const file of readdirSync(this.executionsDir).sort()) {
      if (!file.endsWith(".json")) {
        continue;
      }
      const value = await readJsonFile<ExecutionRecord>(join(this.executionsDir, file));
      if (value !== null && typeof value.executionId === "string") {
        records.push(value);
      }
    }
    return sortExecutions(records);
  }
}
