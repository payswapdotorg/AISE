/**
 * PROD-028 — the SERVICE tests: the deterministic in-memory catalog
 * service — listing, running, the provider-neutral evaluate entry point,
 * the suite run and the fail-closed request parsers.
 */

import { describe, expect, test } from "bun:test";
import { ReasoningEvalError } from "./model";
import {
  ReasoningEvalService,
  parseCatalogRequest,
  parseScenarioEvaluateRequest,
  parseScenarioRunRequest,
} from "./service";
import {
  REASONING_EVAL_CATALOG,
  reasoningEvalCatalog,
  registryLogForScenario,
} from "./testkit";

describe("PROD-028 service: the scenario catalog", () => {
  test("lists all 26 committed scenarios, sorted, with their expected kinds", () => {
    const service = new ReasoningEvalService();
    const scenarios = service.listScenarios();
    expect(scenarios.length).toBe(26);
    expect(scenarios.map((entry) => entry.scenarioId)).toEqual(
      [...scenarios.map((entry) => entry.scenarioId)].sort((a, b) => a.localeCompare(b)),
    );
    const vlmCorrect = scenarios.find((entry) => entry.scenarioId === "vlm-correct");
    expect(vlmCorrect?.lane).toBe("multimodal-reasoning");
    expect(vlmCorrect?.provider.providerId).toBe("fixture-vlm-provider");
    expect(vlmCorrect?.behaviorTag).toBe("replay");
    expect(vlmCorrect?.expectedFailureKind).toBe("none");
  });

  test("filters by lane", () => {
    const service = new ReasoningEvalService();
    const doc = service.listScenarios({ lane: "document-understanding" });
    expect(doc.length).toBe(8);
    expect(doc.every((entry) => entry.lane === "document-understanding")).toBe(true);
    const retrieval = service.listScenarios({ lane: "retrieval" });
    expect(retrieval.length).toBe(9);
    const vlm = service.listScenarios({ lane: "multimodal-reasoning" });
    expect(vlm.length).toBe(9);
  });

  test("a duplicate catalog id is rejected (scenario identity is unique)", () => {
    const doubled = [...reasoningEvalCatalog(), ...reasoningEvalCatalog()];
    expect(() => new ReasoningEvalService(doubled)).toThrow(ReasoningEvalError);
  });
});

describe("PROD-028 service: running scenarios", () => {
  test("runs a known scenario through the harness", () => {
    const service = new ReasoningEvalService();
    const outcome = service.runScenario("vlm-hallucination");
    expect(outcome.scenarioId).toBe("vlm-hallucination");
    expect(outcome.classification).toBe("perception-failure");
    expect(outcome.expectedMatch).toBe(true);
    expect(outcome.benchmarkRecord.providerId).toBe("fixture-vlm-provider");
  });

  test("an unknown scenario id answers the typed 404 error", () => {
    const service = new ReasoningEvalService();
    try {
      service.runScenario("vlm-nonexistent");
      throw new Error("expected a typed rejection");
    } catch (error) {
      expect(error).toBeInstanceOf(ReasoningEvalError);
      expect((error as ReasoningEvalError).code).toBe("unknown_scenario");
    }
  });

  test("the provider-neutral evaluate entry point accepts a scenario + registry log (the HFX seam)", () => {
    const service = new ReasoningEvalService();
    const scenario = REASONING_EVAL_CATALOG.find((entry) => entry.scenarioId === "doc-operation-wrong-target");
    if (scenario === undefined) {
      throw new Error("test setup: doc-operation-wrong-target missing");
    }
    const outcome = service.evaluate({
      scenario,
      registryLog: registryLogForScenario(scenario),
    });
    expect(outcome.classification).toBe("operation-semantic-failure");
    expect(outcome.benchmarkRecord.recordId).toMatch(/^[0-9a-f]{64}$/);
  });

  test("the evaluate entry point accepts a round-tripped (wire-shaped) scenario", () => {
    const service = new ReasoningEvalService();
    const scenario = REASONING_EVAL_CATALOG.find((entry) => entry.scenarioId === "retrieval-fabricated-hit");
    if (scenario === undefined) {
      throw new Error("test setup: retrieval-fabricated-hit missing");
    }
    // the scenario crosses the wire as parsed JSON — exactly what HFX-201 submits
    const wireScenario = JSON.parse(JSON.stringify(scenario));
    const outcome = service.evaluate({
      scenario: wireScenario,
      registryLog: registryLogForScenario(scenario),
    });
    expect(outcome.classification).toBe("unsupported-data");
  });

  test("the suite run returns every outcome plus the discrimination summary", () => {
    const service = new ReasoningEvalService();
    const suite = service.runSuite();
    expect(suite.outcomes.length).toBe(26);
    expect(suite.summary.total).toBe(26);
    expect(suite.summary.classificationMatches).toBe(26);
    expect(suite.summary.expectedMatches).toBe(26);
    expect(suite.summary.byLane).toEqual({
      "document-understanding": 8,
      "multimodal-reasoning": 9,
      retrieval: 9,
    });
    expect(suite.summary.discriminationCoverage["document-understanding"]).toContain(
      "operation-semantic-failure",
    );
  });

  test("determinism: two service instances produce identical suite artifacts", () => {
    const first = new ReasoningEvalService().runSuite();
    const second = new ReasoningEvalService().runSuite();
    for (const [a, b] of first.outcomes.map((outcome, index) => [outcome, second.outcomes[index]])) {
      expect(b?.benchmarkRecord.recordId).toBe(a?.benchmarkRecord.recordId);
      expect(b?.provenanceManifest.manifestId).toBe(a?.provenanceManifest.manifestId);
      expect(b?.envelopeDigest).toBe(a?.envelopeDigest);
    }
  });
});

describe("PROD-028 service: the fail-closed request parsers", () => {
  test("parseCatalogRequest: empty body, valid lane, invalid lane", () => {
    expect(parseCatalogRequest({})).toEqual({});
    expect(parseCatalogRequest({ lane: "retrieval" })).toEqual({ lane: "retrieval" });
    expect(() => parseCatalogRequest({ lane: "ops" })).toThrow(/lane, when present/);
    expect(() => parseCatalogRequest("nope")).toThrow(/expected a JSON object body/);
  });

  test("parseScenarioRunRequest: the scenario id is required", () => {
    expect(parseScenarioRunRequest({ scenarioId: "vlm-correct" })).toEqual({
      scenarioId: "vlm-correct",
    });
    expect(() => parseScenarioRunRequest({})).toThrow(/scenarioId is required/);
    expect(() => parseScenarioRunRequest({ scenarioId: "  " })).toThrow(/scenarioId is required/);
  });

  test("parseScenarioEvaluateRequest: the scenario and registry log are required", () => {
    const scenario = REASONING_EVAL_CATALOG[0];
    if (scenario === undefined) {
      throw new Error("test setup: empty catalog");
    }
    const request = parseScenarioEvaluateRequest({
      scenario,
      registryLog: registryLogForScenario(scenario),
    });
    expect(request.scenario).toBe(scenario);
    expect(() =>
      parseScenarioEvaluateRequest({ scenario: "x" }),
    ).toThrow(/scenario must be a JSON object/);
    expect(() =>
      parseScenarioEvaluateRequest({ scenario, registryLog: "x" }),
    ).toThrow(/registryLog must be an object/);
    expect(() =>
      parseScenarioEvaluateRequest({ scenario, registryLog: { profile: {} } }),
    ).toThrow(/registryLog.execution is required/);
  });
});
