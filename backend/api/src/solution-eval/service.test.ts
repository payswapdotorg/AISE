/**
 * PROD-029 service tests — the thin transport adapter over the harness
 * (parse-level typed failures; evaluation-level refusals are RESULTS).
 */

import { describe, expect, test } from "bun:test";
import { SolutionEvalService } from "./service";
import { SolutionEvalError } from "./model";
import { canonicalEvaluateBodyFor, matrixRunBody } from "./testkit";

const service = new SolutionEvalService();

describe("solution-eval service: scenario validation", () => {
  test("a committed scenario validates (the scenario echo)", () => {
    const body = canonicalEvaluateBodyFor("layer3-compiler-faithful-001");
    const response = service.validateScenario(body);
    expect(response.valid).toBe(true);
    expect(response.scenarioId).toBe("layer3-compiler-faithful-001");
    expect(response.seam).toBe("operation-compiler");
    expect(response.baselineId).toBe("command-corpus-slice/1");
    expect(response.substitute.providerId).toBe("fixture-compiler-provider");
    expect(response.expectation).toBe("canonical-equality");
    expect(response.expectedDivergenceKind).toBeUndefined();
  });

  test("a divergent scenario validates with its declared failure kind", () => {
    const body = canonicalEvaluateBodyFor("layer3-validation-divergent-001");
    const response = service.validateScenario(body);
    expect(response.expectedDivergenceKind).toBe("reasoning-failure");
  });

  test("a malformed body is a typed invalid_request", () => {
    expect(() => service.validateScenario(null)).toThrow(SolutionEvalError);
    try {
      service.validateScenario({});
      throw new Error("unreachable");
    } catch (error) {
      expect(error instanceof SolutionEvalError).toBe(true);
      expect((error as SolutionEvalError).code).toBe("invalid_request");
    }
  });

  test("an invalid scenario payload is a typed invalid_scenario", () => {
    expect(() => service.validateScenario({ scenario: { kind: "wrong" } })).toThrow(
      SolutionEvalError,
    );
    try {
      service.validateScenario({ scenario: 42 });
      throw new Error("unreachable");
    } catch (error) {
      expect((error as SolutionEvalError).code).toBe("invalid_scenario");
    }
  });
});

describe("solution-eval service: substitution evaluation", () => {
  test("one committed scenario evaluates over the caller's registry log", async () => {
    const body = canonicalEvaluateBodyFor("layer3-boq-divergent-001");
    const response = await service.evaluateSubstitution(body);
    expect(response.evaluation.verdict).toBe("divergence-recorded");
    expect(response.evaluation.divergence?.failureKind).toBe("operation-semantic-failure");
    expect(response.evaluation.benchmarkRecord).toBeDefined();
  });

  test("a missing registry log is a typed invalid_request", async () => {
    const body = canonicalEvaluateBodyFor("layer3-boq-faithful-001");
    const withoutLog = { scenario: body["scenario"] };
    await expect(service.evaluateSubstitution(withoutLog)).rejects.toThrow(SolutionEvalError);
  });

  test("a non-array registry log is a typed invalid_registry_log", async () => {
    const body = { scenario: canonicalEvaluateBodyFor("layer3-boq-faithful-001")["scenario"], registryLog: "not-a-log" };
    try {
      await service.evaluateSubstitution(body);
      throw new Error("unreachable");
    } catch (error) {
      expect(error instanceof SolutionEvalError).toBe(true);
      expect((error as SolutionEvalError).code).toBe("invalid_registry_log");
    }
  });

  test("an unregistered substitute answers the typed refusal verdict (200-level evidence)", async () => {
    const body = canonicalEvaluateBodyFor("layer3-boq-faithful-001");
    const scenario = body["scenario"] as Record<string, unknown>;
    const substitute = scenario["substitute"] as Record<string, unknown>;
    substitute["technologyVersion"] = "9.9.9-fixture-unregistered";
    const response = await service.evaluateSubstitution(body);
    expect(response.evaluation.verdict).toBe("substitution-refused");
    expect(response.evaluation.refusal?.kind).toBe("provider-not-registered");
  });
});

describe("solution-eval service: the committed matrix run", () => {
  test("the committed matrix runs over the canonical log (4 proven / 4 caught / 0 refused)", async () => {
    const response = await service.runMatrix(matrixRunBody());
    expect(response.matrixId).toBe("layer3-substitution-matrix/1");
    expect(response.totals).toEqual({
      scenarios: 8,
      proven: 4,
      divergenceRecorded: 4,
      refused: 0,
      expectationSatisfied: 8,
    });
    expect(response.cells).toHaveLength(8);
    for (const cell of response.cells) {
      expect(cell.expectationSatisfied).toBe(true);
      expect(cell.benchmarkRecordId).toMatch(/^[0-9a-f]{64}$/);
    }
  });

  test("the matrix run is deterministic", async () => {
    const first = await service.runMatrix(matrixRunBody());
    const second = await service.runMatrix(matrixRunBody());
    expect(first).toEqual(second);
  });

  test("a malformed matrix body is a typed invalid_request", async () => {
    await expect(service.runMatrix("not-an-object")).rejects.toThrow(SolutionEvalError);
  });
});
