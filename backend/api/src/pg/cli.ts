/**
 * The database CLI (PROD-005): `bun src/pg/cli.ts migrate|seed`.
 *
 * The single process entry the root `db:migrate` / `db:seed` scripts spawn
 * (tools/db-migrate.ts, tools/db-seed.ts — the spawn pattern keeps backend
 * internals out of the tools/ boundary). It:
 *
 *   - reads DATABASE_URL from the environment and FAILS CLEANLY with an
 *     actionable message when it is missing or blank (offline-safe: the
 *     root shims pre-check too, but the CLI is safe on its own);
 *   - runs the migration runner (`migrate`) or the runner + the demo seed
 *     (`seed` — seeding requires the schema, so it is created first);
 *   - prints DETERMINISTIC outcome lines (transcript-friendly) and exits
 *     0 on success, 1 on any failure;
 *   - NEVER prints the connection string: every error is swept through
 *     `toPgPersistenceError` before it reaches stderr.
 */

import {
  getOrCreatePgClient,
  parseDatabaseUrl,
  endPgClients,
  toPgPersistenceError,
} from "./connection";
import { postgresExecutor } from "./executor";
import { runMigrations } from "./migrate";
import { runSeed } from "./seed";

const USAGE = "usage: bun src/pg/cli.ts <migrate|seed>";

/**
 * CLI output seam. Backend library code logs through the structured logger
 * (the lint gate's `no-console` rule); a CLI's stdout/stderr IS its output
 * contract — deterministic transcript lines and exit codes — so it writes
 * through process.std* directly, never `console.*`.
 */
function out(line: string): void {
  process.stdout.write(`${line}\n`);
}

function failOut(line: string): void {
  process.stderr.write(`${line}\n`);
}

function readDatabaseUrl(): string {
  const raw = process.env["DATABASE_URL"]?.trim();
  if (raw === undefined || raw === "") {
    failOut(
      "db: DATABASE_URL is not set — nothing to do.\n" +
        "  Set it to a Neon (or other Postgres) connection string to use Neon persistence,\n" +
        "  e.g. in .env: DATABASE_URL='postgres://user:password@host/db?sslmode=require'\n" +
        "  (see docs/INSTALL.md §Persistence). Without it the app runs in local FS mode.",
    );
    process.exit(1);
  }
  return raw;
}

function fail(rawUrl: string, error: unknown): never {
  failOut(toPgPersistenceError("pg_migration_failed", error, rawUrl).message);
  process.exit(1);
}

async function main(): Promise<void> {
  const command = process.argv[2];
  if (command !== "migrate" && command !== "seed") {
    failOut(`db: unknown command '${command ?? ""}' — ${USAGE}`);
    process.exit(1);
  }

  const rawUrl = readDatabaseUrl();
  const parsed = parseDatabaseUrl(rawUrl);
  if (!parsed.ok) {
    failOut(`db: ${parsed.reason}`);
    process.exit(1);
  }

  const executor = postgresExecutor(getOrCreatePgClient(rawUrl));
  try {
    const migrations = await runMigrations(executor);
    out(
      `db:migrate: applied [${migrations.applied.join(", ")}] ` +
        `already-applied [${migrations.alreadyApplied.join(", ")}]`,
    );

    if (command === "seed") {
      const seed = await runSeed(executor);
      for (const item of seed.items) {
        out(`db:seed: ${item.kind} '${item.id}' → ${item.action}`);
      }
      const seeded = seed.items.filter((item) => item.action === "seeded").length;
      out(
        `db:seed: ok (${seeded} seeded, ${seed.items.length - seeded} skipped/kept)`,
      );
    }
  } catch (error) {
    fail(rawUrl, error);
  } finally {
    await endPgClients();
  }
}

void main();
