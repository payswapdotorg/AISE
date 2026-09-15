/**
 * In-memory fake PgExecutor for the offline tests (PROD-005).
 *
 * TEST SUPPORT ONLY — never imported by production paths (the index barrel
 * deliberately does not re-export it). It implements the SEMANTICS of every
 * SQL statement the pg family emits, dispatched by EXACT statement text (the
 * builders in `sql.ts` are pure functions of compile-time identifiers, so
 * exact matching is both possible and load-bearing: a new statement shape
 * fails LOUDLY here until the fake is taught it). DDL from migration files
 * is recognized by its `CREATE TABLE IF NOT EXISTS <name> (…)` shape and
 * registers an empty table — enough for every runner assertion.
 *
 * Semantics faithfully mirrored:
 *   - record tables: insert-if-absent (ON CONFLICT DO NOTHING + RETURNING),
 *     upsert (DO UPDATE), select by record_key, list;
 *   - blob record tables: same + a `bytes` column;
 *   - composite-key tables: mission_revisions (mission_id, revision) and
 *     capture_batches (session_id, sequence);
 *   - append-only journals: BIGSERIAL insertion order, list ORDER BY id;
 *   - schema_migrations bookkeeping (its DDL bootstrap is itself a
 *     recognized CREATE TABLE);
 *   - seed markers (a record table);
 *   - `pg_advisory_xact_lock` and `SET LOCAL …` (both no-ops — recorded in
 *     `log` for assertions);
 *   - TRANSACTIONS: real BEGIN/COMMIT/ROLLBACK semantics via copy-on-write
 *     snapshots, so the migration-transactionality tests observe genuine
 *     rollback (a failing multi-statement file leaves NO partial state and
 *     NO bookkeeping row).
 *
 * It also VALIDATES the jsonb discipline: every `$n::jsonb` parameter must
 * parse as JSON (the real server would reject invalid jsonb input).
 */

import type { PgExecutor, PgRow } from "./executor";
import {
  PG_TABLES,
  SCHEMA_MIGRATIONS_DDL,
  advisoryXactLockSql,
  insertAppliedMigrationSql,
  insertBlobRecordIfAbsentSql,
  insertJournalSql,
  insertMissionRevisionIfAbsentSql,
  insertNormalizationViewIfAbsentSql,
  insertRecordIfAbsentSql,
  listJournalSql,
  listMissionRevisionsSql,
  listRecordsSql,
  selectAppliedMigrationsSql,
  selectBlobRecordSql,
  selectCaptureBatchSql,
  selectMissionRevisionSql,
  selectMissionRevisionsSql,
  selectNormalizationViewSql,
  selectRecordSql,
  selectSeedMarkerSql,
  upsertCaptureBatchSql,
  upsertRecordSql,
} from "./sql";

/** One stored row of the fake catalog. */
interface FakeRow {
  readonly columns: Readonly<Record<string, unknown>>;
}

/** Snapshot-able fake database state. */
interface FakeState {
  /** tableName → rows (insertion order preserved). */
  readonly tables: Map<string, FakeRow[]>;
  /** Journal tables' next BIGSERIAL id. */
  readonly journalIds: Map<string, number>;
}

function snapshot(state: FakeState): FakeState {
  const tables = new Map<string, FakeRow[]>();
  for (const [name, rows] of state.tables) {
    tables.set(name, rows.map((row) => ({ columns: { ...row.columns } })));
  }
  return { tables, journalIds: new Map(state.journalIds) };
}

function emptyState(): FakeState {
  return { tables: new Map(), journalIds: new Map() };
}

/** Statement log entry (for ordering/transactionality assertions). */
export interface LoggedStatement {
  readonly sql: string;
  readonly params: readonly unknown[];
  /** True when executed inside an open transaction scope (BEGIN…COMMIT). */
  readonly inTransaction: boolean;
}

export class FakePgExecutor implements PgExecutor {
  private state: FakeState = emptyState();
  private depth = 0;
  private snapshots: FakeState[] = [];
  private committedDepth = 0;
  /** Every executed statement, in order (post-commit view). */
  public readonly log: LoggedStatement[] = [];

  /** The table names that exist right now (migration assertions). */
  tableNames(): string[] {
    return [...this.state.tables.keys()].sort();
  }

  /** All surviving rows of one table (test assertions). */
  rowsOf(table: string): Readonly<Record<string, unknown>>[] {
    return (this.state.tables.get(table) ?? []).map((row) => ({ ...row.columns }));
  }

  private table(name: string): FakeRow[] {
    const existing = this.state.tables.get(name);
    if (existing === undefined) {
      throw new Error(`fake pg: relation "${name}" does not exist`);
    }
    return existing;
  }

  async execute<T extends PgRow = PgRow>(
    sqlText: string,
    params: readonly unknown[] = [],
  ): Promise<T[]> {
    const rows = this.dispatch(sqlText, params);
    this.log.push({ sql: sqlText, params, inTransaction: this.depth > 0 });
    return rows.map((row) => ({ ...(row.columns as T) }));
  }

  async transaction<T>(fn: (tx: PgExecutor) => Promise<T>): Promise<T> {
    if (this.depth > 0) {
      // JOIN semantics (mirrors postgresExecutor): no nested BEGIN.
      return fn(this);
    }
    this.snapshots.push(snapshot(this.state));
    this.depth = 1;
    try {
      const result = await fn(this);
      // COMMIT: drop the snapshot, remember the commit level.
      this.snapshots.pop();
      this.committedDepth = this.depth;
      this.depth = 0;
      return result;
    } catch (error) {
      // ROLLBACK: restore the pre-transaction state wholesale.
      const restore = this.snapshots.pop() ?? emptyState();
      this.state = restore;
      this.depth = 0;
      throw error;
    }
  }

  /** True when at least one transaction has committed (introspection). */
  hasCommitted(): boolean {
    return this.committedDepth > 0;
  }

  /* ---------------------------------------------------------------- */
  /* Statement dispatch                                                 */
  /* ---------------------------------------------------------------- */

  private dispatch(sqlText: string, params: readonly unknown[]): FakeRow[] {
    const canonical = sqlText.trim();

    if (canonical === SCHEMA_MIGRATIONS_DDL) {
      this.state.tables.set(PG_TABLES.schemaMigrations, this.state.tables.get(PG_TABLES.schemaMigrations) ?? []);
      return [];
    }

    if (canonical === advisoryXactLockSql()) {
      return []; // lock acquired trivially in a single fake
    }

    if (canonical.startsWith("SET LOCAL statement_timeout")) {
      if (!/^SET LOCAL statement_timeout = '\d+ms'$/.test(canonical)) {
        throw new Error(`fake pg: unrecognized statement: ${canonical}`);
      }
      return [];
    }

    if (canonical === selectAppliedMigrationsSql()) {
      return this.table(PG_TABLES.schemaMigrations)
        .map((row) => ({ columns: { ...row.columns } }))
        .sort((a, b) => Number(a.columns["version"]) - Number(b.columns["version"]));
    }

    if (canonical === insertAppliedMigrationSql()) {
      const [version, name, checksum] = params as [number, string, string];
      this.table(PG_TABLES.schemaMigrations).push({
        columns: { version, name, checksum },
      });
      return [];
    }

    // CREATE TABLE IF NOT EXISTS <name> (…) — migration DDL.
    const create = /^CREATE TABLE IF NOT EXISTS ([a-z_]+) \(.+\)$/.exec(canonical);
    if (create !== null) {
      const name = create[1]!;
      if (!this.state.tables.has(name)) {
        this.state.tables.set(name, []);
      }
      return [];
    }

    // Record-table statements, per table.
    for (const table of RECORD_TABLES) {
      if (canonical === selectRecordSql(table)) {
        const [key] = params as [string];
        const found = this.table(table).find((row) => row.columns["record_key"] === key);
        return found === undefined ? [] : [{ columns: { canonical: found.columns["canonical"] } }];
      }
      if (canonical === insertRecordIfAbsentSql(table)) {
        const [key, payload, canonicalText] = params as [string, string, string];
        const rows = this.table(table);
        if (rows.some((row) => row.columns["record_key"] === key)) {
          return []; // ON CONFLICT DO NOTHING: no row returned
        }
        rows.push({
          columns: { record_key: key, payload: parseJsonb(payload), canonical: canonicalText },
        });
        return [{ columns: { canonical: canonicalText } }];
      }
      if (canonical === upsertRecordSql(table)) {
        const [key, payload, canonicalText] = params as [string, string, string];
        const rows = this.table(table);
        const index = rows.findIndex((row) => row.columns["record_key"] === key);
        const columns = { record_key: key, payload: parseJsonb(payload), canonical: canonicalText };
        if (index === -1) {
          rows.push({ columns });
        } else {
          rows[index] = { columns };
        }
        return [];
      }
      if (canonical === listRecordsSql(table)) {
        return this.table(table).map((row) => ({
          columns: { canonical: row.columns["canonical"] },
        }));
      }
      if (canonical === selectBlobRecordSql(table)) {
        const [key] = params as [string];
        const found = this.table(table).find((row) => row.columns["record_key"] === key);
        return found === undefined
          ? []
          : [{ columns: { canonical: found.columns["canonical"], bytes: found.columns["bytes"] } }];
      }
      if (canonical === insertBlobRecordIfAbsentSql(table)) {
        const [key, payload, canonicalText, bytes] = params as [string, string, string, Uint8Array];
        const rows = this.table(table);
        if (rows.some((row) => row.columns["record_key"] === key)) {
          return [];
        }
        rows.push({
          columns: {
            record_key: key,
            payload: parseJsonb(payload),
            canonical: canonicalText,
            bytes: new Uint8Array(bytes),
          },
        });
        return [{ columns: { canonical: canonicalText } }];
      }
    }

    // Normalization view statements (boq_normalizations).
    if (canonical === selectNormalizationViewSql()) {
      const [key] = params as [string];
      const found = this.table(PG_TABLES.boqNormalizations).find(
        (row) => row.columns["record_key"] === key,
      );
      return found === undefined ? [] : [{ columns: { canonical: found.columns["canonical"] } }];
    }
    if (canonical === insertNormalizationViewIfAbsentSql()) {
      const [key, payload, canonicalText] = params as [string, string, string];
      const rows = this.table(PG_TABLES.boqNormalizations);
      if (rows.some((row) => row.columns["record_key"] === key)) {
        return [];
      }
      rows.push({ columns: { record_key: key, payload: parseJsonb(payload), canonical: canonicalText } });
      return [{ columns: { canonical: canonicalText } }];
    }

    // Mission revisions (composite key).
    if (canonical === selectMissionRevisionsSql()) {
      const [missionId] = params as [string];
      return this.table(PG_TABLES.missionRevisions)
        .filter((row) => row.columns["mission_id"] === missionId)
        .sort((a, b) => Number(a.columns["revision"]) - Number(b.columns["revision"]))
        .map((row) => ({
          columns: { revision: row.columns["revision"], canonical: row.columns["canonical"] },
        }));
    }
    if (canonical === selectMissionRevisionSql()) {
      const [missionId, revision] = params as [string, number];
      const found = this.table(PG_TABLES.missionRevisions).find(
        (row) => row.columns["mission_id"] === missionId && row.columns["revision"] === revision,
      );
      return found === undefined ? [] : [{ columns: { canonical: found.columns["canonical"] } }];
    }
    if (canonical === insertMissionRevisionIfAbsentSql()) {
      const [missionId, revision, payload, canonicalText] = params as [string, number, string, string];
      const rows = this.table(PG_TABLES.missionRevisions);
      if (
        rows.some(
          (row) => row.columns["mission_id"] === missionId && row.columns["revision"] === revision,
        )
      ) {
        return [];
      }
      rows.push({
        columns: { mission_id: missionId, revision, payload: parseJsonb(payload), canonical: canonicalText },
      });
      return [{ columns: { canonical: canonicalText } }];
    }
    if (canonical === listMissionRevisionsSql()) {
      return this.table(PG_TABLES.missionRevisions).map((row) => ({
        columns: {
          mission_id: row.columns["mission_id"],
          revision: row.columns["revision"],
          canonical: row.columns["canonical"],
        },
      }));
    }

    // Capture batches (composite key, upsert).
    if (canonical === selectCaptureBatchSql()) {
      const [sessionId, sequence] = params as [string, number];
      const found = this.table(PG_TABLES.captureBatches).find(
        (row) => row.columns["session_id"] === sessionId && row.columns["sequence"] === sequence,
      );
      return found === undefined ? [] : [{ columns: { canonical: found.columns["canonical"] } }];
    }
    if (canonical === upsertCaptureBatchSql()) {
      const [sessionId, sequence, batchId, payload, canonicalText] = params as [
        string,
        number,
        string,
        string,
        string,
      ];
      const rows = this.table(PG_TABLES.captureBatches);
      const index = rows.findIndex(
        (row) => row.columns["session_id"] === sessionId && row.columns["sequence"] === sequence,
      );
      const columns = {
        session_id: sessionId,
        sequence,
        batch_id: batchId,
        payload: parseJsonb(payload),
        canonical: canonicalText,
      };
      if (index === -1) {
        rows.push({ columns });
      } else {
        rows[index] = { columns };
      }
      return [];
    }

    // Journals (global insertion sequence).
    for (const table of JOURNAL_TABLES) {
      if (canonical === insertJournalSql(table)) {
        const [journalKey, payload, canonicalText] = params as [string, string, string];
        const nextId = (this.state.journalIds.get(table) ?? 0) + 1;
        this.state.journalIds.set(table, nextId);
        this.table(table).push({
          columns: { id: nextId, journal_key: journalKey, payload: parseJsonb(payload), canonical: canonicalText },
        });
        return [{ columns: { id: nextId } }];
      }
      if (canonical === listJournalSql(table)) {
        return this.table(table)
          .slice()
          .sort((a, b) => Number(a.columns["id"]) - Number(b.columns["id"]))
          .map((row) => ({ columns: { canonical: row.columns["canonical"] } }));
      }
    }

    // Seed markers: insert is the shared insert-if-absent record statement
    // (matched by the RECORD_TABLES loop above — seed_markers is in it);
    // the dedicated SELECT is matched here.
    if (canonical === selectSeedMarkerSql()) {
      const [key] = params as [string];
      const found = this.table(PG_TABLES.seedMarkers).find(
        (row) => row.columns["record_key"] === key,
      );
      return found === undefined ? [] : [{ columns: { canonical: found.columns["canonical"] } }];
    }

    throw new Error(`fake pg: unrecognized statement: ${canonical}`);
  }
}

const RECORD_TABLES: readonly string[] = [
  PG_TABLES.seedMarkers,
  PG_TABLES.boqSources,
  PG_TABLES.boqDocuments,
  PG_TABLES.captureAssets,
  PG_TABLES.captureSessions,
  PG_TABLES.captureIdempotency,
  PG_TABLES.evidenceRecords,
  PG_TABLES.evidenceInvalidations,
  PG_TABLES.caseRecords,
  PG_TABLES.gapAnalysisRecords,
] as const;

const JOURNAL_TABLES: readonly string[] = [
  PG_TABLES.evidenceLinks,
  PG_TABLES.evidenceDerivations,
] as const;

/** The jsonb discipline: `$n::jsonb` parameters must be valid JSON. */
function parseJsonb(payload: unknown): unknown {
  if (typeof payload !== "string") {
    throw new Error("fake pg: jsonb parameter must be a JSON string");
  }
  return JSON.parse(payload);
}

/** Fresh fake executor (the offline test entry point). */
export function fakePgExecutor(): FakePgExecutor {
  return new FakePgExecutor();
}
