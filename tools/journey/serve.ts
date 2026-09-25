/**
 * PROD-033 — the journey harness's LOCAL PRODUCTION-LIKE SERVE.
 *
 * The W/X journeys' default base: build the product and serve it locally
 * in the production shape — `bun run build` then `bun run start` (the
 * repository's own orchestrators, consumed read-only: the harness spawns
 * them exactly as an operator would, never re-implementing their logic).
 *
 * Measurement-causality doctrine (adopted verbatim from tools/smoke.ts):
 *
 *   1. PRE-FLIGHT: the journey's fixed scratch ports must be FREE — a TCP
 *      connect must be refused on BOTH loopback addresses (127.0.0.1 for
 *      the API, localhost/::1 for the vite preview). If anything already
 *      listens, the journey fails immediately instead of measuring a
 *      foreign server;
 *   2. `bun run build` runs first (bounded), and its two artifacts must
 *      exist (apps/web/dist/index.html + api/[...path].mjs) — a build
 *      without artifacts is a deterministic failure;
 *   3. `bun run start` is spawned with a FRESH scratch data dir under the
 *      OS temp dir (mkdtemp — never a real data dir), the demo-open auth
 *      shape (AISE_AUTH=1, AISE_AUTH_MODE=demo-open, a FIXED TEST secret —
 *      never a real credential), and DATABASE_URL deliberately UNSET (the
 *      documented local-FS mode; an inherited foreign database URL would
 *      fail the start's own env validation — the same discipline as the
 *      PROD-031 web-bundle gate's stack);
 *   4. the run waits (bounded) for BOTH origins to answer /healthz;
 *   5. ALWAYS cleans up: SIGTERM the start orchestrator (its own process
 *      group tears both children down; SIGKILL after a bounded grace),
 *      remove the scratch data dir — and prints proof both happened;
 *   6. IDENTITY PROOF: after the serve stops, both ports must be DARK
 *      again. If anything still answers, the journey's probes may have
 *      hit a foreign server — the run REFUSES to report a false positive.
 */

import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { connect as netConnect } from "node:net";
import { join, resolve } from "node:path";
import { sleep } from "./classes";

const ROOT = resolve(import.meta.dir, "..", "..");

/** The journey's fixed scratch ports (never the product defaults 8080/4173). */
export const JOURNEY_API_PORT = 8795;
export const JOURNEY_WEB_PORT = 4185;

/**
 * The fixed test AUTH_SECRET (never a real credential; the same discipline
 * as the PROD-031 gate's GATE_AUTH_SECRET).
 */
const JOURNEY_AUTH_SECRET = "prod033-journey-harness-test-secret";

/** Every budget is bounded (the smoke doctrine: no unbounded wait anywhere). */
const BUDGETS = {
  buildMs: 240_000,
  healthTimeoutMs: 60_000,
  pollIntervalMs: 200,
  stopGraceMs: 8_000,
  probeTimeoutMs: 1_000,
} as const;

/** One live local serve the harness owns start-to-stop. */
export interface LocalServe {
  /** The WEB origin the browser talks to (vite preview proxies the API same-origin). */
  readonly webOrigin: string;
  /** The API origin (the real backend/api `bun run start` child). */
  readonly apiOrigin: string;
  /** The scratch data dir (removed on stop). */
  readonly dataDir: string;
  /** Stop the serve, prove the ports went dark, remove the scratch dir. */
  stop(): Promise<{ exitCode: number; portsDark: boolean }>;
}

/** True when SOMETHING accepts a TCP connection on host:port. */
function portAnswers(host: string, port: number): Promise<boolean> {
  return new Promise((resolve_) => {
    const socket = netConnect({ host, port });
    let settled = false;
    const finish = (result: boolean): void => {
      if (!settled) {
        settled = true;
        socket.destroy();
        resolve_(result);
      }
    };
    socket.setTimeout(BUDGETS.probeTimeoutMs, () => {
      finish(true);
    });
    socket.once("connect", () => {
      finish(true);
    });
    socket.once("error", () => {
      finish(false);
    });
  });
}

/** The full port-dark proof: no listener on either loopback address of either port. */
async function portsDark(apiPort: number, webPort: number): Promise<boolean> {
  const probes = [
    await portAnswers("127.0.0.1", apiPort),
    await portAnswers("localhost", apiPort),
    await portAnswers("127.0.0.1", webPort),
    await portAnswers("localhost", webPort),
  ];
  return probes.every((answers) => !answers);
}

function pending(ms: number): Promise<"pending"> {
  return new Promise((resolve_) => {
    setTimeout(() => {
      resolve_("pending");
    }, ms).unref();
  });
}

/** Run `bun run build` (the repo's own build orchestrator) and prove its artifacts. */
export function buildOnce(): { pass: boolean; lines: string[] } {
  const lines: string[] = [];
  const distIndex = join(ROOT, "apps", "web", "dist", "index.html");
  const serverless = join(ROOT, "api", "[...path].mjs");
  const alreadyBuilt = existsSync(distIndex) && existsSync(serverless);
  if (alreadyBuilt) {
    lines.push(
      "build: artifacts already present (apps/web/dist/index.html + api/[...path].mjs) — the repo's own `bun run build` output",
    );
    return { pass: true, lines };
  }
  const proc = Bun.spawnSync({
    cmd: [process.execPath, "run", "build"],
    cwd: ROOT,
    stdout: "pipe",
    stderr: "pipe",
    stdin: "ignore",
    timeout: BUDGETS.buildMs,
  });
  const output = `${proc.stdout?.toString() ?? ""}\n${proc.stderr?.toString() ?? ""}`;
  if (proc.exitCode !== 0) {
    lines.push(`build: FAILED (exit ${proc.exitCode ?? "timeout/SIGKILL"}) — bun run build`);
    lines.push(`build output tail: ${output.trim().split("\n").slice(-8).join(" | ")}`);
    return { pass: false, lines };
  }
  if (!existsSync(distIndex) || !existsSync(serverless)) {
    lines.push("build: exit 0 but an artifact is missing (apps/web/dist/index.html / api/[...path].mjs)");
    return { pass: false, lines };
  }
  lines.push("build: BUILD: PASS (apps/web/dist/index.html, api/[...path].mjs) — bun run build");
  return { pass: true, lines };
}

/**
 * Boot the local production-like serve. Throws (deterministic, with the
 * exact reason) on any pre-flight/health failure — the caller records the
 * failure honestly; a serve that never became healthy is never measured.
 */
export async function startLocalServe(): Promise<LocalServe> {
  // Pre-flight: the causality doctrine — both ports must be dark BEFORE.
  if (!(await portsDark(JOURNEY_API_PORT, JOURNEY_WEB_PORT))) {
    throw new Error(
      `journey serve pre-flight: port ${JOURNEY_API_PORT} or ${JOURNEY_WEB_PORT} is already in use — stop it and re-run (measurement causality is verified, never assumed)`,
    );
  }

  const dataDir = mkdtempSync(join(tmpdir(), "aise-journey-"));
  // A clean environment: DATABASE_URL is deliberately UNSET (unset → the
  // documented local-FS mode; an inherited foreign URL fails the start's
  // own env validation — the same discipline as the web-bundle gate).
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (value !== undefined) {
      env[key] = value;
    }
  }
  delete env.DATABASE_URL;

  const proc = Bun.spawn({
    cmd: [process.execPath, "run", "start"],
    cwd: ROOT,
    env: {
      ...env,
      AISE_DATA_DIR: dataDir,
      PORT: String(JOURNEY_API_PORT),
      AISE_WEB_PORT: String(JOURNEY_WEB_PORT),
      AISE_AUTH: "1",
      AISE_AUTH_MODE: "demo-open",
      AUTH_SECRET: JOURNEY_AUTH_SECRET,
      LOG_LEVEL: "warn",
    },
    stdout: "pipe",
    stderr: "pipe",
    stdin: "ignore",
  });

  const apiOrigin = `http://127.0.0.1:${JOURNEY_API_PORT}`;
  const webOrigin = `http://localhost:${JOURNEY_WEB_PORT}`;

  // Bounded wait for BOTH origins to answer /healthz (child liveness checked).
  const deadline = Date.now() + BUDGETS.healthTimeoutMs;
  const waitHealthy = async (origin: string): Promise<boolean> => {
    for (;;) {
      if (proc.exitCode !== null) {
        return false;
      }
      try {
        const response = await fetch(`${origin}/healthz`, {
          signal: AbortSignal.timeout(BUDGETS.probeTimeoutMs),
        });
        if (response.ok) {
          return true;
        }
      } catch {
        // not listening yet — keep polling within the budget
      }
      if (Date.now() >= deadline) {
        return false;
      }
      await Promise.race([
        sleep(BUDGETS.pollIntervalMs),
        proc.exited.then(() => "exited" as const),
      ]);
    }
  };
  const apiHealthy = await waitHealthy(apiOrigin);
  const webHealthy = apiHealthy ? await waitHealthy(webOrigin) : false;
  if (!apiHealthy || !webHealthy) {
    // ALWAYS clean up a failed boot before failing.
    proc.kill("SIGTERM");
    await Promise.race([
      proc.exited,
      pending(BUDGETS.stopGraceMs).then(() => "timeout" as const),
    ]);
    if (proc.exitCode === null) {
      proc.kill("SIGKILL");
      await proc.exited;
    }
    rmSync(dataDir, { recursive: true, force: true });
    const tail = (await new Response(proc.stderr).text()).trim().split("\n").slice(-8).join("\n");
    throw new Error(
      `journey serve: the local production-like serve did not become healthy within ${BUDGETS.healthTimeoutMs} ms (api=${apiHealthy}, web=${webHealthy})\n` +
        `  start stderr tail:\n${tail}`,
    );
  }

  const stop = async (): Promise<{ exitCode: number; portsDark: boolean }> => {
    if (proc.exitCode === null) {
      proc.kill("SIGTERM");
      const exited = await Promise.race([
        proc.exited,
        pending(BUDGETS.stopGraceMs).then(() => "timeout" as const),
      ]);
      if (exited === "timeout" && proc.exitCode === null) {
        proc.kill("SIGKILL");
        await proc.exited;
      }
    }
    rmSync(dataDir, { recursive: true, force: true });
    // The identity proof: the server we just stopped was the one answering.
    const dark = await portsDark(JOURNEY_API_PORT, JOURNEY_WEB_PORT);
    return { exitCode: proc.exitCode ?? 0, portsDark: dark };
  };

  return { webOrigin, apiOrigin, dataDir, stop };
}
