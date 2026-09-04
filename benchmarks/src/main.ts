/**
 * Benchmark CLI entry (AISE-022).
 *
 * `npm run benchmark` — runs the golden-capture benchmark,
 * prints the per-case scoring table, the critical-class analysis
 * and the regression report against the committed baseline;
 * writes the current record to `benchmarks/results/latest.json`
 * (git-ignored, observability only — the VERSIONED record is the
 * committed baseline); exits 0 iff the benchmark PASSES and no
 * gating regression was detected.
 *
 * `npm run benchmark -- --update-baseline` — writes the current
 * report as the new committed baseline record (a deliberate,
 * reviewable change; the file is meant to be committed).
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import * as path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { runBenchmark } from "./run.js";
import { compareWithBaseline, parseBaseline, serializeBaseline } from "./baseline.js";
import { isBenchmarkError } from "./errors.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const BASELINE_PATH = path.resolve(HERE, "../baselines/golden-captures.v1.json");
const RESULTS_DIR = path.resolve(HERE, "../results");

function main(): number {
  const updateBaseline = process.argv.includes("--update-baseline");

  const report = runBenchmark();

  if (updateBaseline) {
    writeFileSync(BASELINE_PATH, serializeBaseline(report), "utf8");
    console.log(`benchmark: baseline updated (${report.digest.slice(0, 16)}) — commit the record deliberately`);
    printReport(report);
    return report.verdict === "PASS" ? 0 : 1;
  }

  // Always persist the current record for observability (results
  // are versioned by the COMMITTED baseline, not this file).
  try {
    mkdirSync(RESULTS_DIR, { recursive: true });
    writeFileSync(path.join(RESULTS_DIR, "latest.json"), JSON.stringify(report, null, 2), "utf8");
  } catch {
    // Observability-only: a read-only results dir must not fail
    // the benchmark itself.
  }

  const baseline = parseBaseline(readFileSync(BASELINE_PATH, "utf8"), "baselines/golden-captures.v1.json");
  const regression = compareWithBaseline(report, baseline);

  printReport(report);
  printRegression(regression);

  if (report.verdict !== "PASS") {
    console.error(`benchmark: FAIL (verdict ${report.verdict})`);
    return 1;
  }
  if (regression.overall === "REGRESSED") {
    console.error("benchmark: FAIL (regression against the committed baseline)");
    return 1;
  }
  console.log(`benchmark: PASS (${report.counts.metricsPassed}/${report.counts.metricsTotal} metrics across ${report.counts.cases} cases; ${regression.overall === "IMPROVED" ? "improved" : "no regression"} vs baseline)`);
  return 0;
}

function printReport(report: ReturnType<typeof runBenchmark>): void {
  console.log(`benchmark suite: ${report.suiteVersion} — verdict ${report.verdict}`);
  for (const result of report.cases) {
    console.log(`\ncase ${result.caseId} [${result.caseClass}] — ${result.verdict}`);
    for (const metric of result.metrics) {
      const observed = metric.observed !== undefined ? metric.observed.toPrecision(8) : "(missing)";
      const error = metric.absError !== undefined ? metric.absError.toExponential(2) : "-";
      console.log(
        `  ${metric.metricId.padEnd(20)} ${metric.verdict.padEnd(8)} expected=${metric.expected} observed=${observed} |err|=${error} tol=${metric.tolerance}`,
      );
    }
    console.log(`  counts: ${result.counts.pass} pass / ${result.counts.fail} fail / ${result.counts.missing} missing`);
  }
  console.log("\ncritical-class analysis:");
  for (const headroom of report.critical.headroom) {
    console.log(`  ${headroom.caseId}: worst margin ${headroom.worstMargin.toFixed(4)} (${headroom.worstMetricId})`);
  }
  if (report.critical.criticalMetrics.length > 0) {
    console.log(`  critical metrics (≤ 25% headroom): ${report.critical.criticalMetrics.length}`);
    for (const metric of report.critical.criticalMetrics) {
      console.log(`    ${metric.caseId}/${metric.metricId}: margin ${metric.margin.toFixed(4)} (tol ${metric.tolerance})`);
    }
  } else {
    console.log("  critical metrics (≤ 25% headroom): none");
  }
  if (report.critical.degradation.length > 0) {
    const degraded = report.critical.degradation.filter((row) => row.verdict === "DEGRADED").length;
    console.log(`  degradation rows vs CRITICAL baseline: ${report.critical.degradation.length} (${degraded} degraded)`);
  }
  console.log(`digest: ${report.digest}`);
}

interface Reg {
  readonly baselineDigest: string;
  readonly overall: string;
  readonly counts: { regressed: number; improved: number; unchanged: number };
  readonly rows: readonly { caseId: string; metricId: string; status: string; currentVerdict: string; baselineVerdict: string }[];
}

function printRegression(regression: Reg): void {
  console.log(`\nregression vs baseline (${regression.baselineDigest.slice(0, 16)}): ${regression.overall}`);
  console.log(
    `  rows: ${regression.counts.regressed} regressed / ${regression.counts.improved} improved / ${regression.counts.unchanged} unchanged`,
  );
  for (const row of regression.rows) {
    if (row.status !== "UNCHANGED") {
      console.log(`  ${row.status.padEnd(10)} ${row.caseId}/${row.metricId} ${row.baselineVerdict} → ${row.currentVerdict}`);
    }
  }
}

try {
  process.exitCode = main();
} catch (error) {
  if (isBenchmarkError(error)) {
    console.error(`benchmark: ${error.code} — ${error.message}`);
    process.exitCode = 1;
  } else {
    console.error(`benchmark: failed — ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}
