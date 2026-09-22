/**
 * AISE one-command demo bootstrap (PROD-014).
 *
 * `bun run demo` — takes a fresh checkout to a working product:
 *
 *   prerequisites → install → env → migrate → seed → build → start →
 *   smoke → entry URLs
 *
 * This is an ORCHESTRATOR over the repository's existing tools (PROD-001's
 * install/build/start/smoke discipline, PROD-005's db shims, the env
 * validator). It reimplements NONE of their logic: every phase either
 * delegates to a tool by subprocess or probes an observable side effect
 * (node_modules/, build artifacts, a live /healthz).
 *
 * DEMO-SAFE ENVIRONMENT (no secrets required):
 *
 *   - the demo's data directory is ALWAYS `<repo>/data/demo` — one
 *     gitignored directory owns ALL demo state (the scratch data, the
 *     server log and the bootstrap state file). It is deliberately NOT
 *     overridable: the demo never reads or writes the evaluator's real
 *     `AISE_DATA_DIR` (their `bun run dev` / `bun run start` data stays
 *     untouched), and `--fresh` removes exactly this one directory;
 *   - `AISE_AUTH=1` + `AISE_AUTH_MODE=demo-open` (the default) + a locally
 *     GENERATED throwaway `AUTH_SECRET` persisted in the state file — the
 *     same sign-in / "Enter demo" gate the deployed product shows, with
 *     zero user-supplied credentials. Fill-only-missing: an evaluator who
 *     set `AISE_AUTH`/`AUTH_SECRET` (shell or root `.env`) keeps their
 *     value;
 *   - every other variable passes through verbatim. `DATABASE_URL` is
 *     never dropped: unset → local-FS demo mode (no database needed);
 *     set → Postgres mode (migrate/seed run for real) and an invalid value
 *     fails closed with the validator's own actionable message.
 *
 * PHASES (each printed with a banner; each fails fast):
 *
 *   1. prerequisites — Bun ≥ 1.2; the API/web/smoke ports free unless the
 *      demo's own server already holds them (idempotent re-run);
 *   2. install       — `bun install` (skipped when node_modules/ exists);
 *   3. env           — `bun tools/validate-env.ts --mode start` with the
 *      demo overlay (always re-run: cheap, catches drift);
 *   4. migrate       — `bun tools/db-migrate.ts` when `DATABASE_URL` is
 *      set; an honest documented skip otherwise (local-FS mode needs no
 *      migrations — docs/INSTALL.md §13);
 *   5. seed          — `bun tools/db-seed.ts` under the same rule;
 *   6. build         — `bun run build` (skipped when BOTH artifacts
 *      exist: apps/web/dist/index.html + api/[...path].mjs);
 *   7. start         — `bun tools/start.ts` as a DETACHED background
 *      process group (log → data/demo/server.log), with a bounded health
 *      wait on /healthz + /readyz and the web port; skipped when the demo
 *      server already answers;
 *   8. smoke         — `bun run smoke` (ALWAYS re-run: the runtime proof
 *      of life — its scratch server uses port 8787, deliberately beside
 *      the demo's own ports);
 *   9. entry         — the evaluator entry URLs + the guide link. The
 *      bootstrap then EXITS 0, leaving the demo server running in the
 *      background (stop it with `bun run demo --stop`, or tear everything
 *      down and re-run from zero with `bun run demo --fresh`).
 *
 * IDEMPOTENCY (documented policy): probe-first, state-file-recorded.
 * node_modules/, the build artifacts and a live healthy demo server are
 * probed directly; the light state file (data/demo/.bootstrap-state.json)
 * records what ran, the generated AUTH_SECRET (reused across re-runs so
 * sessions survive restarts) and the started server's pid. Re-running on
 * an already-bootstrapped checkout skips install/migrate/seed/build/start
 * and re-runs env + smoke (drift check + proof of life).
 *
 * CLEAN FAILURE: on any phase failure the bootstrap stops, prints WHICH
 * phase failed, the tool's captured output (bounded tail) and the
 * troubleshooting pointer (docs/EVALUATOR-GUIDE.md §Troubleshooting +
 * docs/INSTALL.md §Troubleshooting), tears down anything THIS run started
 * (never a half-started server holding ports) and exits 1.
 *
 * FLAGS:
 *
 *   --fresh  tear down the demo state (stop the recorded server, remove
 *            data/demo entirely) and re-run all phases from zero;
 *   --stop   stop the background demo server recorded in the state file
 *            (SIGTERM its process group, SIGKILL after a bounded wait);
 *   --help   usage.
 *
 * NO new dependencies: node stdlib + the repository's existing tools only.
 */

import { spawn, type ChildProcess } from "node:child_process";
import {
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { randomBytes } from "node:crypto";
import { connect as netConnect } from "node:net";
import { dirname, join, resolve } from "node:path";

const ROOT = resolve(import.meta.dir, "..");

/* ------------------------------------------------------------------ */
/* Public surface (consumed by tools/bootstrap.test.ts — deterministic */
/* tests inject fakes for every effect: no network, no ports, no       */
/* processes, no real filesystem writes).                              */
/* ------------------------------------------------------------------ */

/** One phase command the orchestrator delegates to a tool by subprocess. */
export interface CommandSpec {
  readonly cmd: readonly string[];
  readonly cwd: string;
  /** Extra environment merged over the parent environment. */
  readonly env?: Readonly<Record<string, string>>;
}

/** The captured outcome of one delegated command. */
export interface CommandResult {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
}

/** A detached background process group started by the start phase. */
export interface BackgroundHandle {
  readonly pid: number;
  /** Teardown: SIGTERM the group, bounded wait, SIGKILL fallback. */
  stop(): Promise<void>;
}

/** Everything with an effect the orchestrator needs, injectable for tests. */
export interface BootstrapDeps {
  /** Run one phase command to completion, capturing combined output. */
  runCommand(spec: CommandSpec): Promise<CommandResult>;
  /** Start the detached background server; its output goes to logPath. */
  startBackground(spec: CommandSpec, logPath: string): Promise<BackgroundHandle>;
  /** True when something accepts a TCP connection on host:port. */
  portAnswers(host: string, port: number): Promise<boolean>;
  /** GET a URL as text; null when the request fails (any reason). */
  fetchText(url: string): Promise<string | null>;
  /** Sleep ms (tests inject a clock-advancing no-op). */
  sleep(ms: number): Promise<void>;
  /** The clock the health waits are bounded by (tests inject a fake). */
  now(): number;
  /** Signal a process/group; false when no such target exists (tests fake it). */
  kill(pid: number, signal: "SIGTERM" | "SIGKILL" | "0"): boolean;
  /** Filesystem facade (tests fake it; real impl touches only data/demo). */
  fs: {
    exists(path: string): boolean;
    readFile(path: string): string | null;
    writeFile(path: string, content: string): void;
    removeDir(path: string): void;
    mkdirs(path: string): void;
    /** Directory entry names of a path (empty when absent). */
    list(path: string): readonly string[];
  };
  /** Current process environment (Bun already merged the root .env). */
  env: Record<string, string | undefined>;
  /** Output printers (asserted by the deterministic tests). */
  log(line: string): void;
  fail(line: string): void;
}

/** The phases, in execution order. */
export const PHASES = [
  "prerequisites",
  "install",
  "env",
  "migrate",
  "seed",
  "build",
  "start",
  "smoke",
] as const;

export type PhaseName = (typeof PHASES)[number];

/** The persisted bootstrap state (data/demo/.bootstrap-state.json). */
export interface BootstrapState {
  readonly schemaVersion: 1;
  readonly completedPhases: readonly PhaseName[];
  /** The generated throwaway demo AUTH_SECRET (reused across re-runs). */
  readonly authSecret: string;
  readonly server:
    | {
        readonly pid: number;
        readonly logPath: string;
        readonly apiPort: number;
        readonly webPort: number;
        readonly apiHost: string;
      }
    | null;
}

export interface BootstrapOptions {
  /** Tear down demo state and re-run from zero. */
  readonly fresh: boolean;
}

export interface BootstrapOutcome {
  /** The phase that failed (null when the bootstrap succeeded). */
  readonly failedPhase: PhaseName | null;
  readonly exitCode: number;
}

/* ------------------------------------------------------------------ */
/* Derived configuration                                               */
/* ------------------------------------------------------------------ */

export interface DemoConfig {
  /** The demo's own scratch data dir — ALWAYS <repo>/data/demo. */
  readonly dataDir: string;
  readonly statePath: string;
  readonly serverLogPath: string;
  readonly apiHost: string;
  readonly apiPort: number;
  readonly webPort: number;
  readonly smokePort: number;
  readonly webAppUrl: string;
  readonly demoPathUrl: string;
  readonly apiHealthUrl: string;
  readonly apiReadyUrl: string;
  readonly guidePath: string;
  /** The demo-safe environment overlay (fill-only-missing). */
  readonly envOverlay: Readonly<Record<string, string>>;
  /** True when DATABASE_URL is set (Postgres mode → migrate/seed run). */
  readonly databaseMode: boolean;
}

/**
 * Derive the demo configuration from the environment. Fill-only-missing:
 * values the evaluator already set (shell or root `.env` — Bun merged both
 * into `env`) pass through untouched; only absent ones get demo defaults.
 * The demo data dir is fixed to <repo>/data/demo (see the header).
 */
export function deriveDemoConfig(
  env: Record<string, string | undefined>,
  authSecret: string,
): DemoConfig {
  const dataDir = join(ROOT, "data", "demo");
  const apiPort = parsePort(env["PORT"], 8080);
  const webPort = parsePort(env["AISE_WEB_PORT"], 4173);
  const apiHost = env["HOST"] ?? "127.0.0.1";
  const overlay: Record<string, string> = {
    AISE_DATA_DIR: dataDir,
    AISE_AUTH: env["AISE_AUTH"] ?? "1",
  };
  if (env["AUTH_SECRET"] === undefined) {
    overlay["AUTH_SECRET"] = authSecret;
  }
  const databaseUrl = env["DATABASE_URL"]?.trim();
  const healthHost = apiHost === "0.0.0.0" || apiHost === "::" ? "127.0.0.1" : apiHost;
  return {
    dataDir,
    statePath: join(dataDir, ".bootstrap-state.json"),
    serverLogPath: join(dataDir, "server.log"),
    apiHost,
    apiPort,
    webPort,
    smokePort: 8787,
    webAppUrl: `http://localhost:${webPort}/`,
    demoPathUrl: `http://localhost:${webPort}/#/projects`,
    apiHealthUrl: `http://${healthHost}:${apiPort}/healthz`,
    apiReadyUrl: `http://${healthHost}:${apiPort}/readyz`,
    guidePath: "docs/EVALUATOR-GUIDE.md",
    envOverlay: overlay,
    databaseMode: databaseUrl !== undefined && databaseUrl !== "",
  };
}

function parsePort(raw: string | undefined, fallback: number): number {
  if (raw === undefined || raw.trim() === "") {
    return fallback;
  }
  const port = Number.parseInt(raw, 10);
  return Number.isInteger(port) && port >= 1 && port <= 65535 ? port : fallback;
}

/**
 * Read the persisted state (null when absent or unreadable — a corrupt
 * state file never blocks the demo; it is treated as "not bootstrapped").
 */
export function readState(fs: BootstrapDeps["fs"], path: string): BootstrapState | null {
  if (!fs.exists(path)) {
    return null;
  }
  const raw = fs.readFile(path);
  if (raw === null) {
    return null;
  }
  try {
    const parsed = JSON.parse(raw) as Partial<BootstrapState>;
    if (parsed.schemaVersion !== 1 || typeof parsed.authSecret !== "string") {
      return null;
    }
    const server = parsed.server;
    return {
      schemaVersion: 1,
      completedPhases: Array.isArray(parsed.completedPhases)
        ? (parsed.completedPhases.filter((p) => (PHASES as readonly string[]).includes(p)) as PhaseName[])
        : [],
      authSecret: parsed.authSecret,
      server:
        server !== null &&
        typeof server === "object" &&
        typeof server.pid === "number" &&
        typeof server.logPath === "string" &&
        typeof server.apiPort === "number" &&
        typeof server.webPort === "number" &&
        typeof server.apiHost === "string"
          ? {
              pid: server.pid,
              logPath: server.logPath,
              apiPort: server.apiPort,
              webPort: server.webPort,
              apiHost: server.apiHost,
            }
          : null,
    };
  } catch {
    return null;
  }
}

/** The bounded tool-output tail printed on failure (actionable, not a dump). */
export function outputTail(text: string, maxLines = 40): string {
  const trimmed = text.trimEnd();
  const lines = trimmed.split("\n");
  if (lines.length <= maxLines) {
    return trimmed;
  }
  return `[... ${lines.length - maxLines} earlier line(s) elided]\n${lines.slice(-maxLines).join("\n")}`;
}

/* ------------------------------------------------------------------ */
/* The orchestrator                                                     */
/* ------------------------------------------------------------------ */

interface PhaseContext {
  readonly deps: BootstrapDeps;
  readonly config: DemoConfig;
  readonly state: BootstrapState | null;
  /** Phases completed by THIS run (persisted incrementally). */
  completed: PhaseName[];
  /** The background handle started by THIS run (failure teardown). */
  background: BackgroundHandle | null;
  /** The mutable state persisted after each phase. */
  mutable: {
    authSecret: string;
    server: BootstrapState["server"];
  };
}

const GUIDE_TROUBLESHOOTING =
  "  - docs/EVALUATOR-GUIDE.md §5 (Troubleshooting) — the demo's top-failure table";
const INSTALL_TROUBLESHOOTING =
  "  - docs/INSTALL.md §11 (Troubleshooting) — the authoritative install guide";

/** Raised by a failed phase; caught in {@link runDemoBootstrap} after teardown. */
export class BootstrapPhaseError extends Error {
  constructor(
    readonly phase: PhaseName,
    readonly detail: string,
  ) {
    super(`demo phase "${phase}" failed: ${detail.split("\n")[0] ?? ""}`);
    this.name = "BootstrapPhaseError";
  }
}

async function failPhase(ctx: PhaseContext, phase: PhaseName, detail: string): Promise<never> {
  ctx.deps.fail("");
  ctx.deps.fail(`demo: FAILED at phase "${phase}"`);
  for (const line of detail.split("\n")) {
    ctx.deps.fail(`  ${line}`);
  }
  ctx.deps.fail("");
  ctx.deps.fail("  troubleshooting:");
  ctx.deps.fail(GUIDE_TROUBLESHOOTING);
  ctx.deps.fail(INSTALL_TROUBLESHOOTING);
  // Teardown happens BEFORE the failure surfaces: a failed phase never
  // leaves a half-started server holding ports.
  await teardownBackground(ctx);
  throw new BootstrapPhaseError(phase, detail);
}

async function teardownBackground(ctx: PhaseContext): Promise<void> {
  if (ctx.background !== null) {
    ctx.deps.log("demo: cleanup — stopping the server this run started (no half-started runtime)");
    await ctx.background.stop();
    ctx.background = null;
    ctx.mutable.server = null;
  }
}

function persistState(ctx: PhaseContext): void {
  const state: BootstrapState = {
    schemaVersion: 1,
    completedPhases: ctx.completed,
    authSecret: ctx.mutable.authSecret,
    server: ctx.mutable.server,
  };
  try {
    ctx.deps.fs.mkdirs(ctx.config.dataDir);
    ctx.deps.fs.writeFile(ctx.config.statePath, `${JSON.stringify(state, null, 2)}\n`);
  } catch (error) {
    // The state file is an idempotency HINT, never a gate: a write failure
    // is reported but never fails the demo.
    ctx.deps.fail(`demo: note — could not persist the bootstrap state file (${String(error)})`);
  }
}

function phaseBanner(ctx: PhaseContext, index: number, name: PhaseName): void {
  ctx.deps.log("");
  ctx.deps.log(`==> demo: phase ${index + 1}/${PHASES.length} — ${name}`);
}

function phaseNote(ctx: PhaseContext, text: string): void {
  for (const line of text.split("\n")) {
    ctx.deps.log(`    ${line}`);
  }
}

/** Phase 1 — prerequisites. */
async function phasePrerequisites(ctx: PhaseContext): Promise<void> {
  const { deps, config } = ctx;

  // Bun ≥ 1.2 (docs/INSTALL.md §1 — the single runtime/toolchain).
  const version = await deps.runCommand({ cmd: [process.execPath, "--version"], cwd: ROOT });
  const versionText = `${version.stdout}${version.stderr}`.trim();
  const match = /(\d+)\.(\d+)/.exec(versionText);
  if (version.exitCode !== 0 || match === null) {
    await failPhase(
      ctx,
      "prerequisites",
      `Bun is not runnable (${versionText || `exit code ${version.exitCode}`}).\n` +
        "  Install Bun ≥ 1.2 — https://bun.sh/docs/install — then re-run `bun run demo`.",
    );
    return; // unreachable — failPhase throws
  }
  const major = Number.parseInt(match[1] ?? "0", 10);
  const minor = Number.parseInt(match[2] ?? "0", 10);
  if (major < 1 || (major === 1 && minor < 2)) {
    await failPhase(
      ctx,
      "prerequisites",
      `Bun ${versionText} is too old — AISE requires Bun ≥ 1.2 (docs/INSTALL.md §1).\n` +
        "  Upgrade: https://bun.sh/docs/install",
    );
  }
  phaseNote(ctx, `bun ${versionText} (≥ 1.2 required)`);

  // Ports: free, or held by the demo's OWN already-running server.
  const ours = await demoServerAlreadyUp(ctx);
  if (ours !== null) {
    phaseNote(
      ctx,
      `ports ${config.apiPort}/${config.webPort} are held by the running demo server (pid ${ours}) — idempotent re-run`,
    );
    return;
  }
  for (const [label, host, port, altHost] of [
    ["API", config.apiHost === "0.0.0.0" || config.apiHost === "::" ? "127.0.0.1" : config.apiHost, config.apiPort, "localhost"],
    ["web", "localhost", config.webPort, "127.0.0.1"],
    ["smoke scratch", "127.0.0.1", config.smokePort, "localhost"],
  ] as const) {
    // Probe both loopback spellings: vite preview may bind ::1 (IPv6
    // localhost) or 127.0.0.1 depending on the OS resolver's order.
    if ((await deps.portAnswers(host, port)) || (await deps.portAnswers(altHost, port))) {
      await failPhase(
        ctx,
        "prerequisites",
        `port ${port} (${label}) is already in use by another process.\n` +
          "  Stop that process, or change the port in your root .env\n" +
          "  (PORT for the API, AISE_WEB_PORT for the web app — docs/INSTALL.md §10 Ports and URLs).\n" +
          `  The smoke scratch port ${config.smokePort} is fixed (docs/INSTALL.md §8).`,
      );
    }
  }
  phaseNote(ctx, `ports ${config.apiPort} (API), ${config.webPort} (web), ${config.smokePort} (smoke) are free`);
}

/**
 * The recorded pid when the demo's own server is already answering: the
 * state file records a server on THESE ports AND the API's /healthz
 * answers as aise-api. Never guesses — an unknown holder of a port is a
 * prerequisite failure, not a skip.
 */
async function demoServerAlreadyUp(ctx: PhaseContext): Promise<number | null> {
  const { deps, config, state } = ctx;
  if (state === null || state.server === null) {
    return null;
  }
  if (state.server.apiPort !== config.apiPort || state.server.webPort !== config.webPort) {
    return null;
  }
  const health = await deps.fetchText(config.apiHealthUrl);
  if (health === null || !health.includes('"service":"aise-api"') || !health.includes('"ok":true')) {
    return null;
  }
  return state.server.pid;
}

/** Phase 2 — install. */
async function phaseInstall(ctx: PhaseContext): Promise<void> {
  const { deps } = ctx;
  const binDir = join(ROOT, "node_modules", ".bin");
  if (deps.fs.exists(binDir)) {
    phaseNote(ctx, "skipped — node_modules/ already present (phase probe)");
    return;
  }
  phaseNote(ctx, "bun install (node_modules/ absent)");
  const result = await deps.runCommand({ cmd: ["bun", "install"], cwd: ROOT });
  if (result.exitCode !== 0) {
    await failPhase(
      ctx,
      "install",
      `bun install exited with code ${result.exitCode}.\n${indent(outputTail(result.stdout + result.stderr))}\n` +
        "  See docs/INSTALL.md §11 (Troubleshooting) — 'bun install fails with a lockfile mismatch'.",
    );
  }
  phaseNote(ctx, "dependencies installed");
}

/** Phase 3 — environment validation (with the demo-safe overlay). */
async function phaseEnv(ctx: PhaseContext): Promise<void> {
  const { deps, config } = ctx;
  phaseNote(
    ctx,
    "demo-safe defaults: AISE_DATA_DIR=data/demo, AISE_AUTH=1 (demo-open), generated AUTH_SECRET — no real credentials",
  );
  const result = await deps.runCommand({
    cmd: [process.execPath, "tools/validate-env.ts", "--mode", "start"],
    cwd: ROOT,
    env: config.envOverlay,
  });
  for (const line of result.stdout.trim().split("\n")) {
    if (line !== "") {
      deps.log(`    ${line}`);
    }
  }
  if (result.exitCode !== 0) {
    const combined = result.stdout + result.stderr;
    const hint = combined.includes("DATABASE_URL")
      ? "  DATABASE_URL note: the demo never drops your environment — a set-but-invalid\n" +
        "  DATABASE_URL (e.g. exported by another project) must be unset for the local demo:\n" +
        "      env -u DATABASE_URL bun run demo\n" +
        "  …or pointed at a real Postgres/Neon URL for Postgres mode (docs/INSTALL.md §13).\n"
      : "";
    await failPhase(
      ctx,
      "env",
      `environment validation failed (exit code ${result.exitCode}).\n${indent(outputTail(combined))}\n${hint}` +
        "  The validator's message names the exact variable (never your value) — fix it\n" +
        "  in the repository root .env and re-run `bun run demo` (docs/INSTALL.md §4).",
    );
  }
  phaseNote(ctx, "environment valid for the demo overlay");
}

/** Phases 4/5 — migrate/seed: run only in Postgres mode, honest skip otherwise. */
async function phaseDatabase(ctx: PhaseContext, name: "migrate" | "seed"): Promise<void> {
  const { deps, config } = ctx;
  const script = name === "migrate" ? "tools/db-migrate.ts" : "tools/db-seed.ts";
  const npmName = name === "migrate" ? "db:migrate" : "db:seed";
  if (!config.databaseMode) {
    phaseNote(
      ctx,
      `skipped — DATABASE_URL is unset: the demo runs in local-FS mode (no database, no\n` +
        "    migrations, no seeding — docs/INSTALL.md §13 Persistence). Set DATABASE_URL to a\n" +
        "    Neon/Postgres URL to switch the demo to Postgres mode.",
    );
    return;
  }
  phaseNote(ctx, `DATABASE_URL is set — ${npmName} (ordered, versioned, idempotent)`);
  const result = await deps.runCommand({
    cmd: [process.execPath, script],
    cwd: ROOT,
    env: config.envOverlay,
  });
  for (const line of outputTail(result.stdout, 8).split("\n")) {
    if (line !== "") {
      deps.log(`    ${line}`);
    }
  }
  if (result.exitCode !== 0) {
    await failPhase(
      ctx,
      name,
      `bun run ${npmName} exited with code ${result.exitCode}.\n${indent(outputTail(result.stdout + result.stderr))}\n` +
        "  The migration/seed runner's message above is authoritative\n" +
        "  (docs/INSTALL.md §13 — Migrations and the demo seed).",
    );
  }
  phaseNote(ctx, `${npmName} applied`);
}

/** Phase 6 — build. */
async function phaseBuild(ctx: PhaseContext): Promise<void> {
  const { deps } = ctx;
  const webDist = join(ROOT, "apps/web/dist/index.html");
  const serverless = join(ROOT, "api", "[...path].mjs");
  if (deps.fs.exists(webDist) && deps.fs.exists(serverless)) {
    phaseNote(ctx, "skipped — apps/web/dist/index.html + api/[...path].mjs present (phase probe)");
    return;
  }
  phaseNote(ctx, "bun run build (web bundle + the committed serverless beacon)");
  const result = await deps.runCommand({
    cmd: ["bun", "run", "build"],
    cwd: ROOT,
    env: ctx.config.envOverlay,
  });
  if (result.exitCode !== 0 || !deps.fs.exists(webDist)) {
    await failPhase(
      ctx,
      "build",
      `bun run build failed (exit code ${result.exitCode}).\n${indent(outputTail(result.stdout + result.stderr))}\n` +
        "  A build that succeeds without its artifacts is a failure (tools/build.ts) —\n" +
        "  re-run `bun run build` directly for the full output (docs/INSTALL.md §7).",
    );
  }
  phaseNote(ctx, "BUILD: PASS");
}

const HEALTH_TIMEOUT_MS = 90000;
const WEB_TIMEOUT_MS = 30000;
const POLL_MS = 250;

/** Phase 7 — start (detached background + bounded health wait). */
async function phaseStart(ctx: PhaseContext): Promise<void> {
  const { deps, config } = ctx;
  const already = await demoServerAlreadyUp(ctx);
  if (already !== null) {
    phaseNote(ctx, `skipped — the demo server is already answering (pid ${already})`);
    // Carry the prior server record into THIS run's state (a re-run must
    // never lose the pid that --stop / --fresh teardown needs).
    if (ctx.state !== null && ctx.state.server !== null) {
      ctx.mutable.server = ctx.state.server;
    }
    return;
  }
  phaseNote(ctx, "bun tools/start.ts in the background (log: data/demo/server.log)");
  const handle = await deps.startBackground(
    { cmd: [process.execPath, "tools/start.ts"], cwd: ROOT, env: config.envOverlay },
    config.serverLogPath,
  );
  ctx.background = handle;
  ctx.mutable.server = {
    pid: handle.pid,
    logPath: config.serverLogPath,
    apiPort: config.apiPort,
    webPort: config.webPort,
    apiHost: config.apiHost,
  };
  persistState(ctx);

  // Health wait on the smoke endpoints (/healthz + /readyz) of the STARTED server.
  const started = deps.now();
  let healthy = false;
  while (deps.now() - started < HEALTH_TIMEOUT_MS) {
    const health = await deps.fetchText(config.apiHealthUrl);
    if (health !== null && health.includes('"ok":true')) {
      const ready = await deps.fetchText(config.apiReadyUrl);
      if (ready !== null && ready.includes('"ok":true')) {
        healthy = true;
        break;
      }
    }
    await deps.sleep(POLL_MS);
  }
  if (!healthy) {
    await failPhase(
      ctx,
      "start",
      `the server did not become healthy within ${HEALTH_TIMEOUT_MS / 1000}s (${config.apiHealthUrl}).\n` +
        `${indent(serverLogTail(ctx))}`,
    );
  }
  phaseNote(ctx, `API healthy — ${config.apiHealthUrl}`);

  // The web preview (vite preview) binds localhost (either loopback family
  // depending on the OS) — probe both spellings, bounded.
  const webStarted = deps.now();
  let webUp = false;
  while (deps.now() - webStarted < WEB_TIMEOUT_MS) {
    const page =
      (await deps.fetchText(config.webAppUrl)) ??
      (await deps.fetchText(config.webAppUrl.replace("localhost", "127.0.0.1")));
    if (page !== null && page.includes("<")) {
      webUp = true;
      break;
    }
    await deps.sleep(POLL_MS);
  }
  if (!webUp) {
    await failPhase(
      ctx,
      "start",
      `the web preview did not answer within ${WEB_TIMEOUT_MS / 1000}s (${config.webAppUrl}).\n${indent(serverLogTail(ctx))}`,
    );
  }
  phaseNote(ctx, `web serving — ${config.webAppUrl}`);
}

function serverLogTail(ctx: PhaseContext): string {
  const raw = ctx.deps.fs.readFile(ctx.config.serverLogPath);
  const text = raw === null ? "(no server log yet)" : outputTail(raw, 25);
  return `server log (data/demo/server.log) — last lines:\n${indent(text)}\n` +
    "  The API prints its own failure reason there (port conflicts, env issues,\n" +
    "  a bad DATABASE_URL). Inspect it with: tail -40 data/demo/server.log";
}

/** Phase 8 — smoke (always re-run: the proof of life). */
async function phaseSmoke(ctx: PhaseContext): Promise<void> {
  const { deps } = ctx;
  phaseNote(ctx, "bun run smoke — the real end-to-end runtime check (scratch port 8787)");
  const result = await deps.runCommand({ cmd: ["bun", "run", "smoke"], cwd: ROOT, env: ctx.config.envOverlay });
  const combined = result.stdout + result.stderr;
  for (const line of outputTail(result.stdout, 12).split("\n")) {
    if (line !== "") {
      deps.log(`    ${line}`);
    }
  }
  if (result.exitCode !== 0 || !combined.includes("SMOKE: PASS")) {
    await failPhase(
      ctx,
      "smoke",
      `bun run smoke exited with code ${result.exitCode}.\n${indent(outputTail(combined))}\n` +
        "  The smoke is self-cleaning; the most common cause is a leftover process on\n" +
        "  the scratch port 8787 (docs/INSTALL.md §11 — 'smoke fails with port 8787 in use').",
    );
  }
  phaseNote(ctx, "the real runtime passed the end-to-end smoke");
}

/** Phase 9 — the evaluator entry block, then exit (server stays up). */
function printEntry(ctx: PhaseContext, elapsedMs: number): void {
  const { deps, config } = ctx;
  deps.log("");
  deps.log("==> demo: READY — the evaluator entry points");
  deps.log("");
  deps.log(`    web app      → ${config.webAppUrl}`);
  deps.log(`    demo path    → ${config.demoPathUrl}   (Projects → “Demo — Interactive Solution”)`);
  deps.log(`    API health   → ${config.apiHealthUrl}`);
  deps.log("    server log   → data/demo/server.log (relative to the repository root)");
  deps.log(`    guide        → ${config.guidePath} — the 10-minute evaluator walkthrough`);
  deps.log("");
  deps.log("    Known limitation at this commit: the LOCAL web bundle renders blank in plain");
  deps.log("    browsers (an escalated PROD-026 finding — see the guide §5/§6). The phases above");
  deps.log("    prove the real runtime; the visual product experience is the deployed URL in");
  deps.log("    the guide. The demo server keeps running in the background — stop it with");
  deps.log("    `bun run demo --stop`; tear everything down and re-run with `--fresh`.");
  deps.log("");
  deps.log(`DEMO: READY (8/8 phases, ${(elapsedMs / 1000).toFixed(1)}s)`);
}

function indent(text: string): string {
  return text
    .trimEnd()
    .split("\n")
    .map((line) => `  | ${line}`)
    .join("\n");
}

/** Best-effort teardown of a recorded demo server (SIGTERM → SIGKILL). */
async function stopDemoServer(deps: BootstrapDeps, pid: number): Promise<void> {
  if (pid <= 0) {
    return;
  }
  // The detached process GROUP first (the whole server tree: the start
  // supervisor plus its API + web children), the leader alone as fallback.
  const signaled = deps.kill(-pid, "SIGTERM") || deps.kill(pid, "SIGTERM");
  if (!signaled) {
    return; // already gone
  }
  for (let i = 0; i < 30; i += 1) {
    await deps.sleep(100);
    if (!deps.kill(-pid, "0") && !deps.kill(pid, "0")) {
      return; // exited
    }
  }
  // Bounded escalation — best effort, never an error when already gone.
  deps.kill(-pid, "SIGKILL");
  deps.kill(pid, "SIGKILL");
}

function randomBytesHex(): string {
  return randomBytes(32).toString("hex");
}

/**
 * The full orchestrated run (pure with respect to `deps` — deterministic
 * under the injected test doubles).
 */
export async function runDemoBootstrap(
  deps: BootstrapDeps,
  options: BootstrapOptions,
): Promise<BootstrapOutcome> {
  const started = deps.now();
  deps.log("AISE demo bootstrap (PROD-014) — one command from a fresh checkout to the working product");
  if (options.fresh) {
    deps.log("flag: --fresh — tearing down the demo state and re-running from zero");
  }

  const baseConfig = deriveDemoConfig(deps.env, "");

  if (options.fresh) {
    // Stop the recorded server (best-effort), then remove the demo dir.
    const prior = readState(deps.fs, baseConfig.statePath);
    if (prior !== null && prior.server !== null) {
      deps.log(`demo: --fresh — stopping the recorded demo server (pid ${prior.server.pid})`);
      await stopDemoServer(deps, prior.server.pid);
    }
    deps.fs.removeDir(baseConfig.dataDir);
    deps.log("demo: --fresh — removed data/demo (the demo's own scratch directory)");
  }

  const priorState = readState(deps.fs, baseConfig.statePath);
  const authSecret = priorState !== null && priorState.authSecret.length >= 32 ? priorState.authSecret : randomBytesHex();

  const config = deriveDemoConfig(deps.env, authSecret);
  const ctx: PhaseContext = {
    deps,
    config,
    state: priorState,
    completed: [],
    background: null,
    mutable: { authSecret, server: null },
  };

  deps.fs.mkdirs(config.dataDir);

  const runners: ReadonlyArray<{ name: PhaseName; run: (ctx: PhaseContext) => Promise<void> }> = [
    { name: "prerequisites", run: phasePrerequisites },
    { name: "install", run: phaseInstall },
    { name: "env", run: phaseEnv },
    { name: "migrate", run: (c) => phaseDatabase(c, "migrate") },
    { name: "seed", run: (c) => phaseDatabase(c, "seed") },
    { name: "build", run: phaseBuild },
    { name: "start", run: phaseStart },
    { name: "smoke", run: phaseSmoke },
  ];

  try {
    for (let index = 0; index < runners.length; index += 1) {
      const phase = runners[index]!;
      phaseBanner(ctx, index, phase.name);
      await phase.run(ctx);
      ctx.completed.push(phase.name);
      persistState(ctx);
    }
  } catch (error) {
    if (error instanceof BootstrapPhaseError) {
      // The failure block + teardown already happened in failPhase; record
      // the phases that DID complete (a re-run resumes from there).
      persistState(ctx);
      return { failedPhase: error.phase, exitCode: 1 };
    }
    throw error; // a programming error is loud, never swallowed
  }

  printEntry(ctx, deps.now() - started);
  return { failedPhase: null, exitCode: 0 };
}

/** `--stop`: stop the recorded background demo server. */
export async function stopDemo(deps: BootstrapDeps): Promise<number> {
  const config = deriveDemoConfig(deps.env, "");
  const state = readState(deps.fs, config.statePath);
  if (state === null || state.server === null) {
    deps.log("demo: --stop — no recorded demo server (nothing to stop). The demo state file is");
    deps.log("      data/demo/.bootstrap-state.json; a server started outside the bootstrap is");
    deps.log("      not ours to stop (stop it yourself, or `bun run demo --fresh` for a clean re-run).");
    return 0;
  }
  deps.log(`demo: --stop — stopping the demo server (pid ${state.server.pid})`);
  await stopDemoServer(deps, state.server.pid);
  deps.log("demo: --stop — stopped (web + API torn down through their supervisor)");
  return 0;
}

/* ------------------------------------------------------------------ */
/* Real dependencies (processes, ports, files). Everything above is     */
/* injectable and unit-tested WITHOUT touching any of this.            */
/* ------------------------------------------------------------------ */

function makeRealDeps(): BootstrapDeps {
  const decoder = new TextDecoder();

  function runCommand(spec: CommandSpec): Promise<CommandResult> {
    return new Promise((resolveRun) => {
      const proc = Bun.spawnSync({
        cmd: [...spec.cmd],
        cwd: spec.cwd,
        env: spec.env === undefined ? process.env : { ...process.env, ...spec.env },
        stdout: "pipe",
        stderr: "pipe",
      });
      resolveRun({
        exitCode: proc.exitCode ?? 1,
        stdout: decoder.decode(proc.stdout),
        stderr: decoder.decode(proc.stderr),
      });
    });
  }

  async function startBackground(spec: CommandSpec, logPath: string): Promise<BackgroundHandle> {
    // node:child_process with detached:true puts the server into its OWN
    // process group: it survives the bootstrap exiting (the demo keeps
    // serving after `bun run demo` returns) and its teardown is always an
    // explicit group signal (SIGTERM/SIGKILL on -pid). Output goes to the
    // demo log file — an inherited fd, never a pipe (a pipe would fill and
    // wedge the server once the bootstrap exits).
    mkdirSync(dirname(logPath), { recursive: true });
    const fd = openSync(logPath, "a");
    let child: ChildProcess;
    try {
      child = spawn(spec.cmd[0] ?? process.execPath, [...spec.cmd.slice(1)], {
        cwd: spec.cwd,
        env: spec.env === undefined ? process.env : { ...process.env, ...spec.env },
        detached: true,
        stdio: ["ignore", fd, fd],
      });
    } finally {
      closeSync(fd); // the child duplicated the descriptor
    }
    child.unref();
    const pid = child.pid ?? -1;
    return {
      pid,
      stop: (): Promise<void> => stopDemoServer(deps, pid),
    };
  }

  function portAnswers(host: string, port: number): Promise<boolean> {
    return new Promise((resolvePort) => {
      const socket = netConnect({ host, port });
      let settled = false;
      const finish = (result: boolean): void => {
        if (!settled) {
          settled = true;
          socket.destroy();
          resolvePort(result);
        }
      };
      socket.setTimeout(1000, () => {
        finish(true); // ambiguous/occupied — never a false "free"
      });
      socket.once("connect", () => {
        finish(true);
      });
      socket.once("error", () => {
        finish(false);
      });
    });
  }

  async function fetchText(url: string): Promise<string | null> {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(2000) });
      return await response.text();
    } catch {
      return null;
    }
  }

  function realSleep(ms: number): Promise<void> {
    return new Promise<void>((resolveSleep) => {
      setTimeout(resolveSleep, ms);
    });
  }

  const deps: BootstrapDeps = {
    runCommand,
    startBackground,
    portAnswers,
    fetchText,
    sleep: realSleep,
    now: () => Date.now(),
    kill: (pid, signal) => {
      try {
        process.kill(pid, signal === "0" ? 0 : signal);
        return true;
      } catch {
        return false;
      }
    },
    fs: {
      exists: (path) => existsSync(path),
      readFile: (path) => {
        try {
          return readFileSync(path, "utf8");
        } catch {
          return null;
        }
      },
      writeFile: (path, content) => {
        mkdirSync(dirname(path), { recursive: true });
        writeFileSync(path, content);
      },
      removeDir: (path) => {
        rmSync(path, { recursive: true, force: true });
      },
      mkdirs: (path) => {
        mkdirSync(path, { recursive: true });
      },
      list: (path) => {
        try {
          return readdirSync(path);
        } catch {
          return [];
        }
      },
    },
    env: process.env,
    log: (line) => {
      console.log(line);
    },
    fail: (line) => {
      console.error(line);
    },
  };
  return deps;
}

interface ParsedArgs {
  readonly fresh: boolean;
  readonly stop: boolean;
}

function parseArgs(argv: readonly string[]): ParsedArgs | "help" | null {
  const flags = new Set(argv.filter((arg) => arg.startsWith("--")));
  const known = new Set(["--fresh", "--stop", "--help"]);
  const unknown = [...flags].filter((flag) => !known.has(flag));
  if (unknown.length > 0) {
    console.error(`bootstrap: unknown flag(s): ${unknown.join(" ")}\nusage: bun tools/bootstrap.ts [--fresh] [--stop]`);
    return null;
  }
  if (flags.has("--help")) {
    console.log("usage: bun tools/bootstrap.ts [--fresh] [--stop]");
    console.log("  --fresh  tear down the demo state (data/demo) and re-run all phases from zero");
    console.log("  --stop   stop the background demo server started by a previous run");
    console.log("");
    console.log("Phases: prerequisites → install → env → migrate → seed → build → start → smoke → entry URLs");
    console.log("The demo server keeps running in the background after the command exits.");
    return "help";
  }
  if (flags.has("--fresh") && flags.has("--stop")) {
    console.error("bootstrap: --fresh and --stop are mutually exclusive");
    return null;
  }
  return { fresh: flags.has("--fresh"), stop: flags.has("--stop") };
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  if (options === null) {
    process.exit(2); // usage error
  }
  if (options === "help") {
    process.exit(0);
  }
  const deps = makeRealDeps();
  if (options.stop) {
    process.exit(await stopDemo(deps));
  }
  const outcome = await runDemoBootstrap(deps, { fresh: options.fresh });
  process.exit(outcome.exitCode);
}

if (process.argv[1] !== undefined && process.argv[1].endsWith("bootstrap.ts")) {
  void main();
}
