/**
 * SQL text builders for the Postgres persistence family (PROD-005).
 *
 * PURE module: every function returns a string; nothing here touches a
 * client. All statement text is FIXED at build time from compile-time table
 * identifiers — user data never reaches the text, only the positional $n
 * parameters — so the offline tests can assert the exact SQL the family
 * emits, and the in-memory fake executor (`testing.ts`) can recognize its
 * own statements by exact match.
 *
 * THE GENERIC JSONB PATTERN: every domain record is stored as one row
 *
 *   (record_key TEXT PRIMARY KEY, payload JSONB NOT NULL, canonical TEXT NOT NULL, …)
 *
 * where `payload` is the canonical document as a queryable jsonb value and
 * `canonical` is the BYTE-EXACT canonical JSON text (the shared
 * `canonicalJsonStringify` serialization the Fs stores write to disk).
 * Reads return `canonical` verbatim, so an Fs record and a Pg row of the
 * same domain record are byte-identical after a round-trip — the jsonb
 * column's own normalization (key order, numeric scale) can never leak into
 * domain bytes. Composite-key tables (mission revisions, capture batches)
 * and append-only journal tables (evidence links/derivations) follow the
 * same pattern with their natural keys.
 */

/* ------------------------------------------------------------------ */
/* Table registry                                                       */
/* ------------------------------------------------------------------ */

/**
 * The v001 schema's table names (single source of truth shared by the SQL
 * builders here, the migration file and the fake executor's catalog).
 */
export const PG_TABLES = {
  schemaMigrations: "schema_migrations",
  seedMarkers: "seed_markers",
  boqSources: "boq_sources",
  boqDocuments: "boq_documents",
  boqNormalizations: "boq_normalizations",
  captureAssets: "capture_assets",
  captureSessions: "capture_sessions",
  captureBatches: "capture_batches",
  captureIdempotency: "capture_idempotency",
  missionRevisions: "mission_revisions",
  evidenceRecords: "evidence_records",
  evidenceInvalidations: "evidence_invalidations",
  evidenceLinks: "evidence_links",
  evidenceDerivations: "evidence_derivations",
  caseRecords: "case_records",
  gapAnalysisRecords: "gap_analysis_records",
} as const;

/** Deterministic advisory-lock key for the migration runner (arbitrary constant). */
export const MIGRATION_ADVISORY_LOCK_KEY = 735805;

/** The bookkeeping DDL, shared by v001 and the runner's bootstrap step. */
export const SCHEMA_MIGRATIONS_DDL =
  "CREATE TABLE IF NOT EXISTS schema_migrations (" +
  "version INTEGER PRIMARY KEY, " +
  "name TEXT NOT NULL, " +
  "checksum TEXT NOT NULL, " +
  "applied_at TIMESTAMPTZ NOT NULL DEFAULT now()" +
  ")";

/* ------------------------------------------------------------------ */
/* Record tables (single TEXT key + jsonb payload + canonical text)     */
/* ------------------------------------------------------------------ */

export function selectRecordSql(table: string): string {
  return `SELECT canonical FROM ${table} WHERE record_key = $1`;
}

export function insertRecordIfAbsentSql(table: string): string {
  return (
    `INSERT INTO ${table} (record_key, payload, canonical) VALUES ($1, $2::jsonb, $3) ` +
    "ON CONFLICT (record_key) DO NOTHING RETURNING canonical"
  );
}

export function upsertRecordSql(table: string): string {
  return (
    `INSERT INTO ${table} (record_key, payload, canonical) VALUES ($1, $2::jsonb, $3) ` +
    "ON CONFLICT (record_key) DO UPDATE SET payload = EXCLUDED.payload, canonical = EXCLUDED.canonical"
  );
}

export function listRecordsSql(table: string): string {
  return `SELECT canonical FROM ${table}`;
}

/*
 * boq_normalizations follows the same record pattern keyed by the
 * content-addressed derived-view key sha256(importId + dictionaryVersion)
 * (the exact key the Fs twin computes — `normalizationViewKey`).
 */
export function selectNormalizationViewSql(): string {
  return selectRecordSql(PG_TABLES.boqNormalizations);
}

export function insertNormalizationViewIfAbsentSql(): string {
  return insertRecordIfAbsentSql(PG_TABLES.boqNormalizations);
}

/** Record table carrying an immutable bytea blob (boq sources, capture assets). */
export function selectBlobRecordSql(table: string): string {
  return `SELECT canonical, bytes FROM ${table} WHERE record_key = $1`;
}

export function insertBlobRecordIfAbsentSql(table: string): string {
  return (
    `INSERT INTO ${table} (record_key, payload, canonical, bytes) VALUES ($1, $2::jsonb, $3, $4) ` +
    "ON CONFLICT (record_key) DO NOTHING RETURNING canonical"
  );
}

/* ------------------------------------------------------------------ */
/* Composite-key tables                                                 */
/* ------------------------------------------------------------------ */

/** mission_revisions: (mission_id, revision) → canonical CaptureMission. */
export function selectMissionRevisionsSql(): string {
  return "SELECT revision, canonical FROM mission_revisions WHERE mission_id = $1 ORDER BY revision ASC";
}

export function selectMissionRevisionSql(): string {
  return "SELECT canonical FROM mission_revisions WHERE mission_id = $1 AND revision = $2";
}

export function insertMissionRevisionIfAbsentSql(): string {
  return (
    "INSERT INTO mission_revisions (mission_id, revision, payload, canonical) " +
    "VALUES ($1, $2, $3::jsonb, $4) ON CONFLICT (mission_id, revision) DO NOTHING RETURNING canonical"
  );
}

export function listMissionRevisionsSql(): string {
  return "SELECT mission_id, revision, canonical FROM mission_revisions";
}

/** capture_batches: (session_id, sequence) → canonical StoredBatchRecord. */
export function selectCaptureBatchSql(): string {
  return "SELECT canonical FROM capture_batches WHERE session_id = $1 AND sequence = $2";
}

export function upsertCaptureBatchSql(): string {
  return (
    "INSERT INTO capture_batches (session_id, sequence, batch_id, payload, canonical) " +
    "VALUES ($1, $2, $3, $4::jsonb, $5) ON CONFLICT (session_id, sequence) DO UPDATE SET " +
    "batch_id = EXCLUDED.batch_id, payload = EXCLUDED.payload, canonical = EXCLUDED.canonical"
  );
}

/* ------------------------------------------------------------------ */
/* Append-only journal tables (global insertion sequence)               */
/* ------------------------------------------------------------------ */

export function insertJournalSql(table: string): string {
  return `INSERT INTO ${table} (journal_key, payload, canonical) VALUES ($1, $2::jsonb, $3) RETURNING id`;
}

export function listJournalSql(table: string): string {
  return `SELECT canonical FROM ${table} ORDER BY id ASC`;
}

/* ------------------------------------------------------------------ */
/* Migration bookkeeping                                                */
/* ------------------------------------------------------------------ */

export function selectAppliedMigrationsSql(): string {
  return "SELECT version, name, checksum FROM schema_migrations ORDER BY version ASC";
}

export function insertAppliedMigrationSql(): string {
  return "INSERT INTO schema_migrations (version, name, checksum) VALUES ($1, $2, $3)";
}

export function advisoryXactLockSql(): string {
  return `SELECT pg_advisory_xact_lock(${MIGRATION_ADVISORY_LOCK_KEY})`;
}

/** `SET LOCAL` statement timeout asserted inside every migration transaction. */
export const STATEMENT_TIMEOUT_REASSERT_MS = 15000;

export function setLocalStatementTimeoutSql(timeoutMs: number): string {
  return `SET LOCAL statement_timeout = '${timeoutMs}ms'`;
}

/* ------------------------------------------------------------------ */
/* Seed bookkeeping                                                     */
/* ------------------------------------------------------------------ */

export function selectSeedMarkerSql(): string {
  return "SELECT canonical FROM seed_markers WHERE record_key = $1";
}

export function insertSeedMarkerIfAbsentSql(): string {
  return (
    "INSERT INTO seed_markers (record_key, payload, canonical) VALUES ($1, $2::jsonb, $3) " +
    "ON CONFLICT (record_key) DO NOTHING RETURNING canonical"
  );
}

/* ------------------------------------------------------------------ */
/* Statement splitting (migration files)                                */
/* ------------------------------------------------------------------ */

/**
 * Split one migration file's SQL into individual statements.
 *
 * The migration format is deliberately constrained (enforced here):
 *   - statements are separated by `;` at end of line or end of file;
 *   - full-line `--` comments are stripped (never inline trailing comments,
 *     so a `;` inside a comment can never confuse the splitter);
 *   - dollar-quoted bodies (`$$ … $$`) are REFUSED with a typed error —
 *     v001-style plain DDL needs none, and the deterministic split must
 *     stay trivially auditable.
 */
export function splitSqlStatements(sqlText: string): string[] {
  if (sqlText.includes("$$")) {
    throw new Error(
      "pg: migration files must not use dollar quoting (deterministic statement splitting)",
    );
  }
  const lines = sqlText
    .split("\n")
    .filter((line) => !line.trimStart().startsWith("--"))
    .join("\n");
  const statements: string[] = [];
  for (const raw of lines.split(";")) {
    const statement = raw.trim();
    if (statement !== "") {
      statements.push(statement);
    }
  }
  return statements;
}
