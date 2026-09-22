/**
 * HFX-201 — the SERVICE tests: the thin deterministic evaluation entry
 * point (catalog, single-run, per-variant corpus, full benchmark) with
 * fail-closed request parsing.
 */

import { describe, expect, test } from "bun:test";
import { VlmEvalService, parseVlmEvalRequest } from "./service";
import { VlmEvalError } from "./model";
import { VLM_EVAL_RUNS } from "./corpus";

describe("HFX-201 service: the request parsing (fail closed)", () => {
  test("an absent body yields the unfiltered request; a valid variant passes", () => {
    expect(parseVlmEvalRequest(undefined)).toEqual({});
    expect(parseVlmEvalRequest(null)).toEqual({});
    expect(parseVlmEvalRequest({})).toEqual({});
    expect(parseVlmEvalRequest({ variant: "qwen3-vl-8b" })).toEqual({ variant: "qwen3-vl-8b" });
  });

  test("an unknown variant or a malformed body is a typed error", () => {
    expect(() => parseVlmEvalRequest({ variant: "gemini-flash" })).toThrow(VlmEvalError);
    expect(() => parseVlmEvalRequest("all")).toThrow(VlmEvalError);
    expect(() => parseVlmEvalRequest([])).toThrow(VlmEvalError);
  });
});

describe("HFX-201 service: the catalog + single runs", () => {
  const service = new VlmEvalService();

  test("the catalog lists all 24 runs with the matrix metadata, sorted by id", () => {
    const catalog = service.listScenarios();
    expect(catalog.length).toBe(24);
    expect([...catalog].sort((a, b) => a.scenarioId.localeCompare(b.scenarioId))).toEqual([...catalog]);
    for (const entry of catalog) {
      expect(entry.scenarioId).toBe(`${entry.baseScenarioId}@${entry.variant}`);
      expect(["grounded-pass", "missing-evidence", "conflicting-evidence", "unsupported-question"]).toContain(
        entry.matrixCell,
      );
      expect(["well-grounded", "hallucinating", "refusing"]).toContain(entry.behaviorClass);
    }
  });

  test("the variant filter narrows the catalog to that variant's 12 runs", () => {
    for (const variant of ["qwen3-vl-8b", "qwen3-vl-30b-a3b"] as const) {
      const catalog = service.listScenarios({ variant });
      expect(catalog.length).toBe(12);
      expect(catalog.every((entry) => entry.variant === variant)).toBe(true);
    }
  });

  test("runScenario evaluates a composed id deterministically; unknown ids fail typed", () => {
    const first = service.runScenario("spatial-ref-lintel@qwen3-vl-8b");
    expect(first.layer2.classification).toBe("none");
    expect(first.expectedMatch).toBe(true);
    const second = service.runScenario("spatial-ref-lintel@qwen3-vl-8b");
    expect(second.layer2.envelopeDigest).toBe(first.layer2.envelopeDigest);
    expect(() => service.runScenario("nonexistent@qwen3-vl-8b")).toThrow(VlmEvalError);
  });

  test("a custom run corpus can be injected (deterministic construction)", () => {
    const custom = new VlmEvalService(VLM_EVAL_RUNS.slice(0, 2));
    expect(custom.listScenarios().length).toBe(2);
    const first = VLM_EVAL_RUNS[0];
    if (first === undefined) {
      throw new Error("the run corpus is empty");
    }
    expect(() => new VlmEvalService([first, { ...first }])).toThrow(/duplicate run id/);
  });
});

describe("HFX-201 service: the corpus + benchmark runs", () => {
  const service = new VlmEvalService();

  test("runCorpusForVariant evaluates the variant's 12 runs with the summary", () => {
    const run = service.runCorpusForVariant("qwen3-vl-8b");
    expect(run.outcomes.length).toBe(12);
    expect(run.licenseStatus).toBe("evaluation-only");
    expect(run.provider.providerId).toBe("qwen3-vl-8b");
    expect(run.provider.profileDigest).toMatch(/^[0-9a-f]{64}$/);
    expect(run.summary.expectedMatches).toBe(12);
    expect(run.summary.byClassification["perception-failure"]).toBe(3);
    expect(() => service.runCorpusForVariant("unknown" as "qwen3-vl-8b")).toThrow(VlmEvalError);
  });

  test("runBenchmark produces the full lifecycle: records, manifests, refusals, comparison, replay proof", () => {
    const benchmark = service.runBenchmark();
    expect(benchmark.outcomes.length).toBe(24);
    expect(benchmark.replayEqual).toBe(true);
    expect(benchmark.variants.length).toBe(2);
    for (const variant of benchmark.variants) {
      expect(variant.registryState).toBe("rejected");
      expect(variant.promotionRefusals.map((refusal) => refusal.kind)).toEqual(["license-blocked"]);
      expect(variant.comparabilityKey).toBe("qwen3-vl-multimodal-benchmark/1|multimodal-reasoning");
    }
    expect(benchmark.comparison.rows.length).toBe(2);
    expect(benchmark.comparison.honestNote).toContain("DETERMINISTIC IN-REPO DOUBLES");
  });
});
