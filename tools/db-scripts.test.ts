/**
 * Root db script offline-safety tests (PROD-005): `bun tools/db-migrate.ts`
 * and `bun tools/db-seed.ts` must fail CLEANLY with an actionable message
 * when DATABASE_URL is unset or blank — WITHOUT spawning the backend CLI
 * (no network, no database; the CI gate stays green offline).
 */

import { describe, expect, test } from "bun:test";
import { resolve } from "node:path";

const ROOT = resolve(import.meta.dir, "..");

function runScript(script: "tools/db-migrate.ts" | "tools/db-seed.ts"): {
  exitCode: number | null;
  stderr: string;
  stdout: string;
} {
  const env = { ...process.env };
  delete env["DATABASE_URL"];
  const proc = Bun.spawnSync({
    cmd: [process.execPath, script],
    cwd: ROOT,
    env,
    stdout: "pipe",
    stderr: "pipe",
  });
  return {
    exitCode: proc.exitCode,
    stderr: new TextDecoder().decode(proc.stderr),
    stdout: new TextDecoder().decode(proc.stdout),
  };
}

describe("root db scripts: offline-safe without DATABASE_URL", () => {
  for (const script of ["tools/db-migrate.ts", "tools/db-seed.ts"] as const) {
    test(`${script}: unset DATABASE_URL → exit 1, actionable message, nothing spawned`, () => {
      const result = runScript(script);
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain("DATABASE_URL is not set");
      expect(result.stderr).toContain("docs/INSTALL.md");
      // The actionable next step is present.
      expect(result.stderr).toContain("DATABASE_URL='postgres://");
      // The backend CLI never ran (its outcome lines are absent).
      expect(result.stdout).not.toContain("db:migrate: applied");
      expect(result.stdout).not.toContain("db:seed:");
      // No stack trace noise — a clean, deliberate refusal.
      expect(result.stderr).not.toContain("at ");
    });

    test(`${script}: blank DATABASE_URL behaves like unset`, () => {
      const env = { ...process.env, DATABASE_URL: "   " };
      const proc = Bun.spawnSync({
        cmd: [process.execPath, script],
        cwd: ROOT,
        env,
        stdout: "pipe",
        stderr: "pipe",
      });
      expect(proc.exitCode).toBe(1);
      expect(new TextDecoder().decode(proc.stderr)).toContain("DATABASE_URL is not set");
    });
  }
});
