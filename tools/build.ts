/**
 * AISE root build (PROD-001).
 *
 * `bun run build` — builds every workspace artifact needed by the
 * production-like local start (`bun run start`):
 *
 *   - apps/web: `vite build` → `apps/web/dist` (the served web bundle);
 *   - backend/api: no build artifact — the API runs its TypeScript sources
 *     directly through Bun (`bun run src/main.ts`), which is the documented
 *     runtime contract, so there is nothing to compile ahead of time.
 *
 * Deterministic postcondition: the command fails (exit 1, `BUILD: FAIL`) if
 * the build exits non-zero OR the expected artifact (`apps/web/dist/index.html`)
 * is missing afterwards — a build that "succeeds" without producing its
 * artifact is a failure, not a silent success.
 */

import { existsSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const ROOT = resolve(import.meta.dir, "..");

function main(): void {
  const distIndex = join(ROOT, "apps/web/dist/index.html");

  console.log("build: apps/web (vite build)");
  const proc = Bun.spawnSync({
    cmd: [process.execPath, "run", "build"],
    cwd: join(ROOT, "apps/web"),
    stdout: "inherit",
    stderr: "inherit",
  });
  if (proc.exitCode !== 0) {
    console.error(`BUILD: FAIL — apps/web build exited with code ${proc.exitCode ?? 1}`);
    process.exit(1);
  }
  if (!existsSync(distIndex)) {
    console.error("BUILD: FAIL — apps/web/dist/index.html missing after build");
    process.exit(1);
  }

  console.log(`BUILD: PASS (${relative(ROOT, distIndex)})`);
}

main();
