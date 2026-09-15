/**
 * The Postgres execution seam (PROD-005).
 *
 * Every store twin, the migration runner and the seed talk to Postgres
 * through `PgExecutor` — a minimal, easily-faked interface of TWO methods:
 *
 *   - `execute(sqlText, params)` — one statement with positional $n
 *     parameters, resolving to its rows;
 *   - `transaction(fn)` — run `fn` inside a transaction.
 *
 * WHY THIS SEAM EXISTS: the domain stores' discipline (write-once records,
 * append-only journals, idempotent puts, canonical-JSON round-trips) must
 * be provable OFFLINE — the verify gate stays green without any database.
 * With SQL text as data (built by `sql.ts`, dispatched by this seam), the
 * offline tests run the REAL store adapters against the in-memory fake in
 * `testing.ts` (which implements the semantics of every statement the
 * family emits), while the env-gated tests run the exact same adapters
 * against real Postgres through `postgresExecutor`.
 *
 * TRANSACTION PROPAGATION: `transaction` uses JOIN semantics — when called
 * from inside an already-active transaction on the same executor, the inner
 * call simply joins the outer scope (no nested BEGIN). This keeps composed
 * operations safe: the demo seed wraps store calls that internally use
 * transactions (e.g. capture batch acceptance) without ever producing a
 * nested-BEGIN error, and an inner failure still rolls the whole outer
 * scope back (the error propagates).
 */

import type postgres from "postgres";
import type { PgClient } from "./connection";

/** Row shape returned by `execute` (column name → value). */
export type PgRow = Record<string, unknown>;

export interface PgExecutor {
  /**
   * Execute one SQL statement with positional parameters. Resolves to the
   * statement's rows (empty for statements without RETURNING/SELECT rows).
   */
  execute<T extends PgRow = PgRow>(sqlText: string, params?: readonly unknown[]): Promise<T[]>;
  /**
   * Run `fn` inside a transaction. Joins the ambient transaction when one
   * is already active on this executor (see module header).
   */
  transaction<T>(fn: (tx: PgExecutor) => Promise<T>): Promise<T>;
}

/**
 * The production executor over a postgres.js client (or the transaction
 * handle `sql.begin` provides, which is interface-compatible here).
 */
export function postgresExecutor(client: PgClient): PgExecutor {
  // The ambient transaction handle: set for the duration of an active
  // `transaction()` scope, null otherwise. All `execute` calls route through
  // it when present, so statements issued inside the callback — including
  // by nested JOIN callers — participate in the transaction.
  let ambient: PgClient | null = null;

  const executor: PgExecutor = {
    async execute<T extends PgRow = PgRow>(
      sqlText: string,
      params: readonly unknown[] = [],
    ): Promise<T[]> {
      const target = ambient ?? client;
      const rows = await target.unsafe<T[]>(sqlText, params as never[]);
      return rows;
    },
    async transaction<T>(fn: (tx: PgExecutor) => Promise<T>): Promise<T> {
      if (ambient !== null) {
        // JOIN the ambient transaction (see module header).
        return fn(executor);
      }
      // postgres.js types `begin` through `UnwrapPromiseArray<T>` (an array
      // unwrapping helper); for our non-array T the runtime value is exactly
      // the callback's resolved value, so the cast is a type-level no-op.
      return client.begin(async (tx) => {
        ambient = tx as unknown as PgClient;
        try {
          return await fn(executor);
        } finally {
          ambient = null;
        }
      }) as Promise<T>;
    },
  };
  return executor;
}

/** Type-only helper: the postgres.js module's own Sql type (for consumers). */
export type { postgres };
