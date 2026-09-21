/**
 * PROD-018 — the equivalence-report writer (the harness's regeneration
 * entry).
 *
 * Regenerates the COMMITTED machine-readable equivalence report
 * (`tools/competitive-parity/fixtures/equivalence-report.json`) from the
 * committed artifacts. Run after any deliberate corpus/contract change:
 *
 *   bun tools/competitive-parity/report.ts
 *
 * The committed report is the harness's FIXTURE — the gate test
 * (equivalence.test.ts) recomputes the report and compares it to the
 * committed bytes, so a corpus or evidence change without a re-run fails
 * `bun run verify`.
 */

import { writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { computeEquivalenceReport, reportCanonicalJson } from "./equivalence";

const REPORT_PATH = resolve(
  import.meta.dir,
  "fixtures",
  "equivalence-report.json",
);

const report = computeEquivalenceReport();
writeFileSync(REPORT_PATH, reportCanonicalJson(report), "utf8");

console.log(
  `competitive-parity equivalence report written: ${join("tools", "competitive-parity", "fixtures", "equivalence-report.json")}`,
);
console.log(`  contract version: ${report.contractVersion}`);
console.log(`  corpus: ${String(report.corpus.fixtureCount)} fixtures (${String(report.corpus.validCount)} valid), digest ${report.corpus.digest.slice(0, 19)}…`);
for (const adapter of report.adapters) {
  const passed = Object.values(adapter.checks).every((entry) => entry);
  console.log(`  adapter ${adapter.adapterId} (${adapter.platform}): ${passed ? "C0–C9 PASS" : "CHECK FAILURE"}`);
}
for (const flow of report.flows) {
  console.log(`  flow ${flow.flowId}: ${flow.passed ? "PASS" : "FAIL"} — ${flow.description.slice(0, 80)}…`);
}
console.log(report.equivalent ? "EQUIVALENT: browser/mobile/desktop produce semantically equivalent engineering results" : "NOT EQUIVALENT — see the flow failures above");
if (!report.equivalent) {
  process.exit(1);
}
