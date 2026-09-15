/**
 * Shared record-table plumbing for the Pg store twins (PROD-005, internal).
 *
 * Every namespace table follows the generic JSONB pattern (see sql.ts):
 * one row per domain record, `record_key` = the domain id, `payload` =
 * the canonical document as jsonb (queryable mirror), `canonical` = the
 * BYTE-EXACT canonical JSON text — and every read returns `canonical`
 * verbatim, so an Fs record and a Pg row of the same domain record are
 * byte-identical after a round-trip (jsonb's own normalization can never
 * leak into domain bytes).
 *
 * The helpers here are deliberately ANEMIC: no domain knowledge, no
 * policy — the write-once / put-if-absent / upsert disciplines are the
 * STORE interfaces' contracts and are implemented (and unit-tested) in
 * each twin.
 */

import type { PgExecutor } from "../executor";
import {
  insertBlobRecordIfAbsentSql,
  insertRecordIfAbsentSql,
  listRecordsSql,
  selectBlobRecordSql,
  selectRecordSql,
  upsertRecordSql,
} from "../sql";

/** A record-table accessor bound to one physical table. */
export class RecordTable {
  constructor(
    private readonly executor: PgExecutor,
    private readonly table: string,
  ) {}

  /** The stored canonical text for one key, or null when absent. */
  async selectCanonical(key: string): Promise<string | null> {
    const rows = await this.executor.execute<{ canonical: string }>(selectRecordSql(this.table), [
      key,
    ]);
    const row = rows[0];
    return row === undefined ? null : row.canonical;
  }

  /**
   * Insert one record if the key is absent. Returns the WINNING canonical
   * text plus whether THIS call wrote it (false = an existing row won the
   * race — the caller compares and decides).
   */
  async insertIfAbsent(
    key: string,
    canonical: string,
  ): Promise<{ readonly canonical: string; readonly wrote: boolean }> {
    const rows = await this.executor.execute<{ canonical: string }>(
      insertRecordIfAbsentSql(this.table),
      [key, canonical, canonical],
    );
    const row = rows[0];
    if (row !== undefined) {
      return { canonical: row.canonical, wrote: true };
    }
    const existing = await this.selectCanonical(key);
    if (existing === null) {
      throw new Error(`pg: insert-if-absent lost row for '${this.table}' key (read-back null)`);
    }
    return { canonical: existing, wrote: false };
  }

  /** Upsert one record (whole-record rewrite semantics, e.g. case/gap puts). */
  async upsert(key: string, canonical: string): Promise<void> {
    await this.executor.execute(upsertRecordSql(this.table), [key, canonical, canonical]);
  }

  /** Every stored canonical text (insertion order; callers sort domain-side). */
  async listCanonical(): Promise<string[]> {
    const rows = await this.executor.execute<{ canonical: string }>(listRecordsSql(this.table));
    return rows.map((row) => row.canonical);
  }

  /** The canonical text + immutable bytes for one key, or null. */
  async selectBlob(
    key: string,
  ): Promise<{ readonly canonical: string; readonly bytes: Uint8Array } | null> {
    const rows = await this.executor.execute<{ canonical: string; bytes: Uint8Array }>(
      selectBlobRecordSql(this.table),
      [key],
    );
    const row = rows[0];
    return row === undefined ? null : { canonical: row.canonical, bytes: row.bytes };
  }

  /** Insert a blob record if absent (same contract as `insertIfAbsent`). */
  async insertBlobIfAbsent(
    key: string,
    canonical: string,
    bytes: Uint8Array,
  ): Promise<{ readonly canonical: string; readonly wrote: boolean }> {
    const rows = await this.executor.execute<{ canonical: string }>(
      insertBlobRecordIfAbsentSql(this.table),
      [key, canonical, canonical, bytes],
    );
    const row = rows[0];
    if (row !== undefined) {
      return { canonical: row.canonical, wrote: true };
    }
    const existing = await this.selectBlob(key);
    if (existing === null) {
      throw new Error(`pg: insert-if-absent lost row for '${this.table}' key (read-back null)`);
    }
    return { canonical: existing.canonical, wrote: false };
  }
}

/** Parse stored canonical text as JSON (typed error on garbage — no silent misparse). */
export function parseCanonicalJson(text: string, context: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`pg: stored ${context} is not valid JSON (corrupt row — refusing to misparse)`);
  }
}
