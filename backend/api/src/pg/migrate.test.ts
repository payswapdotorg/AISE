/**
 * Offline migration-runner tests (PROD-005): ordering, idempotency,
 * transactionality, registry discipline and the deterministic statement
 * split — all against the in-memory fake executor with the REAL v001 file
 * (no database, no network).
 */

import { describe, expect, test } from "bun:test";
import { fakePgExecutor } from "./testing";
import type { PgExecutor } from "./executor";
import {
  MIGRATIONS,
  migrationChecksum,
  runMigrations,
  verifyRegistry,
  type MigrationFile,
} from "./migrate";
import { splitSqlStatements } from "./sql";
import { PG_TABLES } from "./sql";

describe("migration registry", () => {
  test("the shipped registry is ordered, unique and non-empty", () => {
    expect(verifyRegistry(MIGRATIONS)).toEqual([]);
    expect(MIGRATIONS.length).toBeGreaterThanOrEqual(1);
    expect(MIGRATIONS[0]!.version).toBe(1);
    expect(MIGRATIONS[0]!.name).toBe("v001__initial_schema.sql");
  });

  test("verifyRegistry rejects non-ascending and duplicate versions", () => {
    const files: MigrationFile[] = [
      { version: 2, name: "a.sql", sql: "SELECT 1" },
      { version: 2, name: "b.sql", sql: "SELECT 2" },
    ];
    expect(verifyRegistry(files).length).toBeGreaterThan(0);
    expect(verifyRegistry([{ version: 0, name: "z.sql", sql: "SELECT 3" }]).length).toBe(1);
  });

  test("checksums are deterministic and content-sensitive", () => {
    const file = MIGRATIONS[0]!;
    expect(migrationChecksum(file)).toBe(migrationChecksum(file));
    expect(migrationChecksum(file)).toMatch(/^[0-9a-f]{64}$/);
    expect(migrationChecksum({ ...file, sql: `${file.sql}\n` })).not.toBe(migrationChecksum(file));
  });
});

describe("runMigrations (fake executor, real v001)", () => {
  test("applies v001 from zero and records its bookkeeping row", async () => {
    const fake = fakePgExecutor();
    const outcome = await runMigrations(fake);
    expect(outcome.applied).toEqual([1]);
    expect(outcome.alreadyApplied).toEqual([]);
    const rows = fake.rowsOf(PG_TABLES.schemaMigrations);
    expect(rows.length).toBe(1);
    expect(rows[0]!.version).toBe(1);
    expect(rows[0]!.name).toBe("v001__initial_schema.sql");
    expect(rows[0]!.checksum).toBe(migrationChecksum(MIGRATIONS[0]!));
    // Every v001 table exists after the run (schema from zero).
    for (const table of Object.values(PG_TABLES)) {
      expect(fake.tableNames()).toContain(table);
    }
  });

  test("re-running applies NOTHING the second time (idempotent, redeploy-safe)", async () => {
    const fake = fakePgExecutor();
    await runMigrations(fake);
    const outcome = await runMigrations(fake);
    expect(outcome.applied).toEqual([]);
    expect(outcome.alreadyApplied).toEqual([1]);
    expect(fake.rowsOf(PG_TABLES.schemaMigrations).length).toBe(1);
  });

  test("a tampered applied file is refused (history is append-only)", async () => {
    const fake = fakePgExecutor();
    // Bootstrap + record version 1 with a WRONG checksum (a file edited after
    // being applied) using the runner's own recognized statements.
    await fake.execute(
      "CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, name TEXT NOT NULL, checksum TEXT NOT NULL, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())",
    );
    await fake.execute(
      "INSERT INTO schema_migrations (version, name, checksum) VALUES ($1, $2, $3)",
      [1, "v001__initial_schema.sql", "0".repeat(64)],
    );
    let refused = false;
    try {
      await runMigrations(fake);
    } catch (error) {
      refused =
        error instanceof Error &&
        error.message.includes("different checksum");
    }
    expect(refused).toBe(true);
  });

  test("transactionality: a failing file leaves NO partial state and NO phantom row", async () => {
    const fake = fakePgExecutor();
    // Poison DDL execution only; everything else delegates to the fake.
    const poisoned: PgExecutor = {
      execute: async (sqlText: string, params?: readonly unknown[]) => {
        if (sqlText.startsWith("CREATE TABLE")) {
          throw new Error("poisoned DDL");
        }
        return fake.execute(sqlText, params);
      },
      transaction: <T>(fn: (tx: PgExecutor) => Promise<T>) =>
        fake.transaction(() => fn(poisoned)),
    };
    let failed = false;
    try {
      await runMigrations(poisoned);
    } catch (error) {
      failed = error instanceof Error && error.message.includes("poisoned DDL");
    }
    expect(failed).toBe(true);
    // The bootstrap table exists (its DDL is idempotent by construction) but
    // carries NO bookkeeping row, and NO domain table survived the rollback.
    expect(fake.rowsOf(PG_TABLES.schemaMigrations).length).toBe(0);
    expect(fake.tableNames()).not.toContain(PG_TABLES.boqSources);
    expect(fake.tableNames()).not.toContain(PG_TABLES.evidenceRecords);
    // Real rollback proof at the executor seam: an aborted multi-statement
    // transaction discards EVERY statement it ran.
    await fake.transaction(async (tx) => {
      await tx.execute("CREATE TABLE IF NOT EXISTS partial_state (id INTEGER)");
      throw new Error("abort");
    }).catch(() => undefined);
    expect(fake.tableNames()).not.toContain("partial_state");
  });

  test("database ahead of code is refused (no downgrades)", async () => {
    const fake = fakePgExecutor();
    await fake.execute("CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, name TEXT NOT NULL, checksum TEXT NOT NULL, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())");
    await fake.execute(
      "INSERT INTO schema_migrations (version, name, checksum) VALUES ($1, $2, $3)",
      [99, "v099__future.sql", "0".repeat(64)],
    );
    let refused = false;
    try {
      await runMigrations(fake);
    } catch (error) {
      refused = error instanceof Error && error.message.includes("does not know");
    }
    expect(refused).toBe(true);
  });
});

describe("splitSqlStatements", () => {
  test("splits on end-of-line semicolons, strips full-line comments, drops empties", () => {
    const statements = splitSqlStatements(
      "-- a comment\nCREATE TABLE a (id INTEGER);\n\nCREATE TABLE b (id INTEGER);\n-- trailing comment\n",
    );
    expect(statements).toEqual(["CREATE TABLE a (id INTEGER)", "CREATE TABLE b (id INTEGER)"]);
  });

  test("refuses dollar quoting (deterministic split stays auditable)", () => {
    expect(() => splitSqlStatements("CREATE FUNCTION f() $$ BEGIN END $$")).toThrow();
  });
});
