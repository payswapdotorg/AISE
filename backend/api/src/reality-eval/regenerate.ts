/**
 * PROD-027 — the Layer-1 evaluation benchmark's REGENERATION CLI (the
 * committed-golden writer — the HFX-000 `scripts/generate-golden.ts` /
 * PROD-018 `tools/competitive-parity/report.ts` pattern).
 *
 * Regenerates the committed benchmark artifacts DETERMINISTICALLY (canonical
 * JSON: recursively sorted keys, 2-space indent, trailing newline):
 *
 *   tools/reality-eval/scenario.json
 *       the committed scenario set (the fixture provider declarations + the
 *       six scenario descriptors: 3 positive / 2 negative / 1 discrimination)
 *   tools/reality-eval/fixtures/expected-outcomes.json
 *       the committed golden records (the control-plane BenchmarkRecords +
 *       ProvenanceManifests per scenario + the full registry event log)
 *
 * Run from the repo root (or the backend/api workspace):
 *
 *   bun backend/api/src/reality-eval/regenerate.ts
 *
 * The committed files regenerate BYTE-IDENTICALLY (no clock, no randomness,
 * no network). The golden tests (backend golden.test.ts + the tools check
 * runner) recompute and byte-compare — a harness/scenario/double change
 * without a re-run fails `bun run verify`.
 */

import { writeFileSync } from "node:fs";
import { canonicalJsonStringify } from "@aise/shared-contracts";
import {
  EXPECTED_OUTCOMES_PATH,
  SCENARIO_SET_PATH,
  realityEvalScenarioSet,
  runRealityEvalSuite,
} from "./testkit";

// CLI output seam (the lint gate's no-console rule: a CLI's stdout IS its
// output contract — deterministic transcript lines, never console.*).
function out(line: string): void {
  process.stdout.write(`${line}\n`);
}

const set = realityEvalScenarioSet();
writeFileSync(SCENARIO_SET_PATH, canonicalJsonStringify(set), "utf8");
out(`reality-eval scenario set written: tools/reality-eval/scenario.json`);
out(`  suite ${set.suiteId} (${set.suiteVersion}) — ${set.providers.length} fixture providers, ${set.scenarios.length} scenarios`);

const outcomes = runRealityEvalSuite();
writeFileSync(EXPECTED_OUTCOMES_PATH, canonicalJsonStringify(outcomes), "utf8");
out(`reality-eval expected outcomes written: tools/reality-eval/fixtures/expected-outcomes.json`);
out(`  scenario set digest: ${outcomes.scenarioSetDigest}`);
for (const evaluation of outcomes.evaluations) {
  out(
    `  scenario ${evaluation.scenarioId} (${evaluation.scenarioClass}): ${evaluation.verdict}` +
      `${evaluation.discriminationCaught ? " — discrimination CAUGHT" : ""}` +
      `${evaluation.failureObservationKinds.length > 0 ? ` [${evaluation.failureObservationKinds.join(", ")}]` : ""}`,
  );
}
out(`  registry log: ${outcomes.registryLog.length} events (register → evaluation-started → per-scenario: execution-normalized → provenance-sealed)`);
