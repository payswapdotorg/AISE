/**
 * AISE local development orchestrator (PROD-001).
 *
 * `bun run dev` — one command, one Ctrl-C teardown:
 *
 *   1. validates the environment in dev mode (deterministic failure — a
 *      broken environment never produces a half-started runtime);
 *   2. starts the web dev server (apps/web, Vite) and the backend API
 *      (backend/api, `bun --watch`) concurrently;
 *   3. passes an EXPLICIT `AISE_DATA_DIR`, resolved against the repository
 *      root, so capture data lands in a stable documented location instead
 *      of drifting with the process working directory;
 *   4. forwards SIGINT/SIGTERM to both children and waits for a clean stop.
 *
 * The Vite dev server proxies `/healthz`, `/readyz` and `/v1/**` to the API
 * port (see apps/web/vite.config.ts), so the browser needs zero
 * configuration.
 *
 * Ports/URLs: web http://localhost:${AISE_WEB_PORT:-5173}, API
 * http://${HOST:-127.0.0.1}:${PORT:-8080} — see docs/INSTALL.md.
 */

import { join, resolve } from "node:path";
import { spawnChild, superviseGroup } from "./lib/process-group";

const ROOT = resolve(import.meta.dir, "..");

function runEnvCheck(): boolean {
  const proc = Bun.spawnSync({
    cmd: [process.execPath, "tools/validate-env.ts", "--mode", "dev"],
    cwd: ROOT,
    stdout: "inherit",
    stderr: "inherit",
  });
  return proc.exitCode === 0;
}

async function main(): Promise<void> {
  if (!runEnvCheck()) {
    console.error("dev: environment validation failed — refusing to start (see messages above)");
    process.exit(1);
  }

  const apiHost = process.env.HOST ?? "127.0.0.1";
  const apiPort = process.env.PORT ?? "8080";
  const webPort = process.env.AISE_WEB_PORT ?? "5173";
  const dataDir = resolve(ROOT, process.env.AISE_DATA_DIR ?? "./data");

  console.log(`dev: web  → http://localhost:${webPort} (Vite dev server, proxies API routes)`);
  console.log(`dev: api  → http://${apiHost}:${apiPort}/healthz (bun --watch)`);
  console.log(`dev: data → ${dataDir}`);
  console.log("dev: press Ctrl-C once to stop both");

  const web = spawnChild({
    name: "web",
    cmd: [process.execPath, "run", "dev"],
    cwd: join(ROOT, "apps/web"),
  });
  const api = spawnChild({
    name: "api",
    cmd: [process.execPath, "run", "dev"],
    cwd: join(ROOT, "backend/api"),
    env: { AISE_DATA_DIR: dataDir },
  });

  const code = await superviseGroup(
    [
      { name: "web", proc: web },
      { name: "api", proc: api },
    ],
    "dev",
  );
  process.exit(code);
}

void main();
