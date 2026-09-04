/**
 * AISE-021 runtime suite: the composed service over the reader
 * ports — bounded compute, honest MODEL_NOT_FOUND, and the
 * no-second-authority guarantee through the service surface.
 */
import { describe, expect, it } from "vitest";
import { isRulesError, type RulesError } from "./errors.js";
import { ruleSet } from "./rule.js";
import { buildRulesService, DEFAULT_RULES_LIMITS, runRuleEvaluation } from "./runtime.js";
import type { ReadinessContextInput } from "./inputs.js";
import {
  PROJECT,
  SPACE,
  mappingWith,
  measurementEvidence,
  roomHeight,
  smallGraph,
  subjects,
} from "./testing.js";
import type { RealityModelGraph } from "@aise/engineering-model";

/** Captures the RulesError a thunk throws (or undefined). */
function capture(thunk: () => unknown): RulesError | undefined {
  try {
    thunk();
    return undefined;
  } catch (error) {
    expect(isRulesError(error)).toBe(true);
    return error as RulesError;
  }
}

const LIGHT_SET = ruleSet({
  rulesetId: "set-runtime",
  profile: "LIGHT",
  rules: [
    {
      ruleId: "rule-height",
      kind: "DIMENSION",
      subject: { type: "space-property", spaceId: SPACE, propertyKey: "roomHeight" },
      operator: "MINIMUM",
      bound: { value: 2.5, unit: "meter" },
    },
  ],
});

describe("the composed rules service", () => {
  it("runs over the ports and produces the same report as the pure entry", () => {
    const graph = smallGraph();
    const evidence = measurementEvidence(3.0);
    const mapping = mappingWith([evidence], [
      { subject: subjects(1).roomHeight, evidenceId: evidence.evidenceId },
    ]);
    const readiness: ReadinessContextInput = {
      taskId: "task-runtime",
      verdict: "READY",
      assuranceProfile: "CRITICAL",
      modelId: graph.modelId,
      version: 1,
      graphDigest: graph.digest,
      mappingDigest: mapping.digest,
    };
    const graphs = new Map<string, RealityModelGraph>([[`${graph.modelId}:1`, graph]]);
    const service = buildRulesService({
      modelReader: { getModelGraph: (modelId, version) => graphs.get(`${modelId}:${version}`) },
      evidenceReader: { getMapping: (projectId) => (projectId === PROJECT ? mapping : undefined) },
      readinessReader: { getReadiness: (modelId, version) => (modelId === graph.modelId && version === 1 ? readiness : undefined) },
    });
    const criticalSet = ruleSet({
      rulesetId: "set-runtime-critical",
      profile: "CRITICAL",
      readinessGate: { profile: "CRITICAL" },
      rules: LIGHT_SET.rules,
    });
    const viaService = service.runRules({
      modelId: graph.modelId,
      version: 1,
      profile: "CRITICAL",
      ruleset: criticalSet,
    });
    const viaPure = runRuleEvaluation({
      graph,
      version: 1,
      profile: "CRITICAL",
      ruleset: criticalSet,
      mapping,
      readiness,
    });
    expect(viaService).toEqual(viaPure);
    expect(viaService.digest).toBe(viaPure.digest);
    expect(viaService.readiness?.taskId).toBe("task-runtime");
    expect(service.ports.model).toBeDefined();
  });

  it("MODEL_NOT_FOUND when the version is absent (honest, typed)", () => {
    const graphs = new Map<string, RealityModelGraph>();
    const service = buildRulesService({
      modelReader: { getModelGraph: (modelId, version) => graphs.get(`${modelId}:${version}`) },
    });
    const error = capture(() =>
      service.runRules({ modelId: "model-missing", version: 7, profile: "LIGHT", ruleset: LIGHT_SET }),
    );
    expect(error?.code).toBe("MODEL_NOT_FOUND");
  });

  it("bounds are enforced (BOUNDS_EXCEEDED), fail-closed on size after content", () => {
    const graph = smallGraph();
    const error = capture(() =>
      runRuleEvaluation({
        graph,
        version: 1,
        profile: "LIGHT",
        ruleset: LIGHT_SET,
        __limits: { ...DEFAULT_RULES_LIMITS, maxObjects: 0 },
      }),
    );
    expect(error?.code).toBe("BOUNDS_EXCEEDED");

    const manyRules = Array.from({ length: 5 }, (_, index) => ({
      ruleId: `rule-${index}`,
      kind: "DIMENSION" as const,
      subject: { type: "space-property" as const, spaceId: SPACE, propertyKey: "roomHeight" },
      operator: "MINIMUM" as const,
      bound: { value: 2.5, unit: "meter" as const },
    }));
    const set = ruleSet({ rulesetId: "set-many", profile: "LIGHT", rules: manyRules });
    const error2 = capture(() =>
      runRuleEvaluation({ graph, version: 1, profile: "LIGHT", ruleset: set, __limits: { maxObjects: 5000, maxSpaces: 2000, maxRules: 2 } }),
    );
    expect(error2?.code).toBe("BOUNDS_EXCEEDED");
    void DEFAULT_RULES_LIMITS;
  });

  it("no second authority: service runs leave the canonical digests bit-identical", () => {
    const graph = smallGraph({
      roomHeight: roomHeight({
        quantity: { value: 3.0, unit: "meter", uncertainty: { kind: "standard", u: 0.005 } },
        status: "CONFIRMED",
        kind: "measurement",
        method: "review/confirm-v1",
        evidenceRefs: [measurementEvidence(3.0).evidenceId],
        verifiedBy: "user:test-reviewer",
        verifiedAt: "2026-09-03T12:00:00Z",
      }),
    });
    const evidence = measurementEvidence(3.0);
    const mapping = mappingWith([evidence], [
      { subject: subjects(1).roomHeight, evidenceId: evidence.evidenceId },
    ]);
    const graphDigestBefore = graph.digest;
    const mappingDigestBefore = mapping.digest;

    const graphs = new Map<string, RealityModelGraph>([[`${graph.modelId}:1`, graph]]);
    const service = buildRulesService({
      modelReader: { getModelGraph: (modelId, version) => graphs.get(`${modelId}:${version}`) },
      evidenceReader: { getMapping: () => mapping },
    });
    const criticalSet = ruleSet({
      rulesetId: "set-authority",
      profile: "CRITICAL",
      readinessGate: { profile: "CRITICAL" },
      rules: LIGHT_SET.rules,
    });
    const readiness: ReadinessContextInput = {
      taskId: "task-authority",
      verdict: "READY",
      assuranceProfile: "CRITICAL",
      modelId: graph.modelId,
      version: 1,
      graphDigest: graph.digest,
      mappingDigest: mapping.digest,
    };
    service.runRules({ modelId: graph.modelId, version: 1, profile: "CRITICAL", ruleset: criticalSet, ...(readiness !== undefined ? {} : {}) });
    // With readiness via the port:
    const service2 = buildRulesService({
      modelReader: { getModelGraph: (modelId, version) => graphs.get(`${modelId}:${version}`) },
      evidenceReader: { getMapping: () => mapping },
      readinessReader: { getReadiness: () => readiness },
    });
    service2.runRules({ modelId: graph.modelId, version: 1, profile: "CRITICAL", ruleset: criticalSet });

    expect(graph.digest).toBe(graphDigestBefore);
    expect(mapping.digest).toBe(mappingDigestBefore);
  });

  it("the service surface exposes no mutation verbs (read/evaluate only)", () => {
    const service = buildRulesService({ modelReader: { getModelGraph: () => undefined } });
    const surface = Object.keys(service).sort();
    expect(surface).toContain("runRules");
    for (const verb of surface) {
      expect(verb).not.toMatch(/commit|ingest|link|retract|write|mutate|update/i);
    }
  });
});
