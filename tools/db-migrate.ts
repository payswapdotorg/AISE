/**
 * Root `bun run db:migrate` (PROD-005) — thin, offline-safe shim.
 *
 * Applies the pending Postgres schema migrations on the database named by
 * DATABASE_URL (ordered, versioned, idempotent — see
 * backend/api/src/pg/migrate.ts). The shim pre-checks DATABASE_URL and
 * fails CLEANLY with an actionable message when it is missing, without
 * spawning anything; the actual runner is backend/api/src/pg/cli.ts
 * (spawned in backend/api so workspace dependencies resolve there).
 *
 * Without DATABASE_URL the app runs in local FS mode and needs no
 * migrations — this script existing is never a reason to require a
 * database (docs/INSTALL.md §Persistence).
 */

import { join, resolve } from "node:path";

const ROOT = resolve(import.meta.dir, "..");

function databaseUrl(): string | null {
  const raw = process.env["DATABASE_URL"]?.trim();
  return raw === undefined || raw === "" ? null : raw;
}

const url = databaseUrl();
if (url === null) {
  console.error(
    "db:migrate: DATABASE_URL is not set — nothing to migrate.\n" +
      "  Set it to a Neon (or other Postgres) connection string, e.g. in .env:\n" +
      "    DATABASE_URL='postgres://user:password@host/db?sslmode=require'\n" +
      "  (see docs/INSTALL.md §Persistence). Without it the app runs in local FS mode.",
  );
  process.exit(1);
}

const proc = Bun.spawnSync({
  cmd: [process.execPath, "src/pg/cli.ts", "migrate"],
  cwd: join(ROOT, "backend/api"),
  stdout: "inherit",
  stderr: "inherit",
});
process.exit(proc.exitCode ?? 1);
