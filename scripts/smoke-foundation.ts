/**
 * AISE-001 foundation smoke test.
 *
 * Proves, against real child processes (not in-process mocks):
 *   1. configuration hygiene — `.env.example` exists, no `.env*` files are
 *      tracked by git;
 *   2. API service boots, serves /healthz + /readyz, returns structured
 *      404/405 responses, and shuts down gracefully on SIGTERM (exit 0);
 *   3. configuration fail-closed behaviour — with invalid required config
 *      the API exits 1 after emitting a structured `config.invalid` record;
 *   4. worker process boots, is polling (debug `worker.poll` records), and
 *      shuts down gracefully on SIGTERM (exit 0).
 *
 * Additionally guards the repository verification contract (static checks):
 *   5. verification contract — `package.json` `scripts.verify` is the single
 *      authoritative verification command; CI invokes it verbatim (no
 *      second, independent stage list); README documents the same stages —
 *      so the three surfaces cannot silently diverge.
 *
 * Exit code 0 means every check passed; any failure exits 1.
 */
import { spawn, spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import * as path from "node:path";
import process from "node:process";

interface ParsedRecord {
  msg?: unknown;
  [key: string]: unknown;
}

interface SpawnedService {
  kill(signal: NodeJS.Signals): void;
  waitFor(
    predicate: (record: ParsedRecord) => boolean,
    timeoutMs: number,
    label: string,
  ): Promise<ParsedRecord>;
  waitExit(timeoutMs: number): Promise<number>;
  output(): string;
}

const root = path.resolve(import.meta.dirname, "..");
const tsxCli = path.join(root, "node_modules", "tsx", "dist", "cli.mjs");

/** The canonical verification stages, in the order `npm run verify` runs them. */
const VERIFICATION_STAGES = ["lint", "typecheck", "test", "smoke", "build:web"] as const;

function fail(message: string): never {
  throw new Error(message);
}

function assert(condition: boolean, message: string): void {
  if (!condition) {
    fail(message);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseMaybeJson(line: string): ParsedRecord | null {
  try {
    const value = JSON.parse(line) as unknown;
    if (value !== null && typeof value === "object" && !Array.isArray(value)) {
      return value as ParsedRecord;
    }
    return null;
  } catch {
    return null;
  }
}

function spawnService(script: string, env: Record<string, string>): SpawnedService {
  const proc = spawn(process.execPath, [tsxCli, path.join(root, script)], {
    cwd: root,
    env,
    stdio: ["ignore", "pipe", "pipe"],
  });

  const lines: string[] = [];
  const records: ParsedRecord[] = [];
  let pending = "";
  let output = "";

  proc.stdout.on("data", (chunk: Buffer) => {
    const text = chunk.toString("utf8");
    output += text;
    pending += text;
    let newlineIndex = pending.indexOf("\n");
    while (newlineIndex >= 0) {
      const line = pending.slice(0, newlineIndex);
      pending = pending.slice(newlineIndex + 1);
      if (line.trim().length > 0) {
        lines.push(line);
        const record = parseMaybeJson(line);
        if (record !== null) {
          records.push(record);
        }
      }
      newlineIndex = pending.indexOf("\n");
    }
  });

  proc.stderr.on("data", (chunk: Buffer) => {
    output += chunk.toString("utf8");
  });

  const exited = new Promise<number>((resolve) => {
    proc.on("exit", (code, signal) => {
      resolve(code ?? (signal !== null ? 124 : 1));
    });
  });

  const waitExit = async (timeoutMs: number): Promise<number> => {
    const timer = setTimeout(() => proc.kill("SIGKILL"), timeoutMs);
    const code = await exited;
    clearTimeout(timer);
    return code;
  };

  return {
    kill: (signal) => proc.kill(signal),
    waitFor: async (predicate, timeoutMs, label) => {
      const deadline = Date.now() + timeoutMs;
      for (;;) {
        const match = records.find(predicate);
        if (match !== undefined) {
          return match;
        }
        const exitedAlready = proc.exitCode !== null || proc.signalCode !== null;
        if (exitedAlready || Date.now() > deadline) {
          fail(
            `timed out waiting for ${label} after ${timeoutMs}ms. Service output so far:\n${output.slice(-2000)}`,
          );
        }
        await sleep(25);
      }
    },
    waitExit,
    output: () => output,
  };
}

function baseEnv(): Record<string, string> {
  // Child processes see only what we hand them: no inherited AISE_* values.
  return {
    PATH: process.env.PATH ?? "",
    ...(process.env.HOME !== undefined ? { HOME: process.env.HOME } : {}),
  };
}

async function checkConfigHygiene(): Promise<void> {
  assert(
    existsSync(path.join(root, ".env.example")),
    "config hygiene failed: .env.example must exist at the repository root",
  );
  const listed = spawnSync("git", ["ls-files"], { cwd: root, encoding: "utf8" });
  assert(listed.status === 0, "config hygiene failed: could not run `git ls-files`");
  const tracked = (listed.stdout ?? "").split("\n").filter((line) => line.length > 0);
  const offenders = tracked.filter(
    (file) => /^\.env(\..+)?$/.test(file) && file !== ".env.example",
  );
  assert(
    offenders.length === 0,
    `config hygiene failed: environment files must never be tracked: ${offenders.join(", ")}`,
  );
  console.log("smoke: config hygiene OK (.env.example present, no .env* tracked)");
}

async function checkVerificationContract(): Promise<void> {
  // The repository must keep exactly one verification contract:
  //   - package.json scripts.verify is the authoritative stage chain;
  //   - .github/workflows/ci.yml invokes `npm run verify` verbatim and must
  //     not run verification stages directly (no second definition);
  //   - README.md documents the same stages and the "exactly what CI runs"
  //     claim.
  // Any divergence between these surfaces fails here — locally via
  // `npm run smoke`, and in CI via `npm run verify`.
  const pkg = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8")) as {
    scripts?: Record<string, string>;
  };
  const verifyScript = pkg.scripts?.verify ?? fail("verification contract failed: package.json must define scripts.verify");
  const invokedStages = [...verifyScript.matchAll(/npm run ([^\s&]+)/g)].map((match) => match[1]);
  const expectedStages: readonly string[] = VERIFICATION_STAGES;
  assert(
    JSON.stringify(invokedStages) === JSON.stringify(expectedStages),
    `verification contract failed: scripts.verify must chain exactly ${expectedStages.join(" + ")} in order (found: ${invokedStages.join(" + ") || "nothing"})`,
  );

  const ciYaml = readFileSync(path.join(root, ".github", "workflows", "ci.yml"), "utf8");
  const runSteps = [...ciYaml.matchAll(/run:\s*(.+)$/gm)].map((match) => match[1].trim());
  assert(
    runSteps.includes("npm run verify"),
    "verification contract failed: .github/workflows/ci.yml must invoke `npm run verify` as the single verification entry point",
  );
  const directlyRunStages = runSteps.filter((step) =>
    VERIFICATION_STAGES.some(
      (stage) => step === `npm run ${stage}` || step === `npm ${stage}`,
    ),
  );
  assert(
    directlyRunStages.length === 0,
    `verification contract failed: ci.yml must not run verification stages directly (${directlyRunStages.join(", ")}) — stages are defined only in scripts.verify`,
  );

  const readme = readFileSync(path.join(root, "README.md"), "utf8");
  const verifyRow =
    readme.split("\n").find((line) => line.startsWith("| `npm run verify` |")) ??
    fail("verification contract failed: README.md must document `npm run verify` in the commands table");
  const expectedSummary = expectedStages.join(" + ");
  assert(
    verifyRow.includes(expectedSummary),
    `verification contract failed: README \`npm run verify\` row must list ${expectedSummary}`,
  );
  assert(
    verifyRow.includes("exactly what CI runs"),
    "verification contract failed: README `npm run verify` row must state that it is exactly what CI runs",
  );

  console.log(
    `smoke: verification contract OK (package.json verify == CI entry point == README: ${expectedSummary})`,
  );
}

async function smokeApi(): Promise<void> {
  const port = process.env.AISE_SMOKE_API_PORT ?? "8231";
  const api = spawnService("backend/services/api/src/main.ts", {
    ...baseEnv(),
    AISE_ENV: "development",
    AISE_LOG_LEVEL: "info",
    AISE_API_HOST: "127.0.0.1",
    AISE_API_PORT: port,
  });

  const listening = await api.waitFor(
    (record) => record.msg === "api.listening",
    30_000,
    "api.listening",
  );
  const actualPort = typeof listening.port === "number" ? listening.port : Number(port);

  const health = await fetch(`http://127.0.0.1:${actualPort}/healthz`);
  assert(health.status === 200, `expected 200 from /healthz, got ${health.status}`);
  const healthBody = (await health.json()) as { service: string; status: string; env: string };
  assert(healthBody.service === "api", "healthz body must identify the service");
  assert(healthBody.status === "ok", "healthz body must report status ok");
  assert(healthBody.env === "development", "healthz body must report the configured env");

  const ready = await fetch(`http://127.0.0.1:${actualPort}/readyz`);
  assert(ready.status === 200, `expected 200 from /readyz, got ${ready.status}`);

  const missing = await fetch(`http://127.0.0.1:${actualPort}/not-a-foundation-route`);
  assert(missing.status === 404, `expected 404 from unknown route, got ${missing.status}`);
  const missingBody = (await missing.json()) as { error: string };
  assert(missingBody.error === "not_found", "404 body must be structured");

  const badMethod = await fetch(`http://127.0.0.1:${actualPort}/healthz`, { method: "POST" });
  assert(badMethod.status === 405, `expected 405 from POST /healthz, got ${badMethod.status}`);

  api.kill("SIGTERM");
  await api.waitFor((record) => record.msg === "api.stopped", 10_000, "api.stopped");
  const exitCode = await api.waitExit(10_000);
  assert(exitCode === 0, `api must exit 0 after SIGTERM, got ${exitCode}`);

  console.log(
    `smoke: api OK (listening on 127.0.0.1:${actualPort}, healthz/readyz 200, 404/405 structured, graceful SIGTERM exit 0)`,
  );
}

async function smokeFailSafeConfig(): Promise<void> {
  // An explicitly empty required variable exercises the same validation
  // branch as a missing one, while also being immune to a developer's
  // local .env file (loadEnvFile never overrides pre-set variables).
  const failing = spawnService("backend/services/api/src/main.ts", {
    ...baseEnv(),
    AISE_ENV: "",
    AISE_LOG_LEVEL: "info",
  });

  const exitCode = await failing.waitExit(15_000);
  assert(exitCode === 1, `fail-safe: api must exit 1 on invalid config, got ${exitCode}`);

  const invalid = failing
    .output()
    .split("\n")
    .map((line) => parseMaybeJson(line))
    .find((record) => record?.msg === "config.invalid");
  assert(invalid !== undefined, "fail-safe: expected a structured config.invalid record");
  const errors = invalid?.errors;
  assert(Array.isArray(errors) && errors.length > 0, "config.invalid must list its errors");
  assert(
    Array.isArray(errors) && errors.some((e) => String(e).includes("AISE_ENV")),
    "config.invalid must name the missing required variable",
  );

  console.log("smoke: fail-safe config OK (missing AISE_ENV -> config.invalid + exit 1)");
}

async function smokeWorker(): Promise<void> {
  const worker = spawnService("backend/services/worker/src/main.ts", {
    ...baseEnv(),
    AISE_ENV: "development",
    AISE_LOG_LEVEL: "debug",
    AISE_WORKER_POLL_INTERVAL_MS: "100",
  });

  await worker.waitFor((record) => record.msg === "worker.started", 30_000, "worker.started");
  await worker.waitFor((record) => record.msg === "worker.poll", 10_000, "worker.poll");
  await sleep(300);

  worker.kill("SIGTERM");
  await worker.waitFor((record) => record.msg === "worker.stopped", 10_000, "worker.stopped");
  const exitCode = await worker.waitExit(10_000);
  assert(exitCode === 0, `worker must exit 0 after SIGTERM, got ${exitCode}`);

  console.log("smoke: worker OK (started, polling, graceful SIGTERM exit 0)");
}

async function main(): Promise<void> {
  assert(
    existsSync(tsxCli),
    "tsx is not installed — run `npm install` (or `npm ci`) before running the smoke test",
  );

  await checkConfigHygiene();
  await checkVerificationContract();
  await smokeApi();
  await smokeFailSafeConfig();
  await smokeWorker();

  console.log("smoke: ALL CHECKS PASSED");
}

main().catch((error: unknown) => {
  console.error(`smoke: FAILED — ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
