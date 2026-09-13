/**
 * AISE deterministic verify gate (AISE-001).
 *
 * The SINGLE entry point for the program's quality gate. Runs sequentially:
 *
 *   typecheck -> lint -> test -> workspace-boundary checks
 *
 * - stops at the first failing step;
 * - exits non-zero on failure;
 * - always prints a final `VERIFY: PASS` or `VERIFY: FAIL` line.
 *
 * Determinism contract: no network access, no timestamps or random values in
 * assertion outputs, no dependence on execution ordering. The same tree plus
 * the same command must produce the same gate outcome. Log text may contain
 * incidental timings; the outcome and exit code are the gate.
 *
 * Usage:
 *   bun run verify              # all steps
 *   bun run typecheck           # single step
 *   bun run lint                # single step
 *   bun tools/verify.ts test    # any single step directly
 */

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { evaluateBoundaries, scanTree } from "./lib/boundaries";

const ROOT = resolve(import.meta.dir, "..");
const TSC_ENTRY = join(ROOT, "node_modules", "typescript", "bin", "tsc");
const ESLINT_ENTRY = join(ROOT, "node_modules", "eslint", "bin", "eslint.js");

interface Step {
  name: string;
  run: () => boolean;
}

function runCommand(cmd: string, args: string[], label: string): boolean {
  console.log(`  $ ${label}`);
  const proc = Bun.spawnSync({
    cmd: [cmd, ...args],
    cwd: ROOT,
    stdout: "inherit",
    stderr: "inherit",
  });
  const code = proc.exitCode ?? 1;
  if (code !== 0) {
    console.error(`  ${label} exited with code ${code}`);
  }
  return code === 0;
}

interface RootPackage {
  workspaces?: string[];
}

/** Resolve workspace directories ("<parent>/*" globs) that contain a package.json. */
function workspaceDirs(): string[] {
  const rootPackage = JSON.parse(
    readFileSync(join(ROOT, "package.json"), "utf8"),
  ) as RootPackage;
  const globs = Array.isArray(rootPackage.workspaces) ? rootPackage.workspaces : [];
  const dirs = new Set<string>();
  for (const glob of globs) {
    const parent = glob.split("/")[0] ?? "";
    if (!glob.endsWith("/*") || parent === "") {
      continue;
    }
    const parentDir = join(ROOT, parent);
    if (!existsSync(parentDir)) {
      continue;
    }
    for (const entry of readdirSync(parentDir, { withFileTypes: true })) {
      if (entry.isDirectory() && existsSync(join(parentDir, entry.name, "package.json"))) {
        dirs.add(`${parent}/${entry.name}`);
      }
    }
  }
  return [...dirs].sort();
}

const typecheckStep: Step = {
  name: "typecheck",
  run: () => {
    if (!existsSync(TSC_ENTRY)) {
      console.error("  typescript is not installed — run `bun install --frozen-lockfile` first");
      return false;
    }
    const candidates = [...workspaceDirs(), "tools"].filter((dir) =>
      existsSync(join(ROOT, dir, "tsconfig.json")),
    );
    if (candidates.length === 0) {
      console.error("  no tsconfig.json found in any workspace or in tools/");
      return false;
    }
    for (const dir of candidates) {
      const ok = runCommand(
        process.execPath,
        [TSC_ENTRY, "--noEmit", "-p", join(dir, "tsconfig.json")],
        `tsc --noEmit -p ${dir}/tsconfig.json`,
      );
      if (!ok) {
        return false;
      }
    }
    return true;
  },
};

const lintStep: Step = {
  name: "lint",
  run: () => {
    if (!existsSync(ESLINT_ENTRY)) {
      console.error("  eslint is not installed — run `bun install --frozen-lockfile` first");
      return false;
    }
    return runCommand(process.execPath, [ESLINT_ENTRY, "."], "eslint .");
  },
};

const testStep: Step = {
  name: "test",
  run: () => runCommand(process.execPath, ["test"], "bun test"),
};

const boundariesStep: Step = {
  name: "boundaries",
  run: () => {
    const files = scanTree(ROOT);
    const violations = evaluateBoundaries(files);
    console.log(`  scanned ${files.length} source files across apps/, backend/, packages/, tools/`);
    if (violations.length === 0) {
      console.log("  no cross-zone import violations");
      return true;
    }
    for (const violation of violations) {
      console.error(
        `  boundary violation: ${violation.file} imports '${violation.specifier}' — ${violation.reason}`,
      );
    }
    return false;
  },
};

const ALL_STEPS: Step[] = [typecheckStep, lintStep, testStep, boundariesStep];

const requested = process.argv[2] ?? "all";
const steps =
  requested === "all" ? ALL_STEPS : ALL_STEPS.filter((step) => step.name === requested);

if (steps.length === 0) {
  console.error(
    `unknown step '${requested}' — expected: all|${ALL_STEPS.map((step) => step.name).join("|")}`,
  );
  process.exit(2);
}

console.log("AISE verify — deterministic gate");
let passed = true;
for (const step of steps) {
  console.log(`==> ${step.name}`);
  if (!step.run()) {
    console.error(`step failed: ${step.name}`);
    passed = false;
    break;
  }
}
console.log(passed ? "VERIFY: PASS" : "VERIFY: FAIL");
process.exit(passed ? 0 : 1);
