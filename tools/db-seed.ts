/**
 * Root `bun run db:seed` (PROD-005) — thin, offline-safe shim.
 *
 * Applies pending migrations (seeding requires the schema) and then runs
 * the idempotent demo seed (content-hash-keyed markers — see
 * backend/api/src/pg/seed.ts). The shim pre-checks DATABASE_URL and fails
 * CLEANLY with an actionable message when it is missing, without spawning
 * anything; the actual runner is backend/api/src/pg/cli.ts (spawned in
 * backend/api so workspace dependencies resolve there).
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
    "db:seed: DATABASE_URL is not set — nothing to seed.\n" +
      "  Set it to a Neon (or other Postgres) connection string, e.g. in .env:\n" +
      "    DATABASE_URL='postgres://user:password@host/db?sslmode=require'\n" +
      "  (see docs/INSTALL.md §Persistence). Without it the app runs in local FS mode.",
  );
  process.exit(1);
}

const proc = Bun.spawnSync({
  cmd: [process.execPath, "src/pg/cli.ts", "seed"],
  cwd: join(ROOT, "backend/api"),
  stdout: "inherit",
  stderr: "inherit",
});
process.exit(proc.exitCode ?? 1);
