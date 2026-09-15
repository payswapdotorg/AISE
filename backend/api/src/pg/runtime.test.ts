/**
 * Offline tests for the PROD-005 runtime persistence selection: the
 * factory's mode decision, the cold-start migration seam, credential
 * redaction at the boot boundary and the runtime entry's Fs/Pg selection —
 * all WITHOUT any database (the executor is never dialed; postgres.js
 * connects lazily and the migration runner is injected).
 */

import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DATABASE_URL_ENV, bootPgPersistence } from "./runtime";
import { PgPersistenceError } from "./connection";
import type { MigrationOutcome } from "./migrate";
import { createRuntimeHandler } from "../runtime/entry";
import type { Logger } from "../lib/log";

/** Silent logger (captures error lines for the redaction assertions). */
function spyLogger(): { logger: Logger; errors: string[] } {
  const errors: string[] = [];
  const logger: Logger = {
    debug: () => undefined,
    info: () => undefined,
    warn: () => undefined,
    error: (message: string, context?: unknown) => {
      errors.push(`${message} ${JSON.stringify(context ?? {})}`);
    },
  } as unknown as Logger;
  return { logger, errors };
}

const PG_MODE_URL = "postgres://aise:secret-password@127.0.0.1:5432/aise_test";
const PG_MODE_URL_REDACTED_HOST = "postgres://aise:***@127.0.0.1:5432/aise_test";

function scratchDataDir(): string {
  return mkdtempSync(join(tmpdir(), "aise-pg-runtime-"));
}

describe("bootPgPersistence (mode selection)", () => {
  test("DATABASE_URL unset → fs mode, no executor, no migrations", () => {
    const { logger } = spyLogger();
    const boot = bootPgPersistence({ env: {}, logger, dataDir: scratchDataDir() });
    expect(boot.mode).toBe("fs");
  });

  test("DATABASE_URL present → pg mode with the full family and a bounded migration run", async () => {
    const { logger } = spyLogger();
    const dataDir = scratchDataDir();
    let sawExecutor = false;
    const outcome: MigrationOutcome = { applied: [1], alreadyApplied: [] };
    const migrate = async (): Promise<MigrationOutcome> => {
      sawExecutor = true;
      return outcome;
    };
    const boot = bootPgPersistence({ env: { [DATABASE_URL_ENV]: PG_MODE_URL }, logger, dataDir, migrate });
    if (boot.mode !== "pg") {
      throw new Error("expected pg mode");
    }
    expect(boot.family.capture).toBeDefined();
    expect(boot.family.missions).toBeDefined();
    expect(boot.family.missions.store).toBeDefined();
    expect(boot.family.evidence).toBeDefined();
    expect(boot.family.boq.service).toBeDefined();
    expect(boot.family.boq.normalization).toBeDefined();
    expect(boot.family.gaps.service).toBeDefined();
    expect(boot.family.cases.service).toBeDefined();
    await expect(boot.migrations).resolves.toEqual(outcome);
    await expect(boot.ready).resolves.toBeUndefined();
    expect(sawExecutor).toBe(true);
    rmSync(dataDir, { recursive: true, force: true });
  });

  test("present-but-invalid DATABASE_URL → typed failure whose message never carries the value", () => {
    const { logger } = spyLogger();
    const bad = "mysql://user:super-secret@host.example/db";
    let caught: unknown;
    try {
      bootPgPersistence({ env: { [DATABASE_URL_ENV]: bad }, logger, dataDir: scratchDataDir() });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(PgPersistenceError);
    const message = (caught as PgPersistenceError).message;
    expect(message).toContain("pg_url_invalid");
    expect(message).not.toContain("super-secret");
    expect(message).not.toContain(bad);
  });

  test("migration failure → ready still resolves and the logged status is redacted", async () => {
    const { logger, errors } = spyLogger();
    const migrate = async (): Promise<MigrationOutcome> => {
      throw new Error(`connection refused for ${PG_MODE_URL}`);
    };
    const boot = bootPgPersistence({
      env: { [DATABASE_URL_ENV]: PG_MODE_URL },
      logger,
      dataDir: scratchDataDir(),
      migrate,
    });
    if (boot.mode !== "pg") {
      throw new Error("expected pg mode");
    }
    await expect(boot.ready).resolves.toBeUndefined();
    expect(errors.length).toBe(1);
    expect(errors[0]).not.toContain("secret-password");
    expect(errors[0]).toContain(PG_MODE_URL_REDACTED_HOST);
  });
});

describe("runtime entry persistence selection (offline)", () => {
  test("DATABASE_URL unset → EXACTLY the Fs path: no migration call, /healthz answers", async () => {
    const dataDir = scratchDataDir();
    let migrateCalls = 0;
    const handler = createRuntimeHandler({
      envSource: () => ({ AISE_DATA_DIR: dataDir }),
      pgMigrate: async () => {
        migrateCalls += 1;
        return { applied: [], alreadyApplied: [] };
      },
    });
    const response = await handler(new Request("http://localhost/healthz"));
    expect(response.status).toBe(200);
    const body = (await response.json()) as { ok: boolean; service: string };
    expect(body.ok).toBe(true);
    expect(body.service).toBe("aise-api");
    expect(migrateCalls).toBe(0);
    rmSync(dataDir, { recursive: true, force: true });
  });

  test("DATABASE_URL set → Pg construction with the cold-start migration run ordered before requests", async () => {
    const dataDir = scratchDataDir();
    let migrateCalls = 0;
    const handler = createRuntimeHandler({
      envSource: () => ({ AISE_DATA_DIR: dataDir, DATABASE_URL: PG_MODE_URL }),
      pgMigrate: async () => {
        migrateCalls += 1;
        return { applied: [1], alreadyApplied: [] };
      },
    });
    const response = await handler(new Request("http://localhost/healthz"));
    expect(response.status).toBe(200);
    expect(((await response.json()) as { ok: boolean }).ok).toBe(true);
    expect(migrateCalls).toBe(1);
    // Idempotent redeploy shape: a second handler (next cold start) runs the
    // bounded check again — pending set now empty.
    const second = createRuntimeHandler({
      envSource: () => ({ AISE_DATA_DIR: dataDir, DATABASE_URL: PG_MODE_URL }),
      pgMigrate: async () => {
        migrateCalls += 1;
        return { applied: [], alreadyApplied: [1] };
      },
    });
    const response2 = await second(new Request("http://localhost/healthz"));
    expect(response2.status).toBe(200);
    expect(migrateCalls).toBe(2);
    rmSync(dataDir, { recursive: true, force: true });
  });

  test("DATABASE_URL set with failing migrations → boot stays honest: /healthz answers, status logged redacted", async () => {
    const dataDir = scratchDataDir();
    const { logger, errors } = spyLogger();
    const handler = createRuntimeHandler({
      envSource: () => ({ AISE_DATA_DIR: dataDir, DATABASE_URL: PG_MODE_URL }),
      logger,
      pgMigrate: async () => {
        throw new Error(`dial failed: ${PG_MODE_URL}`);
      },
    });
    const response = await handler(new Request("http://localhost/healthz"));
    expect(response.status).toBe(200);
    expect(((await response.json()) as { ok: boolean }).ok).toBe(true);
    expect(errors.length).toBe(1);
    expect(errors[0]).not.toContain("secret-password");
    expect(errors[0]).toContain(PG_MODE_URL_REDACTED_HOST);
    rmSync(dataDir, { recursive: true, force: true });
  });

  test("DATABASE_URL set but invalid → construction fails loudly without echoing the value", () => {
    const dataDir = scratchDataDir();
    let caught: unknown;
    try {
      createRuntimeHandler({
        envSource: () => ({ AISE_DATA_DIR: dataDir, DATABASE_URL: "not-a-postgres-url" }),
      });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(PgPersistenceError);
    expect((caught as PgPersistenceError).message).not.toContain("not-a-postgres-url");
    rmSync(dataDir, { recursive: true, force: true });
  });
});
