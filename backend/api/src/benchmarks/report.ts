/**
 * AISE-019 — deterministic text rendering of a BenchmarkReport (CLI output).
 *
 * The rendered text is a pure function of the report (no clock, no I/O):
 * identical report bits → identical text. The synthetic-provenance warning
 * is ALWAYS the first line — synthetic-v1 fixtures must never read as
 * physical captures.
 */

import type { BenchmarkReport, EngineBenchmarkSummary } from "./model";

function renderEngine(engine: EngineBenchmarkSummary): string[] {
  const lines: string[] = [];
  lines.push(`engine ${engine.providerId} ${engine.version}: ${engine.overall}`);
  for (const evaluation of engine.fixtureEvaluations) {
    if (evaluation.kind === "failure") {
      lines.push(
        `  fixture ${evaluation.failure.fixtureId} (${evaluation.failure.deviceClass}): FAILURE ${evaluation.failure.code} — ${evaluation.failure.detail}`,
      );
      continue;
    }
    const metrics = evaluation.metrics;
    const violations = engine.violations.filter((v) => v.fixtureId === metrics.fixtureId);
    const critical = violations.filter((v) => v.critical);
    const nonCritical = violations.filter((v) => !v.critical);
    lines.push(
      `  fixture ${metrics.fixtureId} (${metrics.deviceClass}): ${metrics.metrics.length} metric instances, ${violations.length} violations (${critical.length} critical)`,
    );
    lines.push("    aggregates (INFORMATIONAL — gates evaluate per-instance):");
    for (const [metric, value] of Object.entries(metrics.aggregates)) {
      lines.push(`      ${metric.padEnd(20)} ${value.toFixed(6)}`);
    }
    for (const violation of critical) {
      lines.push(
        `      CRITICAL ${violation.metric} subject=${violation.subjectId} value=${violation.value.toFixed(6)} threshold=${violation.threshold}`,
      );
    }
    for (const violation of nonCritical) {
      lines.push(
        `      note    ${violation.metric} subject=${violation.subjectId} value=${violation.value.toFixed(6)} threshold=${violation.threshold}`,
      );
    }
  }
  if (engine.failureEntries.length > 0) {
    lines.push(`  failure entries: ${engine.failureEntries.length}`);
  }
  return lines;
}

/** Render the full report as deterministic text. */
export function renderTextReport(report: BenchmarkReport): string {
  const lines: string[] = [];
  lines.push(
    "AISE-019 BENCHMARK REPORT — fixtureProvenance: synthetic-v1 (SYNTHETIC fixtures with documented ground truth; NOT physical captures — physical fixtures are AISE-035)",
  );
  lines.push(`overall: ${report.overall}`);
  lines.push(`schema: ${report.schemaVersion}; gate thresholds: ${report.gateThresholdVersion}`);
  lines.push(`generatedAt: ${report.generatedAt} (injected clock; excluded from digest)`);
  lines.push(
    `engines: ${report.engineCount}; fixtures: ${report.fixtureCount}; critical violations: ${report.criticalViolations.length}; non-critical: ${report.nonCriticalViolations.length}; failure entries: ${report.failureEntries.length}`,
  );
  if (report.criticalViolations.length > 0) {
    lines.push("CRITICAL VIOLATIONS (top level — aggregates never gate):");
    for (const violation of report.criticalViolations) {
      lines.push(
        `  [${violation.deviceClass}] ${violation.engineId} ${violation.metric} subject=${violation.subjectId} fixture=${violation.fixtureId} value=${violation.value.toFixed(6)} threshold=${violation.threshold}`,
      );
    }
  }
  for (const engine of report.engines) {
    lines.push(...renderEngine(engine));
  }
  if (report.failureEntries.length > 0) {
    lines.push("FAILURE ENTRIES:");
    for (const failure of report.failureEntries) {
      lines.push(
        `  ${failure.engineId} on ${failure.fixtureId}: ${failure.code} — ${failure.detail}`,
      );
    }
  }
  lines.push(`reproducibility digest: ${report.reproducibilityDigest}`);
  return `${lines.join("\n")}\n`;
}
