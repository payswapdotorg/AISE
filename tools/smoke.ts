/**
 * AISE runtime smoke verification (PROD-001).
 *
 * `bun run smoke` — proves the REAL backend boots and answers, deterministically:
 *
 *   1. pre-flight: the fixed scratch port 8787 must be FREE — a TCP connect
 *      must be refused. If anything is already listening there, the smoke
 *      fails immediately instead of measuring a foreign server;
 *   2. creates a scratch data directory under the OS temp dir (mkdtemp —
 *      never the developer's real data dir);
 *   3. starts the real API (`bun run start` in backend/api — no fixtures, no
 *      in-process shortcuts) on 127.0.0.1:8787 with the scratch data dir;
 *   4. waits for it to become healthy (bounded polling with child-liveness
 *      checks — a child that dies, e.g. bind failure, is a deterministic
 *      process-exit failure, never a timeout mystery);
 *   5. asserts the live HTTP contract:
 *        GET /healthz → 200, {ok:true, service:"aise-api", version:string}
 *        GET /readyz  → 200, {ok:true}
 *   6. ALWAYS cleans up: SIGTERM the API (SIGKILL after a bounded grace
 *      period), remove the scratch data dir — and prints proof that both
 *      happened;
 *   7. identity proof: after the API process is stopped, the scratch port
 *      must be dark. If anything still answers on 8787, the probes may have
 *      hit a foreign server and the smoke FAILS — measurement causality is
 *      verified, not assumed;
 *   8. prints `SMOKE: PASS` / `SMOKE: FAIL` and exits 0/1 accordingly.
 *
 * The scratch port is fixed (8787), NOT the API default (8080): `bun run
 * smoke` can run alongside `bun run dev` / `bun run start`.
 */

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { connect as netConnect } from "node:net";
import { join, resolve } from "node:path";

const ROOT = resolve(import.meta.dir, "..");
const SMOKE_HOST = "127.0.0.1";
const SMOKE_PORT = 8787;
const HEALTH_TIMEOUT_MS = 20000;
const POLL_INTERVAL_MS = 150;
const SETTLE_MS = 300;
const STOP_GRACE_MS = 5000;
const PROBE_TIMEOUT_MS = 1000;

interface Assertion {
  readonly name: string;
  readonly pass: boolean;
  readonly detail: string;
}

type BootOutcome =
  | { kind: "healthy" }
  | { kind: "timeout"; waitedMs: number }
  | { kind: "process-exit"; code: number };

/**
 * True when SOMETHING accepts a TCP connection on host:port. Used both as a
 * pre-flight "port is free" gate and as the post-teardown identity proof.
 * A connect timeout counts as "answering" (occupied) — never risk a false
 * positive on an ambiguous port state.
 */
function portAnswers(host: string, port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = netConnect({ host, port });
    let settled = false;
    const finish = (result: boolean): void => {
      if (!settled) {
        settled = true;
        socket.destroy();
        resolve(result);
      }
    };
    socket.setTimeout(PROBE_TIMEOUT_MS, () => {
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

async function fetchJson(path: string): Promise<{ status: number; body: unknown }> {
  const response = await fetch(`http://${SMOKE_HOST}:${SMOKE_PORT}${path}`, {
    // Bounded per-request timeout so a wedged server cannot hang the smoke.
    signal: AbortSignal.timeout(2000),
  });
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    body = undefined;
  }
  return { status: response.status, body };
}

function pending(ms: number): Promise<"pending"> {
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve("pending");
    }, ms).unref();
  });
}

async function waitForBoot(proc: Bun.Subprocess): Promise<BootOutcome> {
  const start = Date.now();
  const deadline = start + HEALTH_TIMEOUT_MS;
  const exitPromise = proc.exited.then((code) => ({ kind: "process-exit" as const, code }));
  for (;;) {
    try {
      const { status } = await fetchJson("/healthz");
      if (status === 200) {
        // A 200 alone does not prove OUR child is the listener. The child
        // must be alive now AND after a settle window (bind failures such as
        // EADDRINUSE kill the process at construction time, well inside the
        // window). The post-teardown identity proof closes the residual gap.
        if (proc.exitCode !== null) {
          return { kind: "process-exit", code: proc.exitCode };
        }
        const settle = await Promise.race([exitPromise, pending(SETTLE_MS)]);
        if (settle !== "pending") {
          return settle;
        }
        if (proc.exitCode !== null) {
          return { kind: "process-exit", code: proc.exitCode };
        }
        return { kind: "healthy" };
      }
    } catch {
      // Not up yet (connection refused / not listening) — keep polling.
    }
    if (Date.now() >= deadline) {
      return { kind: "timeout", waitedMs: Date.now() - start };
    }
    const exited = await Promise.race([exitPromise, pending(POLL_INTERVAL_MS)]);
    if (exited !== "pending") {
      return exited;
    }
  }
}

async function stopApi(proc: Bun.Subprocess): Promise<number> {
  if (proc.exitCode !== null) {
    return proc.exitCode;
  }
  proc.kill("SIGTERM");
  const exited = await Promise.race([proc.exited, pending(STOP_GRACE_MS).then(() => "timeout" as const)]);
  if (exited === "timeout" && proc.exitCode === null) {
    proc.kill("SIGKILL");
    return await proc.exited;
  }
  return exited === "timeout" ? (proc.exitCode ?? 1) : exited;
}

async function main(): Promise<void> {
  const failures: string[] = [];

  // Pre-flight: the scratch port must be free, otherwise the smoke would
  // measure whatever server already holds it.
  if (await portAnswers(SMOKE_HOST, SMOKE_PORT)) {
    console.error(
      `  FAIL  pre-flight — port ${SMOKE_PORT} is already in use by another process; stop it and re-run bun run smoke`,
    );
    failures.push(`port ${SMOKE_PORT} already in use before the smoke started`);
    console.log("SMOKE: FAIL");
    process.exit(1);
  }

  const dataDir = mkdtempSync(join(tmpdir(), "aise-smoke-"));
  console.log(`smoke: scratch data dir ${dataDir}`);
  console.log(`smoke: starting backend/api on http://${SMOKE_HOST}:${SMOKE_PORT} (real process, no fixtures)`);

  const api = Bun.spawn({
    cmd: [process.execPath, "run", "start"],
    cwd: join(ROOT, "backend/api"),
    env: {
      ...process.env,
      HOST: SMOKE_HOST,
      PORT: String(SMOKE_PORT),
      AISE_DATA_DIR: dataDir,
      LOG_LEVEL: "info",
    },
    stdout: "inherit",
    stderr: "inherit",
  });

  const assertions: Assertion[] = [];
  let bootFailure: string | null = null;

  const boot = await waitForBoot(api);
  if (boot.kind === "healthy") {
    const health = await fetchJson("/healthz");
    const healthBody = isRecord(health.body) ? health.body : {};
    assertions.push(
      {
        name: "GET /healthz → HTTP 200",
        pass: health.status === 200,
        detail: `status ${health.status}`,
      },
      {
        name: "GET /healthz body ok === true",
        pass: healthBody["ok"] === true,
        detail: `ok = ${String(healthBody["ok"])}`,
      },
      {
        name: "GET /healthz body service === \"aise-api\"",
        pass: healthBody["service"] === "aise-api",
        detail: `service = ${String(healthBody["service"])}`,
      },
      {
        name: "GET /healthz body version is a non-empty string",
        pass:
          typeof healthBody["version"] === "string" && (healthBody["version"] as string).length > 0,
        detail: `version = ${String(healthBody["version"])}`,
      },
    );

    const ready = await fetchJson("/readyz");
    const readyBody = isRecord(ready.body) ? ready.body : {};
    assertions.push(
      {
        name: "GET /readyz → HTTP 200",
        pass: ready.status === 200,
        detail: `status ${ready.status}`,
      },
      {
        name: "GET /readyz body ok === true",
        pass: readyBody["ok"] === true,
        detail: `ok = ${String(readyBody["ok"])}`,
      },
    );

    // The API process must still be alive after the assertions — a process
    // that died mid-smoke invalidates the measurement.
    if (api.exitCode !== null) {
      bootFailure = `API process exited (code ${api.exitCode}) during the smoke assertions`;
    }
  } else if (boot.kind === "timeout") {
    bootFailure = `API did not become healthy within ${HEALTH_TIMEOUT_MS} ms on port ${SMOKE_PORT}`;
  } else {
    bootFailure = `API process exited (code ${boot.code}) before becoming healthy — port ${SMOKE_PORT} in use or startup failure; see API output above`;
  }

  // Cleanup ALWAYS runs, even after failed boot/assertions.
  const apiExit = await stopApi(api);
  console.log(`smoke: api stopped (exit code ${apiExit})`);
  rmSync(dataDir, { recursive: true, force: true });
  console.log(`smoke: scratch data dir removed (${dataDir})`);

  // Identity proof: the server we just stopped was the one answering. If
  // anything still accepts connections on the scratch port, the probes may
  // have hit a foreign server — refuse to report a false positive.
  if (await portAnswers(SMOKE_HOST, SMOKE_PORT)) {
    bootFailure =
      bootFailure ??
      "another server is still answering on the scratch port after the smoke's API process stopped — the smoke probes may have hit a foreign process";
  }

  for (const assertion of assertions) {
    const line = `  ${assertion.pass ? "pass" : "FAIL"}  ${assertion.name} — ${assertion.detail}`;
    if (assertion.pass) {
      console.log(line);
    } else {
      console.error(line);
    }
  }
  if (bootFailure !== null) {
    console.error(`  FAIL  boot — ${bootFailure}`);
  }

  const pass = bootFailure === null && assertions.length > 0 && assertions.every((a) => a.pass);
  console.log(pass ? "SMOKE: PASS" : "SMOKE: FAIL");
  process.exit(pass ? 0 : 1);
}

void main();
