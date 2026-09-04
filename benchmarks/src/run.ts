/**
 * The benchmark run (AISE-022 core): the repeatable,
 * deterministic composition.
 *
 * `runBenchmark` composes the full reconstruction chain per case
 * — golden capture points → AISE-010 extraction → AISE-011
 * ingestion (the committed v1 Reality Graph) — then observes,
 * scores, analyzes and assembles the versioned report. Pure: no
 * clocks, no randomness, no ambient state; identical inputs
 * produce bit-identical reports (the fixtures and the chain are
 * deterministic by construction — replay-tested).
 */
import { extractArchitecturalScene } from "@aise/backend-semantics";
import { ingestArchitecturalScene } from "@aise/backend-reality-model";
import { BENCHMARK_CASES } from "./cases.js";
import { observeGraph } from "./observe.js";
import { scoreCase, type CaseResult } from "./scoring.js";
import { analyzeCritical } from "./critical.js";
import { buildBenchmarkReport, type BenchmarkReport } from "./report.js";

/**
 * Runs every case of the registry through the reconstruction
 * chain and scores the output against ground truth
 * (deterministic; bit-identical on replay).
 */
export function runBenchmark(): BenchmarkReport {
  const cases: CaseResult[] = [];
  for (const benchmarkCase of BENCHMARK_CASES) {
    const scene = extractArchitecturalScene({ points: [...benchmarkCase.points], unit: "meter" });
    const { graph } = ingestArchitecturalScene(scene, {
      modelId: `bench-${benchmarkCase.caseId}`,
      projectId: "bench-project",
      spaceId: `bench-space-${benchmarkCase.caseId}`,
    });
    const observations = observeGraph(graph);
    cases.push(scoreCase(benchmarkCase, observations));
  }
  const critical = analyzeCritical(cases);
  return buildBenchmarkReport({ cases, critical });
}
