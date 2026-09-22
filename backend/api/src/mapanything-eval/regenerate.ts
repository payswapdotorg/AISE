/**
 * HFX-101 — the MapAnything provider benchmark's REGENERATION CLI (the
 * committed-golden writer — the reality-eval `regenerate.ts` / vlm-eval
 * regeneration convention).
 *
 * Regenerates the committed benchmark artifacts DETERMINISTICALLY
 * (canonical JSON: recursively sorted keys, 2-space indent, trailing
 * newline):
 *
 *   tools/mapanything-eval/scenario.json
 *       the committed corpus suite (the provider declarations + the eight
 *       corpus tasks + the twelve materialized runs)
 *   tools/mapanything-eval/fixtures/expected-outcomes.json
 *       the committed golden benchmark run (the per-run records +
 *       manifests, the per-variant lifecycle blocks, the per-lane provider
 *       comparisons, the full registry event log, the replay proof)
 *
 * Run from the repo root (or the backend/api workspace):
 *
 *   bun backend/api/src/mapanything-eval/regenerate.ts
 *
 * The committed files regenerate BYTE-IDENTICALLY (no clock, no randomness,
 * no network). The golden tests (backend golden.test.ts + the tools check
 * runner) recompute and byte-compare — a harness/corpus/double change
 * without a re-run fails `bun run verify`.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  goldenMapAnythingExpectedOutcomesJson,
  goldenMapAnythingScenarioSuiteJson,
} from "./golden";
import { runMapAnythingBenchmarkLifecycle } from "./registry";
import { MAPANYTHING_EVAL_CORPUS, mapAnythingEvalRuns } from "./corpus";
import { MAPANYTHING_EVAL_SUITE_ID, MAPANYTHING_EVAL_SUITE_VERSION } from "./model";

const TOOLS_DIR = join(import.meta.dir, "..", "..", "..", "..", "tools", "mapanything-eval");

// CLI output seam (the lint gate's no-console rule: a CLI's stdout IS its
// output contract — deterministic transcript lines, never console.*).
function out(line: string): void {
  process.stdout.write(`${line}\n`);
}

mkdirSync(join(TOOLS_DIR, "fixtures"), { recursive: true });
writeFileSync(join(TOOLS_DIR, "scenario.json"), goldenMapAnythingScenarioSuiteJson(), "utf8");
out(`mapanything-eval scenario suite written: tools/mapanything-eval/scenario.json`);
out(
  `  suite ${MAPANYTHING_EVAL_SUITE_ID} (${MAPANYTHING_EVAL_SUITE_VERSION}) — ` +
    `${mapAnythingEvalRuns().length} runs over ${MAPANYTHING_EVAL_CORPUS.length} tasks`,
);

const lifecycle = runMapAnythingBenchmarkLifecycle();
writeFileSync(
  join(TOOLS_DIR, "fixtures", "expected-outcomes.json"),
  goldenMapAnythingExpectedOutcomesJson(),
  "utf8",
);
out(`mapanything-eval expected outcomes written: tools/mapanything-eval/fixtures/expected-outcomes.json`);
for (const outcome of lifecycle.outcomes) {
  out(
    `  run ${outcome.runId} [${outcome.matrixCell}]: ${outcome.layer1.verdict}` +
      `${outcome.layer1.failureObservations.length > 0 ? ` [${outcome.layer1.failureObservations.map((o) => o.kind).join(", ")}]` : ""}` +
      `${outcome.expectedMatch ? "" : " — EXPECTATION MISMATCH"}`,
  );
}
for (const variant of lifecycle.variants) {
  out(
    `  variant ${variant.providerId} @ ${variant.technologyVersion} — ${variant.registryState}` +
      `${variant.promotionRefusals.length > 0 ? ` (refused: ${variant.promotionRefusals.map((r) => r.kind).join(", ")})` : ""}`,
  );
}
out(`  registry log: ${lifecycle.events.length} events; replay equal: ${lifecycle.replayEqual}`);
