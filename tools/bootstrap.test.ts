/**
 * PROD-014 — deterministic bootstrap tests.
 *
 * The orchestrator's entire effect surface is injected (`BootstrapDeps`):
 * every test below runs against in-memory fakes — no network, no ports, no
 * processes, no real filesystem writes, no clock (sleep is a no-op; health
 * waits resolve immediately). The suite pins the PROD-014 contract:
 *
 *   - phase ORDERING (the exact delegated commands, in order, for a fresh
 *     run — including the honest migrate/seed skip in local-FS mode and
 *     the real db phases in Postgres mode);
 *   - IDEMPOTENCY (probe-based skips on re-run: install/build/start) and
 *     the state file's role (completed phases, AUTH_SECRET reuse, the
 *     server pid carryover);
 *   - FAILURE MODES (fail-fast at the failing phase, the actionable
 *     troubleshooting pointers, the tool's output tail, and the
 *     never-leave-a-half-started-server teardown);
 *   - URL PRINTING (the evaluator entry block: web app, demo path, API
 *     health, guide link);
 *   - --fresh (teardown + full re-run from zero) and --stop semantics;
 *   - the env overlay's fill-only-missing discipline.
 */

import { describe, expect, test } from "bun:test";
import { resolve } from "node:path";
import {
  deriveDemoConfig,
  outputTail,
  readState,
  runDemoBootstrap,
  stopDemo,
  PHASES,
  type BackgroundHandle,
  type BootstrapDeps,
  type CommandResult,
  type CommandSpec,
} from "./bootstrap";

/* ------------------------------------------------------------------ */
/* Deterministic fakes                                                  */
/* ------------------------------------------------------------------ */

/** A fake pid that no real process can hold (near Linux pid_max). */
const GONE_PID = 4194301;
/** The pid the fake startBackground always uses. */
const FAKE_SERVER_PID = 4242;

interface FakeWorld {
  /** Files: repo-relative path → content (the fake filesystem). */
  files: Map<string, string>;
  /** Directories that exist (probe targets like node_modules/.bin). */
  dirs: Set<string>;
  /** Every delegated command, in order. */
  commands: CommandSpec[];
  /** Scripted results, matched by substring of the joined command. */
  results: Map<string, CommandResult>;
  /** True once the scripted server is "up" (health URL answers). */
  serverUp: boolean;
  /** Background handles started (recorded for teardown assertions). */
  started: BackgroundHandle[];
  /** Pids the fake considers alive (both signs are honored on lookup). */
  alivePids: Set<number>;
  /** Ports scripted as occupied. */
  occupiedPorts: Set<number>;
  logs: string[];
  fails: string[];
}

function defaultResults(): Map<string, CommandResult> {
  const ok = (stdout: string): CommandResult => ({ exitCode: 0, stdout, stderr: "" });
  return new Map<string, CommandResult>([
    ["--version", ok("1.2.42\n")],
    ["bun install", ok("installed 286 packages\n")],
    ["validate-env.ts", ok("AISE environment validation (mode: start)\n  AISE_DATA_DIR ok\nENV: PASS\n")],
    ["db-migrate.ts", ok("db:migrate: applied 0 pending (already current)\n")],
    ["db-seed.ts", ok("db:seed: demo records present (idempotent)\n")],
    ["bun run build", ok("BUILD: PASS (apps/web/dist/index.html, api/[...path].mjs)\n")],
    ["bun run smoke", ok("smoke: scratch data dir /tmp/x\n  pass  GET /healthz\nSMOKE: PASS\n")],
  ]);
}

/** Repo-relative normalization so fake seeds and real probe paths agree. */
const TEST_ROOT = resolve(import.meta.dir, "..");
const relPath = (path: string): string => (path.startsWith(TEST_ROOT) ? path.slice(TEST_ROOT.length + 1) : path);

function makeFakeDeps(world: FakeWorld, env: Record<string, string | undefined> = {}): BootstrapDeps {
  let clock = 0;
  /** Simulate the REAL side effects of successful phase commands. */
  function applySideEffects(spec: CommandSpec, exitCode: number): void {
    const joined = spec.cmd.join(" ");
    if (exitCode === 0 && joined === "bun install") {
      world.dirs.add("node_modules/.bin");
    }
    if (exitCode === 0 && joined === "bun run build") {
      world.files.set("apps/web/dist/index.html", "<!doctype html>");
      world.files.set("api/[...path].mjs", "// beacon");
    }
  }

  return {
    runCommand: async (spec) => {
      world.commands.push(spec);
      const joined = spec.cmd.join(" ");
      for (const [needle, result] of world.results) {
        if (joined.includes(needle)) {
          applySideEffects(spec, result.exitCode);
          return result;
        }
      }
      applySideEffects(spec, 0);
      return { exitCode: 0, stdout: "", stderr: "" };
    },
    startBackground: async (spec, logPath) => {
      world.commands.push(spec);
      world.files.set(relPath(logPath), "server log line\n");
      let stopped = false;
      const handle: BackgroundHandle = {
        pid: FAKE_SERVER_PID,
        stop: async () => {
          stopped = true;
          world.serverUp = false;
          world.alivePids.delete(FAKE_SERVER_PID);
          world.alivePids.delete(-FAKE_SERVER_PID);
        },
      };
      Object.defineProperty(handle, "stopped", {
        get: (): boolean => stopped,
        configurable: true,
      });
      world.started.push(handle);
      world.alivePids.add(FAKE_SERVER_PID);
      world.serverUp = true; // the scripted server becomes healthy immediately
      return handle;
    },
    portAnswers: async (_host, port) => world.occupiedPorts.has(port) || (world.serverUp && (port === 8080 || port === 4173)),
    fetchText: async (url) => {
      if (!world.serverUp && world.occupiedPorts.size === 0) {
        return null;
      }
      if (url.endsWith("/healthz")) {
        return world.serverUp ? '{"ok":true,"service":"aise-api","version":"0.1.0"}' : null;
      }
      if (url.endsWith("/readyz")) {
        return world.serverUp ? '{"ok":true}' : null;
      }
      if (url.includes("localhost:")) {
        return world.serverUp ? "<!doctype html><html>…</html>" : null;
      }
      return null;
    },
    sleep: async (ms) => {
      clock += ms; // the deterministic clock advances instead of waiting
    },
    now: () => clock,
    kill: (pid, signal) => {
      if (signal === "0") {
        return world.alivePids.has(pid) || world.alivePids.has(-pid);
      }
      const existed = world.alivePids.has(pid) || world.alivePids.has(-pid);
      world.alivePids.delete(pid);
      world.alivePids.delete(-pid);
      if (existed) {
        world.serverUp = false;
      }
      return existed;
    },
    fs: {
      exists: (path) => {
        const key = relPath(path);
        return world.files.has(key) || world.dirs.has(key);
      },
      readFile: (path) => world.files.get(relPath(path)) ?? null,
      writeFile: (path, content) => {
        world.files.set(relPath(path), content);
      },
      removeDir: (path) => {
        const key = relPath(path);
        for (const candidate of [...world.files.keys()]) {
          if (candidate === key || candidate.startsWith(`${key}/`)) {
            world.files.delete(candidate);
          }
        }
        world.dirs.delete(key);
      },
      mkdirs: () => {
        /* the fake filesystem needs no directories */
      },
      list: (path) => (world.dirs.has(relPath(path)) ? [] : []),
    },
    env,
    log: (line) => {
      world.logs.push(line);
    },
    fail: (line) => {
      world.fails.push(line);
    },
  };
}

function freshWorld(): FakeWorld {
  return {
    files: new Map<string, string>(),
    dirs: new Set<string>(),
    commands: [],
    results: defaultResults(),
    serverUp: false,
    started: [],
    alivePids: new Set<number>(),
    occupiedPorts: new Set<number>(),
    logs: [],
    fails: [],
  };
}

function commandNames(world: FakeWorld): string[] {
  return world.commands.map((spec) => spec.cmd.join(" "));
}

const joinedLogs = (world: FakeWorld): string => world.logs.join("\n");
const joinedFails = (world: FakeWorld): string => world.fails.join("\n");

const configFor = (env: Record<string, string | undefined>): ReturnType<typeof deriveDemoConfig> =>
  deriveDemoConfig(env, "0".repeat(64));

/* ------------------------------------------------------------------ */
/* Phase ordering                                                       */
/* ------------------------------------------------------------------ */

describe("bootstrap: phase ordering (fresh local-FS run)", () => {
  test("delegates the phases to the existing tools, in order, with the demo overlay", async () => {
    const world = freshWorld();
    const deps = makeFakeDeps(world);
    const outcome = await runDemoBootstrap(deps, { fresh: false });
    expect(outcome).toEqual({ failedPhase: null, exitCode: 0 });

    const names = commandNames(world);
    // install → env → (migrate/seed SKIPPED: no DATABASE_URL) → build → start → smoke
    expect(names).toEqual([
      expect.stringContaining("--version"),
      "bun install",
      expect.stringContaining("tools/validate-env.ts --mode start"),
      "bun run build",
      expect.stringContaining("tools/start.ts"),
      "bun run smoke",
    ]);

    // Every phase banner appears, in order.
    let cursor = -1;
    for (let i = 0; i < PHASES.length; i += 1) {
      const banner = `==> demo: phase ${i + 1}/${PHASES.length} — ${PHASES[i]}`;
      const at = joinedLogs(world).indexOf(banner);
      expect(at).toBeGreaterThan(cursor);
      cursor = at;
    }

    // The migrate/seed phases ran as honest documented skips.
    expect(joinedLogs(world)).toContain('phase 4/8 — migrate');
    expect(joinedLogs(world)).toContain("skipped — DATABASE_URL is unset");
    expect(joinedLogs(world)).toContain('phase 5/8 — seed');
    expect(commandNames(world).some((n) => n.includes("db-migrate"))).toBe(false);
    expect(commandNames(world).some((n) => n.includes("db-seed"))).toBe(false);
  });

  test("Postgres mode (DATABASE_URL set): migrate and seed run for real, between env and build", async () => {
    const world = freshWorld();
    const deps = makeFakeDeps(world, { DATABASE_URL: "postgres://user:pw@host-pooler.example/db?sslmode=require" });
    const outcome = await runDemoBootstrap(deps, { fresh: false });
    expect(outcome.exitCode).toBe(0);

    const names = commandNames(world);
    const envAt = names.findIndex((n) => n.includes("validate-env"));
    const migrateAt = names.findIndex((n) => n.includes("db-migrate.ts"));
    const seedAt = names.findIndex((n) => n.includes("db-seed.ts"));
    const buildAt = names.findIndex((n) => n === "bun run build");
    expect(migrateAt).toBeGreaterThan(envAt);
    expect(seedAt).toBeGreaterThan(migrateAt);
    expect(buildAt).toBeGreaterThan(seedAt);
    expect(joinedLogs(world)).not.toContain("skipped — DATABASE_URL is unset");
  });

  test("the env and db phases carry the demo overlay; AISE_DATA_DIR is the demo scratch dir", async () => {
    const world = freshWorld();
    const deps = makeFakeDeps(world);
    await runDemoBootstrap(deps, { fresh: false });

    const envPhase = world.commands.find((c) => c.cmd.join(" ").includes("validate-env"));
    expect(envPhase).toBeDefined();
    expect(envPhase?.env?.["AISE_DATA_DIR"]).toEndWith("data/demo");
    expect(envPhase?.env?.["AISE_AUTH"]).toBe("1");
    expect(envPhase?.env?.["AUTH_SECRET"]).toBeDefined();
    expect((envPhase?.env?.["AUTH_SECRET"] ?? "").length).toBeGreaterThanOrEqual(32);

    const startPhase = world.commands.find((c) => c.cmd.join(" ").includes("tools/start.ts"));
    expect(startPhase?.env?.["AISE_DATA_DIR"]).toEndWith("data/demo");
  });
});

/* ------------------------------------------------------------------ */
/* Idempotency                                                          */
/* ------------------------------------------------------------------ */

describe("bootstrap: idempotency (already-bootstrapped checkout)", () => {
  test("re-run skips install/build/start (probes) and keeps env + smoke", async () => {
    const world = freshWorld();
    // A prior bootstrap's observable side effects:
    world.dirs.add("node_modules/.bin"); // node_modules present (probe target)
    const config = configFor({});
    world.files.set(
      relPath(config.statePath),
      JSON.stringify({
        schemaVersion: 1,
        completedPhases: [...PHASES],
        authSecret: "a".repeat(64),
        server: { pid: GONE_PID, logPath: config.serverLogPath, apiPort: 8080, webPort: 4173, apiHost: "127.0.0.1" },
      }),
    );
    world.files.set("apps/web/dist/index.html", "<html></html>"); // build artifacts present
    world.files.set("api/[...path].mjs", "// beacon");
    world.serverUp = true; // the demo server is answering
    world.alivePids.add(GONE_PID);

    const deps = makeFakeDeps(world);
    const outcome = await runDemoBootstrap(deps, { fresh: false });
    expect(outcome.exitCode).toBe(0);

    const names = commandNames(world);
    expect(names.some((n) => n === "bun install")).toBe(false); // skipped
    expect(names.some((n) => n === "bun run build")).toBe(false); // skipped
    expect(names.some((n) => n.includes("tools/start.ts"))).toBe(false); // skipped
    expect(names.some((n) => n.includes("validate-env"))).toBe(true); // drift check re-runs
    expect(names.some((n) => n === "bun run smoke")).toBe(true); // proof of life re-runs

    expect(joinedLogs(world)).toContain("skipped — node_modules/ already present");
    expect(joinedLogs(world)).toContain("skipped — apps/web/dist/index.html + api/[...path].mjs present");
    expect(joinedLogs(world)).toContain("skipped — the demo server is already answering");

    // The server pid is CARRIED OVER (a re-run never loses --stop's target).
    const state = readState(deps.fs, config.statePath);
    expect(state?.server?.pid).toBe(GONE_PID);
    // The prior AUTH_SECRET is reused (sessions survive restarts).
    expect(state?.authSecret).toBe("a".repeat(64));
  });

  test("the AUTH_SECRET is generated once and persisted; the state records every completed phase", async () => {
    const world = freshWorld();
    const deps = makeFakeDeps(world);
    await runDemoBootstrap(deps, { fresh: false });

    const config = configFor({});
    const state = readState(deps.fs, config.statePath);
    expect(state).not.toBeNull();
    expect(state?.completedPhases).toEqual([...PHASES]);
    expect((state?.authSecret ?? "").length).toBe(64);

    // A second run (server down, artifacts present) reuses the same secret.
    world.serverUp = false;
    world.started.length = 0;
    world.commands.length = 0;
    await runDemoBootstrap(deps, { fresh: false });
    const state2 = readState(deps.fs, config.statePath);
    expect(state2?.authSecret).toBe(state?.authSecret);
  });

  test("a corrupt state file is treated as not-bootstrapped (never a hard failure)", async () => {
    const world = freshWorld();
    world.files.set(relPath(configFor({}).statePath), "{not json");
    const deps = makeFakeDeps(world);
    const outcome = await runDemoBootstrap(deps, { fresh: false });
    expect(outcome.exitCode).toBe(0);
    expect(commandNames(world).some((n) => n === "bun install")).toBe(true);
  });
});

/* ------------------------------------------------------------------ */
/* Failure modes                                                        */
/* ------------------------------------------------------------------ */

describe("bootstrap: clean failure", () => {
  test("a failing tool stops the run AT that phase, prints the phase, output tail and pointers", async () => {
    const world = freshWorld();
    world.results.set("bun install", { exitCode: 1, stdout: "", stderr: "error: lockfile mismatch\n" });
    const deps = makeFakeDeps(world);
    const outcome = await runDemoBootstrap(deps, { fresh: false });

    expect(outcome).toEqual({ failedPhase: "install", exitCode: 1 });
    expect(joinedFails(world)).toContain('demo: FAILED at phase "install"');
    expect(joinedFails(world)).toContain("lockfile mismatch"); // the tool's actual output
    expect(joinedFails(world)).toContain("docs/EVALUATOR-GUIDE.md §5 (Troubleshooting)");
    expect(joinedFails(world)).toContain("docs/INSTALL.md §11 (Troubleshooting)");
    // Nothing after the failed phase ran.
    expect(commandNames(world).some((n) => n === "bun run build")).toBe(false);
    expect(commandNames(world).some((n) => n === "bun run smoke")).toBe(false);
    // The state records the phases that DID complete (resume semantics).
    const state = readState(deps.fs, configFor({}).statePath);
    expect(state?.completedPhases).toEqual(["prerequisites"]);
  });

  test("a smoke failure tears down the server THIS run started (no half-started runtime)", async () => {
    const world = freshWorld();
    world.results.set("bun run smoke", { exitCode: 1, stdout: "  FAIL  boot\nSMOKE: FAIL\n", stderr: "" });
    const deps = makeFakeDeps(world);
    const outcome = await runDemoBootstrap(deps, { fresh: false });

    expect(outcome).toEqual({ failedPhase: "smoke", exitCode: 1 });
    expect(world.started.length).toBe(1);
    const handle = world.started[0] as unknown as { stopped: boolean };
    expect(handle.stopped).toBe(true); // the background server was stopped
    expect(joinedLogs(world)).toContain("demo: cleanup — stopping the server this run started");
    // The persisted state no longer claims a running server.
    const state = readState(deps.fs, configFor({}).statePath);
    expect(state?.server).toBeNull();
  });

  test("a health-wait timeout fails the start phase with the server log tail", async () => {
    const world = freshWorld();
    // The started server never becomes healthy:
    world.results.set("bun run smoke", { exitCode: 0, stdout: "SMOKE: PASS\n", stderr: "" });
    const deps = makeFakeDeps(world);
    // fetchText answers null for everything (server never answers).
    deps.fetchText = async () => null;
    const outcome = await runDemoBootstrap(deps, { fresh: false });

    expect(outcome).toEqual({ failedPhase: "start", exitCode: 1 });
    expect(joinedFails(world)).toContain("the server did not become healthy");
    expect(joinedFails(world)).toContain("server log (data/demo/server.log)");
    const handle = world.started[0] as unknown as { stopped: boolean };
    expect(handle.stopped).toBe(true);
  });

  test("an invalid DATABASE_URL fails the env phase with the unset command in the hint", async () => {
    const world = freshWorld();
    world.results.set(
      "validate-env.ts",
      {
        exitCode: 1,
        stdout: "  DATABASE_URL    INVALID    DATABASE_URL: expected a postgres:// URL with a host\nENV: FAIL\n",
        stderr: "  - DATABASE_URL: expected a postgres:// or postgresql:// connection URL with a host\n",
      },
    );
    const deps = makeFakeDeps(world);
    const outcome = await runDemoBootstrap(deps, { fresh: false });

    expect(outcome).toEqual({ failedPhase: "env", exitCode: 1 });
    expect(joinedFails(world)).toContain("env -u DATABASE_URL bun run demo");
    expect(commandNames(world).some((n) => n === "bun run build")).toBe(false);
  });

  test("an old Bun fails prerequisites before anything is installed", async () => {
    const world = freshWorld();
    world.results.set("--version", { exitCode: 0, stdout: "1.1.4\n", stderr: "" });
    const deps = makeFakeDeps(world);
    const outcome = await runDemoBootstrap(deps, { fresh: false });

    expect(outcome).toEqual({ failedPhase: "prerequisites", exitCode: 1 });
    expect(joinedFails(world)).toContain("Bun 1.1.4 is too old");
    expect(commandNames(world).some((n) => n === "bun install")).toBe(false);
  });

  test("a foreign process on the API port fails prerequisites with the port guidance", async () => {
    const world = freshWorld();
    world.occupiedPorts.add(8080); // not our server (no state) — a foreign holder
    const deps = makeFakeDeps(world);
    const outcome = await runDemoBootstrap(deps, { fresh: false });

    expect(outcome).toEqual({ failedPhase: "prerequisites", exitCode: 1 });
    expect(joinedFails(world)).toContain("port 8080 (API) is already in use");
    expect(joinedFails(world)).toContain("PORT for the API, AISE_WEB_PORT for the web app");
  });

  test("a smoke exit 0 without SMOKE: PASS is still a failure (honest verdict parsing)", async () => {
    const world = freshWorld();
    world.results.set("bun run smoke", { exitCode: 0, stdout: "something odd\n", stderr: "" });
    const deps = makeFakeDeps(world);
    const outcome = await runDemoBootstrap(deps, { fresh: false });
    expect(outcome).toEqual({ failedPhase: "smoke", exitCode: 1 });
  });
});

/* ------------------------------------------------------------------ */
/* The evaluator entry URLs                                             */
/* ------------------------------------------------------------------ */

describe("bootstrap: the evaluator entry block", () => {
  test("prints the web app, the demo path, the API health URL and the guide link", async () => {
    const world = freshWorld();
    const deps = makeFakeDeps(world);
    await runDemoBootstrap(deps, { fresh: false });
    const logs = joinedLogs(world);

    expect(logs).toContain("web app      → http://localhost:4173/");
    expect(logs).toContain("demo path    → http://localhost:4173/#/projects");
    expect(logs).toContain("API health   → http://127.0.0.1:8080/healthz");
    expect(logs).toContain("guide        → docs/EVALUATOR-GUIDE.md");
    expect(logs).toContain("DEMO: READY (8/8 phases");
    expect(logs).toContain("bun run demo --stop");
  });

  test("custom ports flow into the printed URLs", async () => {
    const world = freshWorld();
    const deps = makeFakeDeps(world, { PORT: "9191", AISE_WEB_PORT: "5151" });
    await runDemoBootstrap(deps, { fresh: false });
    const logs = joinedLogs(world);
    expect(logs).toContain("http://localhost:5151/");
    expect(logs).toContain("http://127.0.0.1:9191/healthz");
  });
});

/* ------------------------------------------------------------------ */
/* --fresh and --stop                                                   */
/* ------------------------------------------------------------------ */

describe("bootstrap: --fresh and --stop", () => {
  test("--fresh stops the recorded server, removes data/demo and re-runs install/build", async () => {
    const world = freshWorld();
    // A fully bootstrapped prior state with a running server (but NO
    // node_modules / dist — the fresh-checkout shape --fresh proves):
    const config = configFor({});
    const priorState = {
      schemaVersion: 1 as const,
      completedPhases: [...PHASES],
      authSecret: "b".repeat(64),
      server: { pid: GONE_PID, logPath: config.serverLogPath, apiPort: 8080, webPort: 4173, apiHost: "127.0.0.1" },
    };
    world.files.set(relPath(config.statePath), JSON.stringify(priorState));
    world.files.set(relPath(`${config.dataDir}/some-scratch.json`), "{}");
    world.serverUp = true;
    world.alivePids.add(GONE_PID); // the recorded server is alive

    const deps = makeFakeDeps(world);
    const outcome = await runDemoBootstrap(deps, { fresh: true });
    expect(outcome.exitCode).toBe(0);

    expect(joinedLogs(world)).toContain(`--fresh — stopping the recorded demo server (pid ${GONE_PID})`);
    expect(joinedLogs(world)).toContain("removed data/demo");
    // The scratch data under data/demo is gone:
    expect(world.files.has(`${config.dataDir}/some-scratch.json`)).toBe(false);
    // The old state (with its server record) was discarded — a NEW state exists:
    const newState = readState(deps.fs, config.statePath);
    expect(newState?.completedPhases).toEqual([...PHASES]);
    expect(newState?.authSecret).not.toBe("b".repeat(64)); // regenerated (the dir died)
    // install + build + start re-ran from zero:
    const names = commandNames(world);
    expect(names.filter((n) => n === "bun install").length).toBe(1);
    expect(names.filter((n) => n === "bun run build").length).toBe(1);
    expect(names.filter((n) => n.includes("tools/start.ts")).length).toBe(1);
  });

  test("--stop (via stopDemo) reports nothing-to-stop without a recorded server", async () => {
    const world = freshWorld();
    const deps = makeFakeDeps(world);
    const code = await stopDemo(deps);
    expect(code).toBe(0);
    expect(joinedLogs(world)).toContain("no recorded demo server (nothing to stop)");
  });

  test("--stop stops the recorded server", async () => {
    const world = freshWorld();
    const config = configFor({});
    world.files.set(
      relPath(config.statePath),
      JSON.stringify({
        schemaVersion: 1,
        completedPhases: [...PHASES],
        authSecret: "c".repeat(64),
        server: { pid: GONE_PID, logPath: config.serverLogPath, apiPort: 8080, webPort: 4173, apiHost: "127.0.0.1" },
      }),
    );
    world.alivePids.add(GONE_PID);
    const deps = makeFakeDeps(world);
    const code = await stopDemo(deps);
    expect(code).toBe(0);
    expect(joinedLogs(world)).toContain(`--stop — stopping the demo server (pid ${GONE_PID})`);
    expect(joinedLogs(world)).toContain("--stop — stopped");
  });
});

/* ------------------------------------------------------------------ */
/* The env overlay (fill-only-missing)                                  */
/* ------------------------------------------------------------------ */

describe("bootstrap: the demo env overlay", () => {
  test("fill-only-missing: evaluator values win; only absent ones get demo defaults", () => {
    const config = deriveDemoConfig(
      { AISE_AUTH: "0", AUTH_SECRET: "my-own-secret", PORT: "9999" },
      "d".repeat(64),
    );
    expect(config.envOverlay["AISE_AUTH"]).toBe("0"); // their explicit choice stands
    expect(config.envOverlay["AUTH_SECRET"]).toBeUndefined(); // their secret stands
    expect(config.envOverlay["AISE_DATA_DIR"]).toEndWith("data/demo"); // ALWAYS the demo dir
    expect(config.apiPort).toBe(9999);
    expect(config.databaseMode).toBe(false);
  });

  test("unset env → the full demo defaults, local-FS mode", () => {
    const config = deriveDemoConfig({}, "e".repeat(64));
    expect(config.envOverlay["AISE_AUTH"]).toBe("1");
    expect(config.envOverlay["AUTH_SECRET"]).toBe("e".repeat(64));
    expect(config.envOverlay["AISE_DATA_DIR"]).toEndWith("data/demo");
    expect(config.apiPort).toBe(8080);
    expect(config.webPort).toBe(4173);
    expect(config.smokePort).toBe(8787);
    expect(config.databaseMode).toBe(false);
  });

  test("AISE_DATA_DIR from the environment never leaks into the demo config (isolation)", () => {
    const config = deriveDemoConfig({ AISE_DATA_DIR: "/var/real-aise-data" }, "f".repeat(64));
    expect(config.dataDir).toEndWith("data/demo");
    expect(config.envOverlay["AISE_DATA_DIR"]).toEndWith("data/demo");
  });

  test("a valid DATABASE_URL switches databaseMode; a blank one does not", () => {
    expect(deriveDemoConfig({ DATABASE_URL: "postgres://u:p@h/db" }, "g".repeat(64)).databaseMode).toBe(true);
    expect(deriveDemoConfig({ DATABASE_URL: "   " }, "g".repeat(64)).databaseMode).toBe(false);
  });

  test("HOST=0.0.0.0 is probed through 127.0.0.1 (the health URL stays reachable)", () => {
    const config = deriveDemoConfig({ HOST: "0.0.0.0" }, "h".repeat(64));
    expect(config.apiHealthUrl).toContain("127.0.0.1");
  });
});

/* ------------------------------------------------------------------ */
/* Pure helpers                                                         */
/* ------------------------------------------------------------------ */

describe("bootstrap: pure helpers", () => {
  test("outputTail elides only when the output exceeds the bound", () => {
    expect(outputTail("one\ntwo")).toBe("one\ntwo");
    const many = Array.from({ length: 50 }, (_, i) => `line ${i}`).join("\n");
    const tail = outputTail(many, 10);
    expect(tail).toContain("[... 40 earlier line(s) elided]");
    expect(tail).toContain("line 49");
    expect(tail).not.toContain("line 0\n");
  });

  test("readState tolerates absent, corrupt and wrong-schema files", () => {
    const deps = makeFakeDeps(freshWorld());
    expect(readState(deps.fs, "/nope")).toBeNull();
    const world = freshWorld();
    world.files.set("/s", "{oops");
    expect(readState(makeFakeDeps(world).fs, "/s")).toBeNull();
    world.files.set("/s", JSON.stringify({ schemaVersion: 99, authSecret: "x" }));
    expect(readState(makeFakeDeps(world).fs, "/s")).toBeNull();
  });
});
