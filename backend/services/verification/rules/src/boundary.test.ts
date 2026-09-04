/**
 * AISE-021 boundary suite: the service does not trust the
 * caller — tampered graphs, foreign mappings, hand-crafted rule
 * sets, profile downgrades and malformed readiness contexts
 * never reach the evaluators.
 */
import { describe, expect, it } from "vitest";
import { isRulesError, type RulesError } from "./errors.js";
import { validateRulesInput } from "./boundary.js";
import { ruleSet, type RuleSet } from "./rule.js";
import {
  MODEL,
  PROJECT,
  SPACE,
  emptyTestMapping,
  mappingWith,
  measurementEvidence,
  smallGraph,
  subjects,
} from "./testing.js";

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
  rulesetId: "set-boundary",
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

function satisfiedReadiness(graph: ReturnType<typeof smallGraph>, mapping: ReturnType<typeof mappingWith>) {
  return {
    taskId: "task-boundary",
    verdict: "READY" as const,
    assuranceProfile: "CRITICAL" as const,
    modelId: graph.modelId,
    version: 1,
    graphDigest: graph.digest,
    mappingDigest: mapping.digest,
  };
}

describe("the run-input boundary (fail closed)", () => {
  it("rejects non-object inputs, missing graphs, bad profiles and versions", () => {
    expect(capture(() => validateRulesInput(null as never))?.code).toBe("RULES_INPUT_INVALID");
    expect(capture(() => validateRulesInput({} as never))?.code).toBe("RULES_INPUT_INVALID");
    expect(
      capture(() => validateRulesInput({ graph: smallGraph(), version: 1, profile: "ULTRA" as never, ruleset: LIGHT_SET }))?.message,
    ).toContain("profile");
    expect(
      capture(() => validateRulesInput({ graph: smallGraph(), version: 0, profile: "LIGHT", ruleset: LIGHT_SET }))?.message,
    ).toContain("version");
    expect(
      capture(() => validateRulesInput({ graph: smallGraph(), version: 1.5, profile: "LIGHT", ruleset: LIGHT_SET }))?.message,
    ).toContain("version");
  });

  it("rejects a run below the rule set's profile (no silent downgrade)", () => {
    const criticalSet = ruleSet({
      rulesetId: "set-critical",
      profile: "CRITICAL",
      readinessGate: { profile: "CRITICAL" },
      rules: LIGHT_SET.rules,
    });
    const error = capture(() =>
      validateRulesInput({ graph: smallGraph(), version: 1, profile: "LIGHT", ruleset: criticalSet }),
    );
    expect(error?.code).toBe("RULES_INPUT_INVALID");
    expect(error?.message).toContain("below the rule set's declared profile");
  });

  it("rejects a tampered graph (digest mismatch)", () => {
    const graph = smallGraph();
    // Re-freeze the shallow clone so immutability passes and the
    // DIGEST re-derivation is the check that fires.
    const tampered = Object.freeze({ ...graph, digest: "0".repeat(64) }) as typeof graph;
    const error = capture(() =>
      validateRulesInput({ graph: tampered, version: 1, profile: "LIGHT", ruleset: LIGHT_SET }),
    );
    expect(error?.code).toBe("GRAPH_INVALID");
    expect(error?.message).toContain("digest");
  });

  it("rejects a graph the model layer itself rejects", () => {
    const graph = smallGraph();
    // Break referential integrity: relationship to a missing object.
    const broken = {
      ...graph,
      relationships: [
        ...graph.relationships,
        { relationId: "rel-x", type: "CONTAINS", fromId: SPACE, toId: "obj-missing" },
      ],
    } as typeof graph;
    const error = capture(() =>
      validateRulesInput({ graph: broken, version: 1, profile: "LIGHT", ruleset: LIGHT_SET }),
    );
    expect(error?.code).toBe("GRAPH_INVALID");
  });

  it("rejects a mapping from a different project", () => {
    const foreign = mappingWith([measurementEvidence(3.0)], []);
    const foreignMapping = { ...foreign, projectId: "project-other" } as typeof foreign;
    const error = capture(() =>
      validateRulesInput({
        graph: smallGraph(),
        version: 1,
        profile: "LIGHT",
        ruleset: LIGHT_SET,
        mapping: foreignMapping,
      }),
    );
    expect(error?.code).toBe("MAPPING_INVALID");
    expect(error?.message).toContain("different project");
  });

  it("rejects a hand-crafted rule set whose digest does not match its content", () => {
    const forged: RuleSet = { ...LIGHT_SET, digest: "0".repeat(64) };
    const error = capture(() =>
      validateRulesInput({ graph: smallGraph(), version: 1, profile: "LIGHT", ruleset: forged }),
    );
    expect(error?.code).toBe("RULES_INPUT_INVALID");
    expect(error?.message).toContain("rule set digest");
  });

  it("rejects a rule set that would not pass construction validation", () => {
    // A hand-crafted set that skipped the constructor (invalid
    // rule content) is re-validated at the boundary.
    const crafted = {
      rulesetId: "set-crafted",
      profile: "LIGHT",
      rules: [
        {
          ruleId: "rule-bad",
          kind: "DIMENSION",
          subject: { type: "space-property", spaceId: SPACE, propertyKey: "roomHeight" },
          operator: "MINIMUM",
          bound: { value: Number.NaN, unit: "meter" },
        },
      ],
      digest: "0".repeat(64),
    } as never as RuleSet;
    const error = capture(() =>
      validateRulesInput({ graph: smallGraph(), version: 1, profile: "LIGHT", ruleset: crafted }),
    );
    expect(error?.code).toBe("RULESET_INVALID");
  });

  it("rejects malformed readiness contexts (structural)", () => {
    const graph = smallGraph();
    const mapping = mappingWith([measurementEvidence(3.0)], [
      { subject: subjects(1).roomHeight, evidenceId: measurementEvidence(3.0).evidenceId },
    ]);
    const good = satisfiedReadiness(graph, mapping);
    for (const [field, value] of [
      ["taskId", ""],
      ["verdict", "MAYBE"],
      ["assuranceProfile", "ULTRA"],
      ["modelId", ""],
      ["version", 0],
      ["graphDigest", "not-a-hash"],
      ["mappingDigest", "zzz"],
    ] as const) {
      const error = capture(() =>
        validateRulesInput({
          graph,
          version: 1,
          profile: "CRITICAL",
          ruleset: LIGHT_SET,
          mapping,
          readiness: { ...good, [field]: value } as never,
        }),
      );
      expect(error?.code, `field ${field}`).toBe("CONTEXT_INVALID");
    }
  });

  it("accepts a fully valid input and marks the presence flags", () => {
    const graph = smallGraph();
    const mapping = mappingWith([measurementEvidence(3.0)], [
      { subject: subjects(1).roomHeight, evidenceId: measurementEvidence(3.0).evidenceId },
    ]);
    const verified = validateRulesInput({
      graph,
      version: 1,
      profile: "CRITICAL",
      ruleset: LIGHT_SET,
      mapping,
      readiness: satisfiedReadiness(graph, mapping),
    });
    expect(verified.hasMapping).toBe(true);
    expect(verified.hasReadiness).toBe(true);
    expect(verified.graph.modelId).toBe(MODEL);
    expect(verified.graph.projectId).toBe(PROJECT);

    const bare = validateRulesInput({ graph, version: 1, profile: "LIGHT", ruleset: LIGHT_SET });
    expect(bare.hasMapping).toBe(false);
    expect(bare.hasReadiness).toBe(false);
    void emptyTestMapping;
  });
});
