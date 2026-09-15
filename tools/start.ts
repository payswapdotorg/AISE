/**
 * AISE production-like local start (PROD-001).
 *
 * `bun run start` — serves the BUILT web assets plus the backend API with a
 * validated, explicit configuration:
 *
 *   1. validates the environment in `start` mode — `AISE_DATA_DIR` is
 *      REQUIRED here: a production-like start refuses to fall back to the
 *      silent, cwd-dependent `./data` default (deterministic failure beats a
 *      silent default);
 *   2. requires the built web assets (`apps/web/dist/`) — run
 *      `bun run build` first; missing build output is a deterministic
 *      failure, not an implicit rebuild;
 *   3. starts the backend API (`bun run start` in backend/api) and serves
 *      `apps/web/dist` through `vite preview` with the same API proxy as
 *      development, so the browser needs zero configuration;
 *   4. one Ctrl-C tears both down.
 *
 * Honesty note: `vite preview` is Vite's local production-build server — a
 * production-LIKE local approximation, not a hardened internet-facing
 * server. The real public deployment is PROD-011 (see docs/INSTALL.md
 * §What-is-NOT-included).
 */

import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { spawnChild, superviseGroup } from "./lib/process-group";

const ROOT = resolve(import.meta.dir, "..");

function runEnvCheck(): boolean {
  const proc = Bun.spawnSync({
    cmd: [process.execPath, "tools/validate-env.ts", "--mode", "start"],
    cwd: ROOT,
    stdout: "inherit",
    stderr: "inherit",
  });
  return proc.exitCode === 0;
}

async function main(): Promise<void> {
  if (!runEnvCheck()) {
    console.error("start: environment validation failed — refusing to start (see messages above)");
    process.exit(1);
  }

  const distIndex = join(ROOT, "apps/web/dist/index.html");
  if (!existsSync(distIndex)) {
    console.error(
      "start: apps/web/dist/index.html not found — run `bun run build` first (docs/INSTALL.md §Production-like local start)",
    );
    process.exit(1);
  }

  const apiHost = process.env.HOST ?? "127.0.0.1";
  const apiPort = process.env.PORT ?? "8080";
  const webPort = process.env.AISE_WEB_PORT ?? "4173";
  const dataDir = resolve(ROOT, process.env.AISE_DATA_DIR ?? "./data");

  console.log(`start: web  → http://localhost:${webPort} (vite preview over apps/web/dist, proxies API routes)`);
  console.log(`start: api  → http://${apiHost}:${apiPort}/healthz`);
  console.log(`start: data → ${dataDir}`);
  console.log("start: press Ctrl-C once to stop both");

  const api = spawnChild({
    name: "api",
    cmd: [process.execPath, "run", "start"],
    cwd: join(ROOT, "backend/api"),
    env: { AISE_DATA_DIR: dataDir },
  });
  const web = spawnChild({
    name: "web",
    cmd: [process.execPath, "run", "preview"],
    cwd: join(ROOT, "apps/web"),
  });

  const code = await superviseGroup(
    [
      { name: "api", proc: api },
      { name: "web", proc: web },
    ],
    "start",
  );
  process.exit(code);
}

void main();
