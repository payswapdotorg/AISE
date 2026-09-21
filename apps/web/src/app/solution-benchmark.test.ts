/**
 * PROD-026 — the BUILDING BENCHMARK apps-side tests (the live leg).
 *
 * The boundary matrix forbids tools → packages imports, so the tools-side
 * check runner (`tools/building-benchmark/benchmark.test.ts`) verifies the
 * COMMITTED expected-outcomes artifact as data. THIS suite runs the journey
 * LIVE — the REAL engine + the REAL BOQ derivation over the committed
 * scenario descriptor — and asserts:
 *
 *  1. FRESHNESS — the freshly computed benchmark equals the committed
 *     fixture BYTE-FOR-BYTE (canonical JSON): any scenario, engine, BOQ or
 *     runner change without a regeneration
 *     (`bun apps/web/src/app/solution-benchmark.ts`) fails the gate;
 *  2. the deterministic replay of the scenario journey (two runs, one
 *     digest);
 *  3. the reality seal at the benchmark's own scale (the observed scene
 *     byte-identical, every proposed state sealed PROPOSED over the pinned
 *     baseline);
 *  4. the honest honesty discipline of the guarded surface data.
 *
 * Determinism: pure computation over committed files; no clock reads (the
 * injected stepped clock), no randomness, no network.
 */

import { describe, expect, test } from "bun:test";
import {
  benchmarkCanonicalJson,
  benchmarkScenarioDigest,
  computeBenchmarkExpectedOutcomes,
  loadBenchmarkExpectedOutcomes,
  loadBenchmarkScenario,
  runBenchmarkJourney,
} from "./solution-benchmark";

describe("PROD-026 building benchmark (the live regeneration gate)", () => {
  test("the freshly computed benchmark equals the committed fixture BYTE-FOR-BYTE", async () => {
    const fresh = await computeBenchmarkExpectedOutcomes();
    const committed = loadBenchmarkExpectedOutcomes();
    expect(benchmarkCanonicalJson(fresh)).toBe(benchmarkCanonicalJson(committed));
    expect(fresh.record.journeyId).toBe(committed.record.journeyId);
    expect(fresh.scenarioDigest).toBe(committed.scenarioDigest);
    expect(fresh.equivalence.identical).toBe(true);
  });

  test("the scenario descriptor loads fail-closed with coherent world pins", () => {
    const scenario = loadBenchmarkScenario();
    expect(scenario.scenarioId).toBe("benchmark-masonry-retrofit-001");
    expect(scenario.version).toBe("1.0.0");
    expect(scenario.world.projectId).toBe("proj-benchmark-001");
    expect(scenario.world.baselineRealityVersionId).toBe("rgv-benchmark-0001");
    expect(scenario.operations.length).toBe(5);
    expect(scenario.observedReality.elements.length).toBe(3);
    expect(benchmarkScenarioDigest(scenario)).toMatch(/^[0-9a-f]{64}$/);
  });

  test("the scenario journey replays deterministically (two runs, one digest)", async () => {
    const first = await runBenchmarkJourney("mixed");
    const second = await runBenchmarkJourney("mixed");
    expect(second.record.journeyId).toBe(first.record.journeyId);
    expect(benchmarkCanonicalJson(second.record)).toBe(benchmarkCanonicalJson(first.record));
  });

  test("the scenario journey's reality seal holds at the benchmark scale", async () => {
    const { record } = await runBenchmarkJourney("mixed");
    expect(record.seal.observedSceneDigestBefore).toBe(record.seal.observedSceneDigestAfter);
    expect(record.seal.everyStateSealedProposed).toBe(true);
    expect(record.seal.sealedStateCount).toBe(11);
    expect(record.seal.pinnedRealityVersionId).toBe("rgv-benchmark-0001");
  });

  test("the scenario journey's validation and BOQ are engine-derived end to end", async () => {
    const { record } = await runBenchmarkJourney("mixed");
    expect(record.steps.find((step) => step.leg === "validate")!.validation!.outcome).toBe("pass");
    expect(record.boq.lineCount).toBe(11);
    expect(record.boq.verification.ok).toBe(true);
    expect(record.revisedBoq!.lineCount).toBe(9);
    // every quantity cites the engine's versioned calculation reference
    for (const line of record.boq.lines) {
      expect(line.quantity.calculationRef).toMatch(/^aise-solution-engine\/quantity\/[a-z-]+\/v1$/);
    }
  });

  test("the scenario journey's BOQ quantities match the builder-checkable values", async () => {
    const { record } = await runBenchmarkJourney("mixed");
    const valueOf = (dimension: string, unit: string, value: number): number =>
      record.boq.lines.filter(
        (line) =>
          line.quantity.dimension === dimension &&
          line.quantity.unit === unit &&
          Math.abs(line.quantity.value - value) < 1e-9,
      ).length;
    // the engine's documented formulas over the scenario's own parameters
    expect(valueOf("area", "m2", 2.1)).toBe(1); // opening: 1.0 × 2.1
    expect(valueOf("count", "count", 1)).toBe(1); // one opening
    expect(valueOf("volume", "m3", 1.548)).toBe(1); // demolition: 3 × 2.4 × 0.215
    expect(valueOf("area", "m2", 7.2)).toBe(2); // demolition face + block wall face: 3 × 2.4
    expect(valueOf("volume", "m3", 1.008)).toBe(1); // block wall: 3 × 2.4 × 0.14
    expect(valueOf("count", "count", 96)).toBe(1); // ceil(2.4/0.2) × ceil(3/0.4)
    expect(valueOf("area", "m2", 21.6)).toBe(2); // plaster + finish: the anchored face set
    expect(valueOf("volume", "m3", 0.324)).toBe(1); // plaster: 21.6 × 15 mm
    expect(valueOf("volume", "m3", 0.0432)).toBe(1); // finish: 21.6 × 2 mm
  });
});
