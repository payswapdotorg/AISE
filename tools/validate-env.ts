/**
 * AISE environment validation CLI (PROD-001).
 *
 * Validates the live environment (Bun automatically loads a root `.env` file
 * into `process.env` before this runs) against the declared schema in
 * `tools/env-schema.ts` and exits deterministically:
 *
 *   - exit 0 + `ENV: PASS`  — every declared variable is valid; optional
 *     provider credentials that are unset are reported as `disabled (optional)`;
 *   - exit 1 + `ENV: FAIL`  — every missing-required / malformed variable is
 *     listed with a precise, actionable message (never the value).
 *
 * Usage:
 *   bun run check:env                    # dev mode
 *   bun tools/validate-env.ts --mode start
 *
 * The root `dev` and `start` orchestrators invoke this before launching any
 * child process, so a broken environment can never produce a half-started
 * runtime.
 */

import { evaluateEnv, VALIDATION_MODES, type EnvCheck, type ValidationMode } from "./env-schema";

function parseMode(argv: readonly string[]): ValidationMode | null {
  // Accept both `--mode start` and `--mode=start`.
  const inline = argv.find((arg) => arg.startsWith("--mode="));
  if (inline !== undefined) {
    const value = inline.slice("--mode=".length);
    return (VALIDATION_MODES as readonly string[]).includes(value)
      ? (value as ValidationMode)
      : null;
  }
  const flagIndex = argv.indexOf("--mode");
  if (flagIndex !== -1) {
    const value = argv[flagIndex + 1];
    if (value === undefined) {
      return null;
    }
    return (VALIDATION_MODES as readonly string[]).includes(value)
      ? (value as ValidationMode)
      : null;
  }
  return "dev";
}

function main(): void {
  const mode = parseMode(process.argv.slice(2));
  if (mode === null) {
    console.error(
      `usage: bun tools/validate-env.ts [--mode ${VALIDATION_MODES.join("|")}]`,
    );
    process.exit(2);
  }

  const report = evaluateEnv(process.env, mode);
  const nameWidth = Math.max(...report.checks.map((check) => check.name.length));
  const statusLabels: Record<EnvCheck["status"], string> = {
    ok: "ok",
    "ok-default": "ok",
    "enabled-optional": "ok",
    "disabled-optional": "disabled (optional)",
    missing: "MISSING",
    invalid: "INVALID",
  };

  console.log(`AISE environment validation (mode: ${mode})`);
  for (const check of report.checks) {
    const label = statusLabels[check.status];
    const shownDetail = check.detail === label ? "" : check.detail;
    const padding = " ".repeat(Math.max(1, nameWidth - check.name.length) + 2);
    const line = `  ${check.name}${padding}${label.padEnd(20)}${shownDetail}`;
    console.log(line.trimEnd());
  }

  if (!report.ok) {
    console.log("ENV: FAIL");
    console.log("Fix the following, then re-run `bun run check:env` (docs/INSTALL.md §Environment):");
    for (const issue of report.issues) {
      console.error(`  - ${issue}`);
    }
    process.exit(1);
  }
  console.log("ENV: PASS");
}

main();
