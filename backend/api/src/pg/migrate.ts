/**
 * The deterministic migration runner (PROD-005).
 *
 * Migrations are ORDERED, VERSIONED SQL files under `./migrations/`,
 * statically imported as text (Bun `with { type: "text" }` — the files are
 * the single source of truth on disk AND bundle-safe for serverless, no
 * runtime fs read a bundler could drop). The runner:
 *
 *   1. BOOTSTRAPS the bookkeeping table (`schema_migrations`,
 *      `CREATE TABLE IF NOT EXISTS` — safe on any database state);
 *   2. takes the DETERMINISTIC advisory transaction lock
 *      (`pg_advisory_xact_lock`) so two concurrent deploys serialize
 *      instead of racing;
 *   3. reads the applied set and VERIFIES every applied migration's
 *      checksum against the file it would apply today — a migration file
 *      edited after being applied is a hard error naming the version
 *      (history is append-only; the fix is a NEW migration);
 *   4. applies the pending migrations IN VERSION ORDER, each inside ONE
 *      transaction together with its bookkeeping row: a failure rolls the
 *      whole file back (no partial state, no phantom bookkeeping row) and
 *      the runner aborts at that version;
 *   5. is IDEMPOTENT: a database with everything applied applies nothing
 *      and reports `alreadyApplied` — redeploys are free (they only add
 *      compute, never erase or rewrite durable state — that is the whole
 *      point of PROD-005).
 *
 * BOUNDED: at most `MAX_MIGRATIONS_PER_RUN` files are applied in one run
 * (the static registry is far below the cap; the guard makes the bound
 * explicit and future-proof) and every applied file re-asserts the
 * statement timeout with `SET LOCAL` inside its transaction, so a wedged
 * migration cannot hold a connection forever.
 *
 * NO DESTRUCTIVE DDL ever runs here: the shipped files are additive
 * (`CREATE TABLE IF NOT EXISTS` only); rollbacks, if ever written, live in
 * explicitly named rollback files that NOTHING in the runtime calls.
 *
 * The runner talks to Postgres ONLY through the injected `PgExecutor`, so
 * the offline tests drive it against the in-memory fake (`testing.ts`)
 * with the REAL v001 file — ordering/idempotency/transactionality are
 * proven without any database.
 */

import { sha256Hex } from "../lib/hash";
import type { PgExecutor } from "./executor";
import {
  SCHEMA_MIGRATIONS_DDL,
  advisoryXactLockSql,
  insertAppliedMigrationSql,
  selectAppliedMigrationsSql,
  setLocalStatementTimeoutSql,
  splitSqlStatements,
  STATEMENT_TIMEOUT_REASSERT_MS,
} from "./sql";
import v001 from "./migrations/v001__initial_schema.sql" with { type: "text" };

/** One versioned migration file. */
export interface MigrationFile {
  /** Integer version — ordering key; must be unique and gapless-ish (ascending). */
  readonly version: number;
  /** Stable file name (without path), recorded in the bookkeeping table. */
  readonly name: string;
  /** Verbatim SQL text of the file. */
  readonly sql: string;
}

/** The ordered registry — the single source of migration truth. */
export const MIGRATIONS: readonly MigrationFile[] = [
  { version: 1, name: "v001__initial_schema.sql", sql: v001 },
] as const;

/** Upper bound on files applied in one run (see module header). */
export const MAX_MIGRATIONS_PER_RUN = 64;

/** Applied-migration bookkeeping row as read back from the table. */
export interface AppliedMigration {
  readonly version: number;
  readonly name: string;
  readonly checksum: string;
}

/** Deterministic outcome report (evidence for transcripts and tests). */
export interface MigrationOutcome {
  /** Versions applied by THIS run, in order (empty when idempotent no-op). */
  readonly applied: readonly number[];
  /** Versions already applied before this run (verified, not re-run). */
  readonly alreadyApplied: readonly number[];
}

/**
 * Verify the registry itself: versions strictly ascending and unique. Pure;
 * also asserted by tests so a future file cannot silently break ordering.
 */
export function verifyRegistry(files: readonly MigrationFile[]): string[] {
  const issues: string[] = [];
  for (let index = 0; index < files.length; index += 1) {
    const file = files[index]!;
    if (!Number.isInteger(file.version) || file.version < 1) {
      issues.push(`migration '${file.name}': version must be a positive integer`);
    }
    const previous = index === 0 ? undefined : files[index - 1];
    if (previous !== undefined && file.version <= previous.version) {
      issues.push(
        `migration '${file.name}': version ${file.version} does not strictly follow ${previous.version}`,
      );
    }
  }
  return issues;
}

/** sha256 checksum of one migration file's verbatim SQL (bookkeeping key). */
export function migrationChecksum(file: MigrationFile): string {
  return sha256Hex(file.sql);
}

/**
 * Run all pending migrations (the module header's five-step contract).
 * Throws `Error` (deterministic message, never the connection string — the
 * executor's error wrapping already swept it) on any failure; the database
 * is then exactly at the last fully-applied version.
 */
export async function runMigrations(executor: PgExecutor): Promise<MigrationOutcome> {
  const registryIssues = verifyRegistry(MIGRATIONS);
  if (registryIssues.length > 0) {
    throw new Error(`pg: broken migration registry — ${registryIssues.join("; ")}`);
  }

  // 1. Bootstrap the bookkeeping table (idempotent by construction).
  await executor.execute(SCHEMA_MIGRATIONS_DDL);

  // 2-3. Advisory lock + read/verify the applied set, in one transaction.
  const applied = await executor.transaction(async (tx) => {
    await tx.execute(advisoryXactLockSql());
    const rows = await tx.execute<{ version: number; name: string; checksum: string }>(
      selectAppliedMigrationsSql(),
    );
    return rows;
  });

  const appliedByVersion = new Map<number, AppliedMigration>();
  for (const row of applied) {
    appliedByVersion.set(row.version, {
      version: row.version,
      name: row.name,
      checksum: row.checksum,
    });
  }
  // A bookkeeping row for a version the registry no longer knows: the
  // database is AHEAD of the code — refuse loudly (downgrades are not a
  // thing; the operator must deploy code >= database).
  for (const version of [...appliedByVersion.keys()].sort((a, b) => a - b)) {
    if (!MIGRATIONS.some((file) => file.version === version)) {
      throw new Error(
        `pg: database carries migration version ${version} which this build does not know — ` +
          "deploy a build that includes it (downgrades are unsupported)",
      );
    }
  }
  // Checksum discipline: an applied file that changed on disk is a hard error.
  for (const file of MIGRATIONS) {
    const row = appliedByVersion.get(file.version);
    if (row !== undefined && row.checksum !== migrationChecksum(file)) {
      throw new Error(
        `pg: migration '${file.name}' (version ${file.version}) was already applied with a ` +
          "different checksum — applied migrations are immutable; ship a NEW migration instead",
      );
    }
  }

  // 4. Apply pending files in order, one transaction per file.
  const pending = MIGRATIONS.filter((file) => !appliedByVersion.has(file.version));
  if (pending.length > MAX_MIGRATIONS_PER_RUN) {
    throw new Error(
      `pg: ${pending.length} pending migrations exceed the run bound ${MAX_MIGRATIONS_PER_RUN} — ` +
      "run `bun run db:migrate` explicitly to catch up before deploying",
    );
  }
  const appliedNow: number[] = [];
  for (const file of pending) {
    await executor.transaction(async (tx) => {
      await tx.execute(setLocalStatementTimeoutSql(STATEMENT_TIMEOUT_REASSERT_MS));
      for (const statement of splitSqlStatements(file.sql)) {
        await tx.execute(statement);
      }
      await tx.execute(insertAppliedMigrationSql(), [
        file.version,
        file.name,
        migrationChecksum(file),
      ]);
    });
    appliedNow.push(file.version);
  }

  return {
    applied: appliedNow,
    alreadyApplied: MIGRATIONS.filter((file) => appliedByVersion.has(file.version)).map(
      (file) => file.version,
    ),
  };
}
