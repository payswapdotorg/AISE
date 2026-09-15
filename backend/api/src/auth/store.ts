/**
 * PROD-004 — the server-side session store.
 *
 * Contract (mirrors the identity/capture store discipline — the store is
 * PERSISTENCE ONLY, no auth policy):
 *
 *  - One session per file under `<dataDir>/auth/sessions/<sha256(sessionId)>.json`
 *    (the session id is hashed into a filesystem-safe name and stored
 *    verbatim inside the JSON record). Written with the shared canonical
 *    JSON encoder via write-temp-rename — never a half-written record.
 *  - `InMemorySessionStore` is the deterministic twin: it stores the
 *    canonical JSON TEXT and re-parses on read, so both implementations
 *    exhibit byte-identical behavior. Tests prove the twin equality.
 *  - Expiry is a DATA fact (`expiresAt`); the store never interprets it —
 *    `sweepExpiredSessions` is the one explicit, deterministic cleanup
 *    (on-access deletion of the presented session + a boot-time sweep are
 *    the middleware's policies over this store).
 *  - A corrupt session file on disk reads as ABSENT (the session cannot be
 *    served; the caller fails 401 and the corruption is logged) — one bad
 *    file must never take the whole surface down. This mirrors the
 *    capture-store degradation honesty.
 *
 * Single-writer assumption: one auth layer per data dir (same as every
 * other AISE store); concurrent writers are the deployment's duty.
 */

import { mkdirSync, promises as fs } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { canonicalJsonStringify } from "@aise/shared-contracts";
import { sha256Hex } from "../lib/hash";
import type { Logger } from "../lib/log";
import type { SessionRecord } from "./model";

/* ------------------------------------------------------------------ */
/* Store interface                                                      */
/* ------------------------------------------------------------------ */

export interface SessionStore {
  put(session: SessionRecord): Promise<void>;
  get(sessionId: string): Promise<SessionRecord | null>;
  delete(sessionId: string): Promise<void>;
  /** Every stored session, sorted by sessionId (the sweep's input). */
  list(): Promise<SessionRecord[]>;
}

/** What one deterministic sweep did (the honest report). */
export interface SessionSweepReport {
  readonly considered: number;
  readonly removedSessionIds: readonly string[];
}

/* ------------------------------------------------------------------ */
/* Shared helpers                                                       */
/* ------------------------------------------------------------------ */

function isNotFound(error: unknown): boolean {
  return (
    typeof error === "object" && error !== null && (error as { code?: unknown }).code === "ENOENT"
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isIsoString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && !Number.isNaN(Date.parse(value));
}

/** Parse a persisted session record; null for anything not shaped like one. */
export function parseSessionRecord(value: unknown): SessionRecord | null {
  if (!isRecord(value)) {
    return null;
  }
  const sessionId = value["sessionId"];
  const principalId = value["principalId"];
  const kind = value["kind"];
  const createdAt = value["createdAt"];
  const expiresAt = value["expiresAt"];
  if (typeof sessionId !== "string" || sessionId.length < 1 || sessionId.length > 256) {
    return null;
  }
  if (typeof principalId !== "string" || principalId.length < 1 || principalId.length > 256) {
    return null;
  }
  if (kind !== "user" && kind !== "demo") {
    return null;
  }
  if (!isIsoString(createdAt) || !isIsoString(expiresAt)) {
    return null;
  }
  return { sessionId, principalId, kind, createdAt, expiresAt };
}

async function writeJsonAtomic(path: string, value: unknown): Promise<void> {
  await fs.mkdir(dirname(path), { recursive: true });
  const tmp = `${path}.tmp`;
  await fs.writeFile(tmp, canonicalJsonStringify(value));
  await fs.rename(tmp, path);
}

/* ------------------------------------------------------------------ */
/* File-system store                                                    */
/* ------------------------------------------------------------------ */

export class FsSessionStore implements SessionStore {
  private readonly root: string;
  private readonly logger?: Logger;

  constructor(dataDir: string, logger?: Logger) {
    this.root = resolve(join(dataDir, "auth", "sessions"));
    mkdirSync(this.root, { recursive: true });
    this.logger = logger;
  }

  private pathOf(sessionId: string): string {
    return join(this.root, `${sha256Hex(sessionId)}.json`);
  }

  async put(session: SessionRecord): Promise<void> {
    await writeJsonAtomic(this.pathOf(session.sessionId), session);
  }

  async get(sessionId: string): Promise<SessionRecord | null> {
    let text: string | null;
    try {
      text = await fs.readFile(this.pathOf(sessionId), "utf8");
    } catch (error) {
      if (isNotFound(error)) {
        return null;
      }
      throw error;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(text) as unknown;
    } catch {
      this.logger?.warn("corrupt session file ignored (reads as absent)", {
        sessionId: sessionId.slice(0, 8),
      });
      return null;
    }
    const record = parseSessionRecord(parsed);
    if (record === null) {
      this.logger?.warn("invalid session record ignored (reads as absent)", {
        sessionId: sessionId.slice(0, 8),
      });
      return null;
    }
    return record;
  }

  async delete(sessionId: string): Promise<void> {
    try {
      await fs.unlink(this.pathOf(sessionId));
    } catch (error) {
      if (!isNotFound(error)) {
        throw error;
      }
    }
  }

  async list(): Promise<SessionRecord[]> {
    let entries: string[];
    try {
      entries = await fs.readdir(this.root);
    } catch (error) {
      if (isNotFound(error)) {
        return [];
      }
      throw error;
    }
    const sessions: SessionRecord[] = [];
    for (const entry of entries.sort()) {
      if (!entry.endsWith(".json")) {
        continue;
      }
      let text: string;
      try {
        text = await fs.readFile(join(this.root, entry), "utf8");
      } catch (error) {
        if (isNotFound(error)) {
          continue;
        }
        throw error;
      }
      try {
        const record = parseSessionRecord(JSON.parse(text) as unknown);
        if (record !== null) {
          sessions.push(record);
        }
      } catch {
        // Corrupt file: skipped by list (get() logs it when addressed).
      }
    }
    return sessions.sort((a, b) => a.sessionId.localeCompare(b.sessionId));
  }
}

/* ------------------------------------------------------------------ */
/* In-memory twin                                                       */
/* ------------------------------------------------------------------ */

export class InMemorySessionStore implements SessionStore {
  private readonly files = new Map<string, string>();

  private pathOf(sessionId: string): string {
    return `${sha256Hex(sessionId)}.json`;
  }

  async put(session: SessionRecord): Promise<void> {
    this.files.set(this.pathOf(session.sessionId), canonicalJsonStringify(session));
  }

  async get(sessionId: string): Promise<SessionRecord | null> {
    const text = this.files.get(this.pathOf(sessionId));
    if (text === undefined) {
      return null;
    }
    try {
      return parseSessionRecord(JSON.parse(text) as unknown);
    } catch {
      return null;
    }
  }

  async delete(sessionId: string): Promise<void> {
    this.files.delete(this.pathOf(sessionId));
  }

  async list(): Promise<SessionRecord[]> {
    const sessions: SessionRecord[] = [];
    for (const text of this.files.values()) {
      try {
        const record = parseSessionRecord(JSON.parse(text) as unknown);
        if (record !== null) {
          sessions.push(record);
        }
      } catch {
        // Corrupt entry: skipped, mirroring the Fs twin.
      }
    }
    return sessions.sort((a, b) => a.sessionId.localeCompare(b.sessionId));
  }
}

/* ------------------------------------------------------------------ */
/* Deterministic expiry sweep                                           */
/* ------------------------------------------------------------------ */

/**
 * Remove every session whose `expiresAt` is strictly before `now`.
 * Deterministic: a pure pass over `list()` in id order; the report lists
 * every removed id (removal is never silent).
 */
export async function sweepExpiredSessions(
  store: SessionStore,
  now: string,
): Promise<SessionSweepReport> {
  const nowMs = Date.parse(now);
  const sessions = await store.list();
  const removedSessionIds: string[] = [];
  for (const session of sessions) {
    if (Date.parse(session.expiresAt) < nowMs) {
      await store.delete(session.sessionId);
      removedSessionIds.push(session.sessionId);
    }
  }
  return { considered: sessions.length, removedSessionIds };
}
