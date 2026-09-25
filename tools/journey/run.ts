/**
 * PROD-033 — the production journey harness CLI.
 *
 *   bun tools/journey/run.ts --list                 # enumerate journeys + steps
 *   bun tools/journey/run.ts w  [--base-url URL]    # the web journeys (Gate F)
 *   bun tools/journey/run.ts m                      # the mobile field journey
 *   bun tools/journey/run.ts x  [--base-url URL]    # the combined journey
 *   bun tools/journey/run.ts all [--base-url URL]   # everything, in order
 *
 * Exit code law: 0 = every step PASS (with its recorded class); 1 = any
 * FAIL step or any harness crash (the failing step named). The one
 * recorded exception: the M journey's emulator row carries the honest
 * BLOCKED_NO_KVM state (recorded, never dropped, never upgraded) — it is
 * the expected honest outcome of the emulator lane on a KVM-less station,
 * not a harness failure.
 *
 * Every run appends a timestamped record under
 * docs/productization-evidence/PROD-033/runs/ (committed evidence): the
 * journey id, the base URL, the repo SHA (git rev-parse HEAD at run
 * time), the per-step table, and the per-leg class. `--base-url` defaults
 * to the LOCAL production-like serve (bun run build + bun run start over
 * a scratch data dir, the smoke.ts causality doctrine); the Lead passes
 * the deployed URL at finalization — the harness treats both identically
 * (same-origin fetch, no privileged access).
 *
 * This harness runs STANDALONE: it is never wired into `bun run verify`
 * (the Lead's gate stays the Lead's). AISE_JOURNEY_NO_CHROMIUM=1 forces
 * the W journey's deterministic-fallback path (a verification knob for
 * the fallback lane itself — documented, never a silent skip).
 */

import { writeRunRecord, runPasses, statusCounts } from "./classes";
import { runWJourney, W_STEP_CATALOG } from "./w";
import { runMJourney, M_STEP_CATALOG } from "./m";
import { runXJourney, X_STEP_CATALOG } from "./x";
import type { RunRecord } from "./classes";

/** The CLI's own bounded process exit. */
function exitWith(code: number): never {
  process.exit(code);
}

/** Print one run's verdict block (the console mirror of the committed record). */
function printVerdict(record: RunRecord, recordFile: string | null): void {
  const counts = statusCounts(record);
  const pass = runPasses(record);
  console.log("— journey results —");
  for (const section of record.sections) {
    for (const step of section.steps) {
      console.log(`  ${step.status === "PASS" ? "PASS " : step.status === "FAIL" ? "FAIL " : "BLOCK"} ${step.id} — ${step.name}`);
    }
  }
  console.log(
    `  steps: ${counts.pass} PASS / ${counts.fail} FAIL / ${counts.blocked} BLOCKED_NO_KVM (recorded)`,
  );
  if (recordFile !== null) {
    console.log(`  record: ${recordFile} (committed evidence)`);
  }
  console.log(`JOURNEY ${record.journeyId.toUpperCase()}: ${pass ? "PASS" : "FAIL"}`);
}

/** Run one journey, write its record, print its verdict. */
async function runOne(
  kind: "w" | "m" | "x",
  baseUrl: string | undefined,
): Promise<{ record: RunRecord; file: string }> {
  const record =
    kind === "w"
      ? await runWJourney({ baseUrl })
      : kind === "m"
        ? await runMJourney()
        : await runXJourney({ baseUrl });
  const file = writeRunRecord(record);
  printVerdict(record, file);
  return { record, file };
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const listOnly = args.includes("--list");
  const baseUrlIndex = args.indexOf("--base-url");
  const baseUrl =
    baseUrlIndex !== -1 && args[baseUrlIndex + 1] !== undefined
      ? args[baseUrlIndex + 1]
      : undefined;
  const positional = args.filter(
    (arg, index) =>
      arg !== "--list" &&
      arg !== "--base-url" &&
      !(baseUrlIndex !== -1 && index === baseUrlIndex + 1),
  );
  const journey = positional[0] ?? "";

  if (listOnly || journey === "") {
    console.log("AISE production journey harness (PROD-033)");
    console.log("");
    console.log("usage: bun tools/journey/run.ts <w|m|x|all> [--base-url URL] | --list");
    console.log("");
    console.log("journey w — the web journeys (BOTH Gate F journeys):");
    console.log("  W1 (the golden product journey): HOME → DEMO PROJECT → BOQ → EVIDENCE → CASE → INTERVENTION → OUTCOME");
    console.log("  W2 (the interactive solution journey): CURRENT BUILDING → PROBLEM → INTERACTIVE SOLUTION → VALIDATE → SOLUTION BOQ → BOQ LINE → SOLUTION STEP");
    for (const step of W_STEP_CATALOG) {
      console.log(`    ${step.id} — ${step.name}`);
    }
    console.log("");
    console.log("journey m — the mobile field journey (the PROD-032 E2B station field journey, honestly):");
    for (const step of M_STEP_CATALOG) {
      console.log(`    ${step.id} — ${step.name}`);
    }
    console.log("");
    console.log("journey x — the combined field-to-office journey:");
    console.log("  field capture lands as evidence → the case opens on it → the solution is authored/validated → the solution BOQ is generated and traced");
    for (const step of X_STEP_CATALOG) {
      console.log(`    ${step.id} — ${step.name}`);
    }
    console.log("");
    console.log("evidence classes: EXACTLY {deterministic, synthetic, emulated, physical} — never upgraded;");
    console.log("the parenthesized qualifier names the execution mode (live Chromium vs deterministic fallback).");
    console.log("exit 0 = every step PASS; exit 1 = any FAIL or crash (the failing step named).");
    return;
  }

  if (journey !== "w" && journey !== "m" && journey !== "x" && journey !== "all") {
    console.error(`journey: unknown journey '${journey}' (expected w | m | x | all, or --list)`);
    exitWith(1);
  }
  if (journey === "m" && baseUrl !== undefined) {
    console.error("journey: the m journey takes no --base-url (it cites the committed E2B station transcripts)");
    exitWith(1);
  }

  console.log("AISE production journey harness (PROD-033)");
  console.log(
    `base: ${baseUrl !== undefined ? `explicit --base-url ${baseUrl}` : "the LOCAL production-like serve (bun run build + bun run start)"}`,
  );
  console.log("");

  const records: RunRecord[] = [];
  if (journey === "all") {
    for (const kind of ["w", "m", "x"] as const) {
      console.log(`==> journey ${kind}`);
      const { record } = await runOne(kind, kind === "m" ? undefined : baseUrl);
      records.push(record);
      console.log("");
    }
  } else {
    const { record } = await runOne(journey as "w" | "m" | "x", baseUrl);
    records.push(record);
  }

  const failures: string[] = [];
  for (const record of records) {
    if (!runPasses(record)) {
      for (const section of record.sections) {
        for (const step of section.steps) {
          if (step.status === "FAIL") {
            failures.push(`${record.journeyId}/${step.id} — ${step.name}`);
          }
        }
      }
    }
  }
  if (failures.length > 0) {
    console.error("journey: FAILING STEPS:");
    for (const failure of failures) {
      console.error(`  FAIL ${failure}`);
    }
    exitWith(1);
  }
  console.log("JOURNEY HARNESS: PASS (every step PASS with its recorded class)");
  exitWith(0);
}

void main().catch((error: unknown) => {
  console.error(
    `journey harness crash: ${error instanceof Error ? error.message : String(error)}`,
  );
  if (error instanceof Error && error.stack !== undefined) {
    console.error(error.stack.split("\n").slice(0, 6).join("\n"));
  }
  process.exit(1);
});
