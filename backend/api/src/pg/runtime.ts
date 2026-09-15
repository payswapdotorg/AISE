/**
 * The runtime persistence selection (PROD-005).
 *
 * The ONE decision point between the two persistence modes:
 *
 *   - DATABASE_URL unset (or absent from the env record) → `{ mode: "fs" }`
 *     and the runtime entry keeps EXACTLY today's file-system behavior;
 *   - DATABASE_URL present → `{ mode: "pg" }`: the pooled singleton client
 *     (connection.ts — no I/O at construction; postgres.js connects lazily),
 *     the executor, the full store family (factory.ts) and a BOUNDED
 *     cold-start migration run (migrate.ts — at most
 *     MAX_MIGRATIONS_PER_RUN files, advisory-locked, transactional).
 *
 * BOOT HONESTY: a present-but-invalid DATABASE_URL is a hard construction
 * failure (`PgPersistenceError`, reason names the expectation, NEVER the
 * value) — persisting to the wrong place silently would be dishonest; the
 * deployment surfaces catch it and report through their own fail-fast or
 * degraded-boot disciplines. Migration FAILURES never reject the `ready`
 * promise: they are logged (redacted) and the process keeps serving —
 * /healthz stays honest, store operations fail loudly per request.
 *
 * TESTABILITY: `migrate` is injectable, so the offline runtime-selection
 * tests observe the migration call without any database (the default
 * `runMigrations` runs against the real executor in production).
 */

import {
  getOrCreatePgClient,
  parseDatabaseUrl,
  PgPersistenceError,
  toPgPersistenceError,
} from "./connection";
import { postgresExecutor, type PgExecutor } from "./executor";
import { runMigrations, type MigrationOutcome } from "./migrate";
import { createPgStoreFamily, type PgStoreFamily } from "./factory";
import type { Logger } from "../lib/log";

/** The environment switch (single source: presence = Pg mode). */
export const DATABASE_URL_ENV = "DATABASE_URL";

export type PgBootResult =
  | { readonly mode: "fs" }
  | {
      readonly mode: "pg";
      /** The six HandlerOptions replacements (see factory.ts). */
      readonly family: PgStoreFamily;
      /** The cold-start migration run (resolves with its outcome). */
      readonly migrations: Promise<MigrationOutcome>;
      /**
       * Never-rejecting gate the request pipeline awaits: resolves when
       * migrations settled (success OR logged failure — see module header).
       */
      readonly ready: Promise<void>;
    };

export interface PgBootOptions {
  /** The live environment record (raw — DATABASE_URL is not in lib/config). */
  readonly env: Readonly<Record<string, string | undefined>>;
  readonly logger: Logger;
  /** Data dir for the not-yet-twinned read-only authorities (reality). */
  readonly dataDir: string;
  /** Migration runner override (tests). Default: the real `runMigrations`. */
  readonly migrate?: (executor: PgExecutor) => Promise<MigrationOutcome>;
}

/**
 * Select and (for Pg mode) construct the persistence wiring. Synchronous,
 * no I/O (client construction connects lazily). Throws
 * `PgPersistenceError` ONLY for a present-but-invalid DATABASE_URL.
 */
export function bootPgPersistence(options: PgBootOptions): PgBootResult {
  const raw = options.env[DATABASE_URL_ENV];
  if (raw === undefined) {
    return { mode: "fs" };
  }
  const parsed = parseDatabaseUrl(raw);
  if (!parsed.ok) {
    throw new PgPersistenceError("pg_url_invalid", parsed.reason);
  }
  const executor = postgresExecutor(getOrCreatePgClient(raw));
  const family = createPgStoreFamily({
    executor,
    logger: options.logger,
    dataDir: options.dataDir,
  });
  const migrate = options.migrate ?? runMigrations;
  const migrations = migrate(executor);
  const ready = migrations.then(
    () => undefined,
    (error: unknown) => {
      // STATUS-ONLY reporting: the failure is logged pre-redacted (any
      // embedded connection string swept); store operations then fail
      // loudly per request — the process never dies over a schema issue.
      options.logger.error(
        "pg: cold-start migrations failed — serving with pending schema; " +
          "Postgres store operations will fail loudly until fixed",
        { error: toPgPersistenceError("pg_migration_failed", error, raw).message },
      );
    },
  );
  return { mode: "pg", family, migrations, ready };
}
